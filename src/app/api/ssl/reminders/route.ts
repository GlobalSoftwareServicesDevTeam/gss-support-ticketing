import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail, sslExpiryReminderTemplate } from "@/lib/email";
import {
  isInvoiceNinjaConfigured,
  findClientByEmail,
  createClient,
  createProformaInvoice,
} from "@/lib/invoice-ninja";

// POST: process SSL expiry reminders & auto-invoice (admin or cron)
export async function POST(req: NextRequest) {
  // Support both admin session and cron bearer token
  const authHeader = req.headers.get("authorization");
  const cronToken = `Bearer ${process.env.AUTH_SECRET}`;
  const isCron = authHeader === cronToken;

  let userId = "system";
  let userName = "Cron Job";

  if (!isCron) {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = session.user.id;
    userName = session.user.name || "Admin";
  }

  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  // Find ISSUED SSL certificates expiring within 30 days
  const expiringCerts = await prisma.sslCertificate.findMany({
    where: {
      status: "ISSUED",
      validTo: {
        not: null,
        lte: thirtyDaysOut,
        gt: now, // not already expired
      },
    },
    include: {
      order: {
        include: {
          user: true,
          product: true,
        },
      },
    },
  });

  const results: {
    certId: string;
    commonName: string;
    daysLeft: number;
    invoiceCreated: boolean;
    invoiceNumber: string | null;
    reminderSent: boolean;
    error: string | null;
  }[] = [];

  for (const cert of expiringCerts) {
    const expiryDate = cert.validTo!;
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const result = {
      certId: cert.id,
      commonName: cert.commonName,
      daysLeft,
      invoiceCreated: false,
      invoiceNumber: null as string | null,
      reminderSent: false,
      error: null as string | null,
    };

    try {
      // Only send reminder + invoice if we haven't sent one in the last 7 days
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const alreadySent = cert.reminderSentAt && cert.reminderSentAt > sevenDaysAgo;

      if (alreadySent) {
        result.error = "Reminder already sent within last 7 days";
        results.push(result);
        continue;
      }

      // Skip if renewal invoice already exists
      if (cert.renewalInvoiceId) {
        result.error = "Renewal invoice already created";
        results.push(result);
        continue;
      }

      // Determine renewal amount from original order or product
      const renewalAmount = cert.order.product
        ? Number(cert.order.product.monthlyPrice)
        : cert.order.amount
        ? Number(cert.order.amount)
        : null;

      // ─── Auto-invoice via Invoice Ninja ─────────────────
      if (isInvoiceNinjaConfigured() && renewalAmount) {
        try {
          const user = cert.order.user;

          // Ensure Invoice Ninja client exists
          let clientId = user.invoiceNinjaClientId;
          if (!clientId) {
            const existing = await findClientByEmail(user.email);
            if (existing) {
              clientId = existing.id;
            } else {
              const newClient = await createClient({
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phoneNumber || undefined,
                company: user.company || undefined,
                address: user.companyAddress || undefined,
                vatNumber: user.companyVatNo || undefined,
              });
              clientId = newClient.id;
            }
            // Save client ID for future use
            await prisma.user.update({
              where: { id: user.id },
              data: { invoiceNinjaClientId: clientId },
            });
          }

          // Create proforma invoice for SSL renewal
          const dueDate = expiryDate.toISOString().split("T")[0];
          const invoice = await createProformaInvoice({
            clientId,
            amount: renewalAmount,
            description: `SSL Certificate Renewal: ${cert.commonName} (${cert.productType}) — expires ${dueDate}`,
            dueDate,
          });

          result.invoiceCreated = true;
          result.invoiceNumber = invoice.number;

          // Store the renewal invoice ID on the certificate
          await prisma.sslCertificate.update({
            where: { id: cert.id },
            data: {
              renewalInvoiceId: invoice.id,
              reminderSentAt: now,
            },
          });
        } catch (invoiceErr) {
          result.error = `Invoice error: ${invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr)}`;
        }
      }

      // ─── Send email reminder ────────────────────────────
      try {
        const user = cert.order.user;
        const recipientName = `${user.firstName} ${user.lastName}`;
        const expiryStr = expiryDate.toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const html = sslExpiryReminderTemplate(
          recipientName,
          cert.commonName,
          cert.productType,
          expiryStr,
          daysLeft,
          result.invoiceNumber,
          renewalAmount ? renewalAmount.toFixed(2) : null
        );

        await sendEmail({
          to: user.email,
          subject: `SSL Certificate Renewal: ${cert.commonName} expires in ${daysLeft} days`,
          html,
        });

        result.reminderSent = true;

        // Update reminderSentAt if not already done by invoice step
        if (!result.invoiceCreated) {
          await prisma.sslCertificate.update({
            where: { id: cert.id },
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

  // Also mark any expired certs
  await prisma.sslCertificate.updateMany({
    where: {
      status: "ISSUED",
      validTo: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  logAudit({
    action: "SSL_REMINDERS",
    entity: "SSL_CERTIFICATE",
    entityId: "batch",
    description: `Processed ${results.length} SSL expiry reminders. Invoices: ${results.filter((r) => r.invoiceCreated).length}, Emails: ${results.filter((r) => r.reminderSent).length}`,
    userId,
    userName,
    metadata: { totalProcessed: results.length, results },
  });

  return NextResponse.json({
    processed: results.length,
    invoicesCreated: results.filter((r) => r.invoiceCreated).length,
    remindersSent: results.filter((r) => r.reminderSent).length,
    results,
  });
}

// GET: list SSL certificates expiring soon (for dashboard/admin)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sixtyDaysOut = new Date(now);
  sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

  const where: Record<string, unknown> = {
    status: "ISSUED",
    validTo: {
      not: null,
      lte: sixtyDaysOut,
    },
  };

  // Non-admins can only see their own
  if (session.user.role !== "ADMIN") {
    where.order = { userId: session.user.id };
  }

  const expiringCerts = await prisma.sslCertificate.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          domain: true,
          amount: true,
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          product: { select: { name: true, monthlyPrice: true } },
        },
      },
    },
    orderBy: { validTo: "asc" },
  });

  const certs = expiringCerts.map((cert) => {
    const expiry = cert.validTo!;
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: cert.id,
      commonName: cert.commonName,
      productType: cert.productType,
      validTo: expiry.toISOString(),
      daysLeft,
      expired: daysLeft <= 0,
      amount: cert.order.product
        ? Number(cert.order.product.monthlyPrice)
        : cert.order.amount
        ? Number(cert.order.amount)
        : null,
      user: cert.order.user,
      reminderSentAt: cert.reminderSentAt?.toISOString() || null,
      renewalInvoiceId: cert.renewalInvoiceId,
      orderId: cert.order.id,
    };
  });

  return NextResponse.json(certs);
}
