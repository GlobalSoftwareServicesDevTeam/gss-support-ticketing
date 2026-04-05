import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list all blocked senders
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await prisma.blockedSender.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(blocked);
}

// POST: add a blocked sender
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, pattern, reason } = body;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const existing = await prisma.blockedSender.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Sender already blocked" }, { status: 409 });
  }

  const blocked = await prisma.blockedSender.create({
    data: {
      email: email.toLowerCase(),
      pattern: pattern || null,
      reason: reason || null,
      blockedBy: session.user.id,
    },
  });

  return NextResponse.json(blocked, { status: 201 });
}
