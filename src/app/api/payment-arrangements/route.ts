import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import { getCustomerUserIds } from "@/lib/customer-users";

// GET: list payment arrangements
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (ctx && ctx.permissions.billing) {
      const customerUserIds = await getCustomerUserIds(ctx.customerId);
      where.userId = { in: customerUserIds };
    } else {
      where.userId = session.user.id;
    }
  }
  if (status) where.status = status;

  const arrangements = await prisma.paymentArrangement.findMany({
    where,
    include: {
      installments: { orderBy: { installmentNo: "asc" } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(arrangements);
}

// POST: create a new payment arrangement request
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { invoiceNumber, invoiceId, totalAmount, numberOfMonths, reason } = body;

  if (!invoiceNumber || !totalAmount || !numberOfMonths) {
    return NextResponse.json(
      { error: "invoiceNumber, totalAmount, and numberOfMonths are required" },
      { status: 400 }
    );
  }

  const amount = Number(totalAmount);
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid totalAmount" }, { status: 400 });
  }

  const months = Number(numberOfMonths);
  if (months < 1 || months > 3) {
    return NextResponse.json(
      { error: "numberOfMonths must be between 1 and 3" },
      { status: 400 }
    );
  }

  const monthlyAmount = Math.ceil((amount / months) * 100) / 100; // round up to nearest cent

  // Create arrangement with installments
  const arrangement = await prisma.paymentArrangement.create({
    data: {
      invoiceNumber,
      invoiceId: invoiceId || null,
      totalAmount: amount,
      numberOfMonths: months,
      monthlyAmount,
      reason: reason || null,
      userId: session.user.id,
      installments: {
        create: Array.from({ length: months }, (_, i) => {
          const dueDate = new Date();
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          dueDate.setDate(1); // first of month
          // Last installment gets the remainder to handle rounding
          const isLast = i === months - 1;
          const installmentAmount = isLast
            ? Math.round((amount - monthlyAmount * (months - 1)) * 100) / 100
            : monthlyAmount;
          return {
            installmentNo: i + 1,
            amount: installmentAmount,
            dueDate,
          };
        }),
      },
    },
    include: {
      installments: { orderBy: { installmentNo: "asc" } },
    },
  });

  await logAudit({
    action: "CREATE",
    entity: "PAYMENT_ARRANGEMENT",
    entityId: arrangement.id,
    description: `Payment arrangement requested: ${invoiceNumber} - R${amount} over ${months} month(s)`,
    userId: session.user.id,
    userName: session.user.name || "Unknown",
  });

  return NextResponse.json(arrangement, { status: 201 });
}
