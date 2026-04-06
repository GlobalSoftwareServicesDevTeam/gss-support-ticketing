import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail, quoteNotificationTemplate } from "@/lib/email";

// GET /api/quotes/[id] – get single quote
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, company: true, emailAddress: true } },
      project: { select: { id: true, projectName: true } },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  return NextResponse.json(quote);
}

// PUT /api/quotes/[id] – update quote (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    title,
    description,
    lineItems,
    taxRate,
    validUntil,
    notes,
    clientName,
    clientEmail,
    clientCompany,
    customerId,
    projectId,
    quoteStatus,
  } = body;

  // Recalculate if line items provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (lineItems !== undefined) {
    const parsedItems = Array.isArray(lineItems) ? lineItems : [];
    let subtotal = 0;
    for (const item of parsedItems) {
      subtotal += (item.qty || 0) * (item.unitPrice || 0);
    }
    const rate = taxRate ?? 15;
    const tax = subtotal * (rate / 100);
    data.lineItems = JSON.stringify(parsedItems);
    data.amount = subtotal;
    data.taxRate = rate;
    data.taxAmount = Math.round(tax * 100) / 100;
    data.totalAmount = Math.round((subtotal + tax) * 100) / 100;
  }

  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description || null;
  if (validUntil !== undefined) data.validUntil = validUntil ? new Date(validUntil) : null;
  if (notes !== undefined) data.notes = notes || null;
  if (clientName !== undefined) data.clientName = clientName || null;
  if (clientEmail !== undefined) data.clientEmail = clientEmail;
  if (clientCompany !== undefined) data.clientCompany = clientCompany || null;
  if (customerId !== undefined) data.customerId = customerId || null;
  if (projectId !== undefined) data.projectId = projectId || null;
  if (quoteStatus !== undefined) data.quoteStatus = quoteStatus;

  const quote = await prisma.quote.update({
    where: { id },
    data,
    include: {
      customer: { select: { id: true, company: true, emailAddress: true } },
      project: { select: { id: true, projectName: true } },
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "QUOTE",
    entityId: id,
    description: `Updated quote ${quote.quoteNo}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(quote);
}

// DELETE /api/quotes/[id] – delete quote (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  await prisma.quote.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "QUOTE",
    entityId: id,
    description: `Deleted quote ${quote.quoteNo}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/quotes/[id] – send quote to client (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  if (action !== "send") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  if (!quote.clientEmail) {
    return NextResponse.json({ error: "No client email set" }, { status: 400 });
  }

  // Build public URL
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://support.globalsoftwareservices.co.za";
  const quoteUrl = `${baseUrl}/quote?token=${quote.token}`;

  const html = quoteNotificationTemplate(
    quote.clientName || quote.clientCompany || "Client",
    quote.quoteNo || "N/A",
    quote.title || "Quote",
    String(quote.totalAmount ?? quote.amount ?? 0),
    quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-ZA") : null,
    quoteUrl
  );

  await sendEmail({
    to: quote.clientEmail,
    subject: `Quote ${quote.quoteNo} from GSS Support`,
    html,
  });

  await prisma.quote.update({
    where: { id },
    data: {
      quoteStatus: "SENT",
      sentAt: new Date(),
      sentBy: session.user.id,
    },
  });

  logAudit({
    action: "SEND",
    entity: "QUOTE",
    entityId: id,
    description: `Sent quote ${quote.quoteNo} to ${quote.clientEmail}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ ok: true, message: "Quote sent successfully" });
}
