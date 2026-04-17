import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildPayfastForm, isPayfastConfigured } from "@/lib/payfast";
import { buildOzowPaymentUrl, isOzowConfigured } from "@/lib/ozow";
import {
  isInvoiceNinjaConfigured,
  findClientByEmail,
  createClient,
  createProformaInvoice,
  createRecurringInvoice,
  startRecurringInvoice,
} from "@/lib/invoice-ninja";

// POST: Create hosting order + optional domain order, initiate payment
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    productId,
    billingCycle,
    domainOption,
    domain,
    domainProductId,
    eppKey,
    gateway,
  } = body as {
    productId: string;
    billingCycle: "monthly" | "annual";
    domainOption: "own" | "register" | "transfer";
    domain: string;
    domainProductId?: string;
    eppKey?: string;
    gateway: "PAYFAST" | "OZOW" | "EFT";
  };

  // Validate required fields
  if (!productId || !domain || !domainOption || !gateway) {
    return NextResponse.json(
      { error: "productId, domain, domainOption, and gateway are required" },
      { status: 400 }
    );
  }

  if (!["PAYFAST", "OZOW", "EFT"].includes(gateway)) {
    return NextResponse.json({ error: "Invalid gateway" }, { status: 400 });
  }

  // Clean domain
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "");

  if (!cleanDomain) {
    return NextResponse.json({ error: "Valid domain is required" }, { status: 400 });
  }

  // Validate hosting product
  const product = await prisma.hostingProduct.findUnique({
    where: { id: productId },
  });
  if (!product || !product.isActive || product.type !== "HOSTING") {
    return NextResponse.json({ error: "Invalid hosting product" }, { status: 400 });
  }

  // Calculate hosting price
  const hostingPrice =
    billingCycle === "annual" && product.annualPrice
      ? Number(product.annualPrice)
      : Number(product.monthlyPrice);
  const setupFee = Number(product.setupFee) || 0;

  // Calculate domain price if registering or transferring
  let domainPrice = 0;
  let domainProduct = null;
  if ((domainOption === "register" || domainOption === "transfer") && domainProductId) {
    domainProduct = await prisma.hostingProduct.findUnique({
      where: { id: domainProductId },
    });
    if (domainProduct && domainProduct.isActive) {
      domainPrice = Number(domainProduct.monthlyPrice); // Domain products use monthlyPrice as annual price
    }
  }

  // Total first payment
  const totalAmount = hostingPrice + setupFee + domainPrice;

  if (totalAmount <= 0) {
    return NextResponse.json({ error: "Invalid total amount" }, { status: 400 });
  }

  try {
    // Create hosting order
    const hostingOrder = await prisma.hostingOrder.create({
      data: {
        orderType: "HOSTING",
        domain: cleanDomain,
        productId: product.id,
        amount: hostingPrice,
        period: billingCycle === "annual" ? 12 : 1,
        userId: session.user.id,
        notes: `Billing: ${billingCycle}${setupFee > 0 ? `, Setup fee: R${setupFee.toFixed(2)}` : ""}`,
      },
    });

    // Create domain order if registering or transferring
    let domainOrder = null;
    if (domainOption === "register" || domainOption === "transfer") {
      domainOrder = await prisma.hostingOrder.create({
        data: {
          orderType: domainOption === "register" ? "DOMAIN_REGISTER" : "DOMAIN_TRANSFER",
          domain: cleanDomain,
          productId: domainProduct?.id || null,
          amount: domainPrice || null,
          period: 12, // 1 year
          userId: session.user.id,
          notes:
            domainOption === "transfer" && eppKey
              ? `EPP Key: ${eppKey}`
              : null,
        },
      });
    }

    // Build metadata for payment tracking
    const metadata: Record<string, string> = {
      hostingOrderId: hostingOrder.id,
      checkoutType: "hosting",
    };
    if (domainOrder) {
      metadata.domainOrderId = domainOrder.id;
    }

    // Try to set up Invoice Ninja billing
    let invoiceNinjaInvoiceId: string | null = null;
    let recurringInvoiceId: string | null = null;

    if (isInvoiceNinjaConfigured()) {
      try {
        // Fetch full user record for invoiceNinjaClientId
        const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });

        // Find or create Invoice Ninja client
        let clientId = dbUser?.invoiceNinjaClientId || null;
        if (!clientId) {
          const userEmail = session.user.email || "";
          const existing = await findClientByEmail(userEmail);
          if (existing) {
            clientId = existing.id;
          } else {
            const nameParts = (session.user.name || "").split(" ");
            const newClient = await createClient({
              name: session.user.name || userEmail,
              email: userEmail,
              firstName: nameParts[0] || "",
              lastName: nameParts.slice(1).join(" ") || "",
            });
            clientId = newClient.id;
          }
          await prisma.user.update({
            where: { id: session.user.id },
            data: { invoiceNinjaClientId: clientId },
          });
        }

        // Build line items for proforma invoice
        const lineItems: { description: string; amount: number }[] = [];
        lineItems.push({
          description: `${product.name} - ${cleanDomain} (${billingCycle})`,
          amount: hostingPrice,
        });
        if (setupFee > 0) {
          lineItems.push({
            description: `Setup Fee - ${product.name}`,
            amount: setupFee,
          });
        }
        if (domainPrice > 0 && domainProduct) {
          lineItems.push({
            description: `${domainOption === "register" ? "Domain Registration" : "Domain Transfer"}: ${cleanDomain}`,
            amount: domainPrice,
          });
        }

        // Create proforma with total
        const proforma = await createProformaInvoice({
          clientId,
          amount: totalAmount,
          description: lineItems.map((l) => `${l.description}: R${l.amount.toFixed(2)}`).join("\n"),
        });
        invoiceNinjaInvoiceId = proforma.id;

        // Create recurring invoice for hosting only (monthly)
        const recurringAmount =
          billingCycle === "annual" && product.annualPrice
            ? Number(product.annualPrice)
            : Number(product.monthlyPrice);
        const recurring = await createRecurringInvoice({
          clientId,
          amount: recurringAmount,
          description: `${product.name} - ${cleanDomain}`,
          frequencyId: billingCycle === "annual" ? 8 : 5, // 5=monthly, 8=yearly
        });
        await startRecurringInvoice(recurring.id);
        recurringInvoiceId = recurring.id;

        // Update hosting order with invoice IDs
        await prisma.hostingOrder.update({
          where: { id: hostingOrder.id },
          data: {
            invoiceNinjaInvoiceId,
            recurringInvoiceId,
          },
        });
      } catch (err) {
        console.error("Invoice Ninja checkout error:", err);
        // Continue without billing — don't block the payment
      }
    }

    // Create payment record
    const description = `Hosting: ${product.name} - ${cleanDomain}${
      domainPrice > 0 ? ` + Domain ${domainOption}` : ""
    }`;

    const payment = await prisma.payment.create({
      data: {
        gateway,
        amount: totalAmount,
        description,
        invoiceNumber: invoiceNinjaInvoiceId || null,
        customerEmail: session.user.email || "",
        customerName: session.user.name || "",
        status: gateway === "EFT" ? "PENDING" : "PROCESSING",
        userId: session.user.id,
        metadata: JSON.stringify(metadata),
      },
    });

    logAudit({
      action: "CHECKOUT",
      entity: "HOSTING_ORDER",
      entityId: hostingOrder.id,
      description: `Checkout: ${product.name} for ${cleanDomain} (R${totalAmount.toFixed(2)} via ${gateway})`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: {
        hostingOrderId: hostingOrder.id,
        domainOrderId: domainOrder?.id,
        totalAmount,
        gateway,
        billingCycle,
        domainOption,
      },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      "https://support.globalsoftwareservices.co.za";

    // Initiate payment gateway
    if (gateway === "PAYFAST") {
      if (!isPayfastConfigured()) {
        return NextResponse.json({ error: "PayFast not configured" }, { status: 400 });
      }
      const nameParts = (session.user.name || "").split(" ");
      const formData = buildPayfastForm(
        {
          amount: totalAmount,
          itemName: description,
          invoiceNumber: invoiceNinjaInvoiceId || undefined,
          customerEmail: session.user.email || undefined,
          customerFirstName: nameParts[0] || undefined,
          customerLastName: nameParts.slice(1).join(" ") || undefined,
          paymentId: payment.id,
          saveCard: false,
        },
        baseUrl
      );
      return NextResponse.json({
        paymentId: payment.id,
        hostingOrderId: hostingOrder.id,
        domainOrderId: domainOrder?.id,
        gateway: "PAYFAST",
        redirect: formData,
      });
    }

    if (gateway === "OZOW") {
      if (!isOzowConfigured()) {
        return NextResponse.json({ error: "Ozow not configured" }, { status: 400 });
      }
      const ozowData = buildOzowPaymentUrl(
        {
          amount: totalAmount,
          transactionRef: payment.id,
          bankRef: invoiceNinjaInvoiceId || payment.id.slice(0, 16),
          customerEmail: session.user.email || undefined,
        },
        baseUrl
      );
      return NextResponse.json({
        paymentId: payment.id,
        hostingOrderId: hostingOrder.id,
        domainOrderId: domainOrder?.id,
        gateway: "OZOW",
        redirect: ozowData,
      });
    }

    // EFT
    return NextResponse.json({
      paymentId: payment.id,
      hostingOrderId: hostingOrder.id,
      domainOrderId: domainOrder?.id,
      gateway: "EFT",
      message:
        "Please use the bank details provided to complete your EFT payment. Your hosting will be provisioned once payment is confirmed.",
    });
  } catch (err) {
    console.error("Hosting checkout error:", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}
