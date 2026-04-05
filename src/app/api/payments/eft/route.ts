import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: active bank details (any authenticated user)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const details = await prisma.eftBankDetail.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(details);
}

// POST: create bank details (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { bankName, accountName, accountNumber, branchCode, accountType, swiftCode, reference } = body;

  if (!bankName || !accountName || !accountNumber || !branchCode) {
    return NextResponse.json({ error: "bankName, accountName, accountNumber, and branchCode are required" }, { status: 400 });
  }

  const detail = await prisma.eftBankDetail.create({
    data: {
      bankName,
      accountName,
      accountNumber,
      branchCode,
      accountType: accountType || null,
      swiftCode: swiftCode || null,
      reference: reference || null,
    },
  });

  return NextResponse.json(detail, { status: 201 });
}
