import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addExpense, deleteExpense, getExpensesForMonth, updateExpense } from "@/lib/expense-tracker";

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const monthId = Number(req.nextUrl.searchParams.get("monthId"));
  if (!monthId) {
    return NextResponse.json({ error: "monthId required" }, { status: 400 });
  }

  const expenses = await getExpensesForMonth(monthId);
  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const body = await req.json();
  const monthId = Number(body.monthId);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const expectedAmount = Number(body.expected_amount || 0);
  const paidAmount = Number(body.paid_amount || 0);
  const isRecurring = body.is_recurring === false ? 0 : 1;

  if (!monthId || !name) {
    return NextResponse.json({ error: "monthId and name required" }, { status: 400 });
  }

  const id = await addExpense(monthId, name, expectedAmount, paidAmount, isRecurring);
  return NextResponse.json({ id });
}

export async function PUT(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const body = await req.json();
  const id = Number(body.id);
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await updateExpense(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    expected_amount: typeof body.expected_amount === "number" ? body.expected_amount : undefined,
    paid_amount: typeof body.paid_amount === "number" ? body.paid_amount : undefined,
    is_recurring: typeof body.is_recurring === "number" ? body.is_recurring : undefined,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await deleteExpense(id);
  return NextResponse.json({ ok: true });
}
