import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail, domainExpiryReminderTemplate } from "@/lib/email";
import {
  isInvoiceNinjaConfigured,
  findClientByEmail,
  createClient,
  createProformaInvoice,
} from "@/lib/invoice-ninja";

// POST: process domain expiry reminders & auto-invoice (admin only)
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  // Find active domain orders expiring within 30 days that haven't been invoiced yet for renewal
  const expiringOrders = await prisma.hostingOrder.findMany({
    where: {
      orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER"] },
      status: "ACTIVE",
      expiryDate: {
        not: null,
        lte: thirtyDaysOut,
        gt: now, // not already expired
      },
    },
    include: {
      user: true,
      product: true,
    },
  });

  const results: {
    orderId: string;
    domain: string;
    daysLeft: number;
    invoiceCreated: boolean;
    invoiceNumber: string | null;
    reminderSent: boolean;
    error: string | null;
  }[] = [];

  for (const order of expiringOrders) {
    const expiryDate = order.expiryDate!;
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const result = {
      orderId: order.id,
      domain: order.domain || "Unknown",
      daysLeft,
      invoiceCreated: false,
      invoiceNumber: null as string | null,
      reminderSent: false,
      error: null as string | null,
    };

    try {
      // Determine renewal amount from product or existing order amount
      const renewalAmount = order.product
        ? Number(order.product.monthlyPrice)
        : order.amount
        ? Number(order.amount)
        : null;

      // Only send reminder + invoice if we haven't sent one in the last 7 days
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const alreadySent = order.reminderSentAt && order.reminderSentAt > sevenDaysAgo;

      if (alreadySent) {
        result.error = "Reminder already sent within last 7 days";
        results.push(result);
        continue;
      }

      // ─── Auto-invoice via Invoice Ninja ─────────────────
      if (isInvoiceNinjaConfigured() && renewalAmount) {
        try {
          // Ensure Invoice Ninja client exists
          let clientId = order.user.invoiceNinjaClientId;
          if (!clientId) {
            const existing = await findClientByEmail(order.user.email);
            if (existing) {
              clientId = existing.id;
            } else {
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
            // Save client ID for future use
            await prisma.user.update({
              where: { id: order.user.id },
              data: { invoiceNinjaClientId: clientId },
            });
          }

          // Create proforma invoice for domain renewal
          const dueDate = expiryDate.toISOString().split("T")[0];
          const invoice = await createProformaInvoice({
            clientId,
            amount: renewalAmount,
            description: `Domain Renewal: ${order.domain || "domain"} (expires ${dueDate})`,
            dueDate,
          });

          result.invoiceCreated = true;
          result.invoiceNumber = invoice.number;

          // Store the renewal invoice ID on the order
          await prisma.hostingOrder.update({
            where: { id: order.id },
            data: {
              invoiceNinjaInvoiceId: invoice.id,
              reminderSentAt: now,
            },
          });
        } catch (invoiceErr) {
          result.error = `Invoice error: ${invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr)}`;
        }
      }

      // ─── Send email reminder ────────────────────────────
      try {
        const recipientName = `${order.user.firstName} ${order.user.lastName}`;
        const expiryStr = expiryDate.toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const html = domainExpiryReminderTemplate(
          recipientName,
          order.domain || "your domain",
          expiryStr,
          daysLeft,
          result.invoiceNumber,
          renewalAmount ? renewalAmount.toFixed(2) : null
        );

        await sendEmail({
          to: order.user.email,
          subject: `Domain Renewal Reminder: ${order.domain || "your domain"} expires in ${daysLeft} days`,
          html,
        });

        result.reminderSent = true;

        // Update reminderSentAt if not already done by invoice step
        if (!result.invoiceCreated) {
          await prisma.hostingOrder.update({
            where: { id: order.id },
            data: { reminderSentAt: now },
          });
        }
      } catch (emailErr) {
        result.error = (result.error ? result.error + "; " : "") +
          `Email error: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  logAudit({
    action: "DOMAIN_REMINDERS",
    entity: "HOSTING_ORDER",
    entityId: "batch",
    description: `Processed ${results.length} domain expiry reminders. Invoices: ${results.filter((r) => r.invoiceCreated).length}, Emails: ${results.filter((r) => r.reminderSent).length}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { totalProcessed: results.length, results },
  });

  return NextResponse.json({
    processed: results.length,
    invoicesCreated: results.filter((r) => r.invoiceCreated).length,
    remindersSent: results.filter((r) => r.reminderSent).length,
    results,
  });
}

// GET: list domains expiring soon (for dashboard widget)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sixtyDaysOut = new Date(now);
  sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

  const where: Record<string, unknown> = {
    orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER"] },
    status: "ACTIVE",
    expiryDate: {
      not: null,
      lte: sixtyDaysOut,
    },
  };

  // Non-admins only see their own
  if (session.user.role !== "ADMIN") {
    where.userId = session.user.id;
  }

  const expiringDomains = await prisma.hostingOrder.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      product: { select: { name: true, monthlyPrice: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const domains = expiringDomains.map((order) => {
    const expiry = order.expiryDate!;
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: order.id,
      domain: order.domain,
      expiryDate: expiry.toISOString(),
      daysLeft,
      expired: daysLeft <= 0,
      amount: order.product ? Number(order.product.monthlyPrice) : order.amount ? Number(order.amount) : null,
      user: order.user,
      reminderSentAt: order.reminderSentAt?.toISOString() || null,
      invoiceId: order.invoiceNinjaInvoiceId,
    };
  });

  return NextResponse.json(domains);
}
