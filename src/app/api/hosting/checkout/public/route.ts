import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

const ALLOWED_ORIGINS = [
  "https://globalsoftwareservices.co.za",
  "https://www.globalsoftwareservices.co.za",
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// POST: Public (guest) checkout — finds or creates user by email, then processes order
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json();
    const {
      // Contact info
      firstName,
      lastName,
      email,
      phone,
      company,
      // Order info
      productId,
      billingCycle,
      domainOption,
      domain,
      domainProductId,
      eppKey,
      gateway,
    } = body as {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      company?: string;
      productId: string;
      billingCycle: "monthly" | "annual";
      domainOption: "own" | "register" | "transfer";
      domain: string;
      domainProductId?: string;
      eppKey?: string;
      gateway: "PAYFAST" | "OZOW" | "EFT";
    };

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "firstName, lastName, and email are required" }, { status: 400, headers: corsHeaders(origin) });
    }
    if (!productId || !domain || !domainOption || !gateway) {
      return NextResponse.json({ error: "productId, domain, domainOption, and gateway are required" }, { status: 400, headers: corsHeaders(origin) });
    }
    if (!["PAYFAST", "OZOW", "EFT"].includes(gateway)) {
      return NextResponse.json({ error: "Invalid gateway" }, { status: 400, headers: corsHeaders(origin) });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400, headers: corsHeaders(origin) });
    }

    const cleanDomain = domain
      .trim()
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, "");
    if (!cleanDomain) {
      return NextResponse.json({ error: "Valid domain is required" }, { status: 400, headers: corsHeaders(origin) });
    }

    // Validate hosting product
    const product = await prisma.hostingProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isActive || product.type !== "HOSTING") {
      return NextResponse.json({ error: "Invalid hosting product" }, { status: 400, headers: corsHeaders(origin) });
    }

    // Calculate prices
    const hostingPrice =
      billingCycle === "annual" && product.annualPrice
        ? Number(product.annualPrice)
        : Number(product.monthlyPrice);
    const setupFee = Number(product.setupFee) || 0;

    let domainPrice = 0;
    let domainProduct = null;
    if ((domainOption === "register" || domainOption === "transfer") && domainProductId) {
      domainProduct = await prisma.hostingProduct.findUnique({ where: { id: domainProductId } });
      if (domainProduct && domainProduct.isActive) {
        domainPrice = Number(domainProduct.monthlyPrice);
      }
    }

    const totalAmount = hostingPrice + setupFee + domainPrice;
    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Invalid total amount" }, { status: 400, headers: corsHeaders(origin) });
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Generate a temporary username from email
      const baseUsername = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      let username = baseUsername;
      let suffix = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${suffix++}`;
      }

      // Hash a random placeholder password — user must reset via support portal
      const randomPw = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const passwordHash = await bcrypt.hash(randomPw, 10);

      user = await prisma.user.create({
        data: {
          email,
          username,
          passwordHash,
          firstName,
          lastName,
          phoneNumber: phone || null,
          company: company || null,
          role: "USER",
          emailConfirmed: false,
          passwordReset: true, // Force password reset on first login
        },
      });
    } else {
      // Update contact info if changed
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          phoneNumber: phone || user.phoneNumber,
          company: company || user.company,
        },
      });
    }

    // Create hosting order
    const hostingOrder = await prisma.hostingOrder.create({
      data: {
        orderType: "HOSTING",
        domain: cleanDomain,
        productId: product.id,
        amount: hostingPrice,
        period: billingCycle === "annual" ? 12 : 1,
        userId: user.id,
        notes: `Billing: ${billingCycle}${setupFee > 0 ? `, Setup fee: R${setupFee.toFixed(2)}` : ""} | Website checkout`,
      },
    });

    // Create domain order if needed
    let domainOrder = null;
    if (domainOption === "register" || domainOption === "transfer") {
      domainOrder = await prisma.hostingOrder.create({
        data: {
          orderType: domainOption === "register" ? "DOMAIN_REGISTER" : "DOMAIN_TRANSFER",
          domain: cleanDomain,
          productId: domainProduct?.id || null,
          amount: domainPrice || null,
          period: 12,
          userId: user.id,
          notes: domainOption === "transfer" && eppKey ? `EPP Key: ${eppKey}` : null,
        },
      });
    }

    const metadata: Record<string, string> = {
      hostingOrderId: hostingOrder.id,
      checkoutType: "hosting_website",
    };
    if (domainOrder) metadata.domainOrderId = domainOrder.id;

    // Invoice Ninja billing
    let invoiceNinjaInvoiceId: string | null = null;
    let recurringInvoiceId: string | null = null;

    if (isInvoiceNinjaConfigured()) {
      try {
        let clientId = user.invoiceNinjaClientId || null;
        if (!clientId) {
          const existing = await findClientByEmail(email);
          if (existing) {
            clientId = existing.id;
          } else {
            const newClient = await createClient({
              name: `${firstName} ${lastName}`,
              email,
              firstName,
              lastName,
            });
            clientId = newClient.id;
          }
          await prisma.user.update({
            where: { id: user.id },
            data: { invoiceNinjaClientId: clientId },
          });
        }

        const lineItems: { description: string; amount: number }[] = [];
        lineItems.push({
          description: `${product.name} - ${cleanDomain} (${billingCycle})`,
          amount: hostingPrice,
        });
        if (setupFee > 0) {
          lineItems.push({ description: `Setup Fee - ${product.name}`, amount: setupFee });
        }
        if (domainPrice > 0 && domainProduct) {
          lineItems.push({
            description: `${domainOption === "register" ? "Domain Registration" : "Domain Transfer"}: ${cleanDomain}`,
            amount: domainPrice,
          });
        }

        const proforma = await createProformaInvoice({
          clientId,
          amount: totalAmount,
          description: lineItems.map((l) => `${l.description}: R${l.amount.toFixed(2)}`).join("\n"),
        });
        invoiceNinjaInvoiceId = proforma.id;

        const recurringAmount =
          billingCycle === "annual" && product.annualPrice
            ? Number(product.annualPrice)
            : Number(product.monthlyPrice);
        const recurring = await createRecurringInvoice({
          clientId,
          amount: recurringAmount,
          description: `${product.name} - ${cleanDomain}`,
          frequencyId: billingCycle === "annual" ? 8 : 5,
        });
        await startRecurringInvoice(recurring.id);
        recurringInvoiceId = recurring.id;

        await prisma.hostingOrder.update({
          where: { id: hostingOrder.id },
          data: { invoiceNinjaInvoiceId, recurringInvoiceId },
        });
      } catch (err) {
        console.error("Invoice Ninja checkout error:", err);
      }
    }

    const description = `Hosting: ${product.name} - ${cleanDomain}${
      domainPrice > 0 ? ` + Domain ${domainOption}` : ""
    }`;

    const payment = await prisma.payment.create({
      data: {
        gateway,
        amount: totalAmount,
        description,
        invoiceNumber: invoiceNinjaInvoiceId || null,
        customerEmail: email,
        customerName: `${firstName} ${lastName}`,
        status: gateway === "EFT" ? "PENDING" : "PROCESSING",
        userId: user.id,
        metadata: JSON.stringify(metadata),
      },
    });

    logAudit({
      action: "CHECKOUT",
      entity: "HOSTING_ORDER",
      entityId: hostingOrder.id,
      description: `Website checkout: ${product.name} for ${cleanDomain} (R${totalAmount.toFixed(2)} via ${gateway})`,
      userId: user.id,
      userName: `${firstName} ${lastName}`,
      metadata: { hostingOrderId: hostingOrder.id, totalAmount, gateway, billingCycle },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";

    if (gateway === "PAYFAST") {
      if (!isPayfastConfigured()) {
        return NextResponse.json({ error: "PayFast not configured" }, { status: 400, headers: corsHeaders(origin) });
      }
      const formData = buildPayfastForm(
        {
          amount: totalAmount,
          itemName: description,
          invoiceNumber: invoiceNinjaInvoiceId || undefined,
          customerEmail: email,
          customerFirstName: firstName,
          customerLastName: lastName,
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
      }, { headers: corsHeaders(origin) });
    }

    if (gateway === "OZOW") {
      if (!isOzowConfigured()) {
        return NextResponse.json({ error: "Ozow not configured" }, { status: 400, headers: corsHeaders(origin) });
      }
      const ozowData = buildOzowPaymentUrl(
        {
          amount: totalAmount,
          transactionRef: payment.id,
          bankRef: invoiceNinjaInvoiceId || payment.id.slice(0, 16),
          customerEmail: email,
        },
        baseUrl
      );
      return NextResponse.json({
        paymentId: payment.id,
        hostingOrderId: hostingOrder.id,
        domainOrderId: domainOrder?.id,
        gateway: "OZOW",
        redirect: ozowData,
      }, { headers: corsHeaders(origin) });
    }

    // EFT
    return NextResponse.json({
      paymentId: payment.id,
      hostingOrderId: hostingOrder.id,
      domainOrderId: domainOrder?.id,
      gateway: "EFT",
      message:
        "Your order has been received. Please use the bank details provided to complete your EFT payment. Your hosting will be provisioned once payment is confirmed.",
    }, { headers: corsHeaders(origin) });
  } catch (err) {
    console.error("Public hosting checkout error:", err);
    return NextResponse.json({ error: "Checkout failed. Please try again." }, { status: 500, headers: corsHeaders(origin) });
  }
}

export const dynamic = "force-dynamic";
