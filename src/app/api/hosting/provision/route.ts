import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  isPleskConfigured,
  findCustomerByEmail,
  createCustomer,
  createSubscription,
} from "@/lib/plesk";
import {
  isInvoiceNinjaConfigured,
  findClientByEmail,
  createClient,
  createRecurringInvoice,
  startRecurringInvoice,
  createProformaInvoice,
} from "@/lib/invoice-ninja";

// POST: provision a hosting order (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { orderId } = body;

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const order = await prisma.hostingOrder.findUnique({
    where: { id: orderId },
    include: {
      product: true,
      user: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!["PAID", "PENDING", "QUOTED"].includes(order.status)) {
    return NextResponse.json(
      { error: `Cannot provision an order with status ${order.status}` },
      { status: 400 }
    );
  }

  const results: Record<string, unknown> = {};

  // ─── Step 1: Ensure Invoice Ninja billing account ──────
  if (isInvoiceNinjaConfigured()) {
    try {
      let clientId = order.user.invoiceNinjaClientId;

      if (!clientId) {
        // Try to find existing client by email
        const existing = await findClientByEmail(order.user.email);
        if (existing) {
          clientId = existing.id;
        } else {
          // Create new client
          const newClient = await createClient({
            name: `${order.user.firstName} ${order.user.lastName}`,
            email: order.user.email,
            firstName: order.user.firstName,
            lastName: order.user.lastName,
            phone: order.user.phoneNumber || undefined,
            company: order.user.company || undefined,
            address: order.user.companyAddress || undefined,
            vatNumber: order.user.companyVatNo || undefined,
          });
          clientId = newClient.id;
        }

        // Save to user
        await prisma.user.update({
          where: { id: order.user.id },
          data: { invoiceNinjaClientId: clientId },
        });
        results.billingAccountCreated = true;
      }

      // Create proforma invoice for first payment
      if (order.amount) {
        const desc = order.domain
          ? `Hosting: ${order.product?.name || order.orderType} - ${order.domain}`
          : `${order.product?.name || order.orderType}`;

        const proforma = await createProformaInvoice({
          clientId,
          amount: Number(order.amount),
          description: desc,
        });
        results.proformaInvoiceId = proforma.id;
        results.proformaInvoiceNumber = proforma.number;

        // Create recurring invoice for ongoing billing
        const recurring = await createRecurringInvoice({
          clientId,
          amount: Number(order.amount),
          description: desc,
        });
        await startRecurringInvoice(recurring.id);
        results.recurringInvoiceId = recurring.id;

        await prisma.hostingOrder.update({
          where: { id: order.id },
          data: {
            invoiceNinjaInvoiceId: proforma.id,
            recurringInvoiceId: recurring.id,
          },
        });
      }
    } catch (err) {
      results.billingError = String(err);
    }
  }

  // ─── Step 2: Provision on Plesk ──────────────────────
  if (isPleskConfigured() && order.domain && order.product?.pleskPlanName) {
    try {
      // Find or create Plesk customer
      let pleskCustomer = await findCustomerByEmail(order.user.email);

      if (!pleskCustomer) {
        pleskCustomer = await createCustomer({
          name: `${order.user.firstName} ${order.user.lastName}`,
          login: order.user.email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").substring(0, 16),
          password: randomBytes(8).toString("base64url"),
          email: order.user.email,
          company: order.user.company || undefined,
        });
        results.pleskCustomerCreated = true;
      }

      results.pleskCustomerId = pleskCustomer.id;

      // Create subscription
      const subscription = await createSubscription({
        customerId: pleskCustomer.id,
        domain: order.domain,
        planName: order.product.pleskPlanName,
      });

      results.pleskSubscriptionId = subscription.id;

      await prisma.hostingOrder.update({
        where: { id: order.id },
        data: {
          pleskSubscriptionId: String(subscription.id),
          status: "ACTIVE",
          provisionedAt: new Date(),
        },
      });
    } catch (err) {
      results.pleskError = String(err);
      // Mark as failed if provisioning failed
      await prisma.hostingOrder.update({
        where: { id: order.id },
        data: { status: "FAILED" },
      });
    }
  } else {
    // No Plesk - just mark as provisioning for manual completion
    await prisma.hostingOrder.update({
      where: { id: order.id },
      data: { status: "PROVISIONING" },
    });
  }

  return NextResponse.json({
    message: "Provisioning initiated",
    orderId: order.id,
    ...results,
  });
}
