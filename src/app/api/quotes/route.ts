import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/quotes – list quotes (admin: all, user: their customer's quotes)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");

  const isAdmin = session.user.role === "ADMIN";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (!isAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cid = (session as any).customerId;
    if (cid) {
      where.customerId = cid;
    } else {
      return NextResponse.json([]);
    }
  }

  if (status) where.quoteStatus = status;
  if (customerId && isAdmin) where.customerId = customerId;

  const quotes = await prisma.quote.findMany({
    where,
    include: {
      customer: { select: { id: true, company: true, emailAddress: true } },
      project: { select: { id: true, projectName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(quotes);
}

// POST /api/quotes – create a new quote (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  } = body;

  if (!title || !clientEmail) {
    return NextResponse.json(
      { error: "Title and client email are required" },
      { status: 400 }
    );
  }

  // Calculate amounts from line items
  let subtotal = 0;
  const parsedItems = Array.isArray(lineItems) ? lineItems : [];
  for (const item of parsedItems) {
    subtotal += (item.qty || 0) * (item.unitPrice || 0);
  }
  const tax = taxRate ? subtotal * (taxRate / 100) : subtotal * 0.15;
  const total = subtotal + tax;

  // Generate quote number
  const count = await prisma.quote.count();
  const quoteNo = `QUO-${String(count + 1).padStart(4, "0")}`;

  const quote = await prisma.quote.create({
    data: {
      quoteNo,
      title,
      description: description || null,
      lineItems: parsedItems.length > 0 ? JSON.stringify(parsedItems) : null,
      amount: subtotal,
      taxRate: taxRate ?? 15,
      taxAmount: Math.round(tax * 100) / 100,
      totalAmount: Math.round(total * 100) / 100,
      validUntil: validUntil ? new Date(validUntil) : null,
      notes: notes || null,
      clientName: clientName || null,
      clientEmail,
      clientCompany: clientCompany || null,
      customerId: customerId || null,
      projectId: projectId || null,
      quoteStatus: "DRAFT",
      createdBy: session.user.id,
    },
    include: {
      customer: { select: { id: true, company: true, emailAddress: true } },
      project: { select: { id: true, projectName: true } },
    },
  });

  logAudit({
    action: "CREATE",
    entity: "QUOTE",
    entityId: quote.id,
    description: `Created quote ${quoteNo}: ${title}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(quote, { status: 201 });
}
