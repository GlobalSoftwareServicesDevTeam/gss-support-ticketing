import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { headers } from "next/headers";

// GET /api/quotes/respond?token=xxx – get quote data for public page
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const quote = await prisma.quote.findUnique({
    where: { token },
    select: {
      id: true,
      quoteNo: true,
      title: true,
      description: true,
      lineItems: true,
      amount: true,
      taxRate: true,
      taxAmount: true,
      totalAmount: true,
      validUntil: true,
      notes: true,
      quoteStatus: true,
      clientName: true,
      clientEmail: true,
      clientCompany: true,
      clientSignature: true,
      clientSignedAt: true,
      clientSignedName: true,
      declineReason: true,
      createdAt: true,
      customer: { select: { company: true } },
      project: { select: { projectName: true } },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Invalid or expired quote link" }, { status: 404 });
  }

  // Mark as viewed if still SENT
  if (quote.quoteStatus === "SENT") {
    await prisma.quote.update({
      where: { token },
      data: { quoteStatus: "VIEWED" },
    });
    quote.quoteStatus = "VIEWED";
  }

  return NextResponse.json(quote);
}

// POST /api/quotes/respond – accept or decline quote with signature
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, action, signature, signedName, declineReason } = body;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  if (!action || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Action must be 'accept' or 'decline'" }, { status: 400 });
  }

  const quote = await prisma.quote.findUnique({ where: { token } });
  if (!quote) {
    return NextResponse.json({ error: "Invalid or expired quote link" }, { status: 404 });
  }

  if (quote.quoteStatus === "ACCEPTED" || quote.quoteStatus === "DECLINED") {
    return NextResponse.json(
      { error: `This quote has already been ${quote.quoteStatus.toLowerCase()}` },
      { status: 409 }
    );
  }

  // Check expiry
  if (quote.validUntil && new Date(quote.validUntil) < new Date()) {
    await prisma.quote.update({
      where: { token },
      data: { quoteStatus: "EXPIRED" },
    });
    return NextResponse.json({ error: "This quote has expired" }, { status: 410 });
  }

  // Get client IP
  const hdrs = await headers();
  const clientIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    null;

  if (action === "accept") {
    if (!signature) {
      return NextResponse.json({ error: "Signature is required to accept the quote" }, { status: 400 });
    }
    if (!signedName) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }

    await prisma.quote.update({
      where: { token },
      data: {
        quoteStatus: "ACCEPTED",
        clientSignature: signature,
        clientSignedAt: new Date(),
        clientSignedName: signedName,
        clientIp: clientIp,
      },
    });

    logAudit({
      action: "ACCEPT",
      entity: "QUOTE",
      entityId: quote.id,
      description: `Quote ${quote.quoteNo} accepted by ${signedName} (${quote.clientEmail})`,
    });
  } else {
    await prisma.quote.update({
      where: { token },
      data: {
        quoteStatus: "DECLINED",
        declineReason: declineReason || null,
        clientIp: clientIp,
      },
    });

    logAudit({
      action: "DECLINE",
      entity: "QUOTE",
      entityId: quote.id,
      description: `Quote ${quote.quoteNo} declined by ${quote.clientName || quote.clientEmail}${declineReason ? `: ${declineReason}` : ""}`,
    });
  }

  return NextResponse.json({ ok: true });
}
