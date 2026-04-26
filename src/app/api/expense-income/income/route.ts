import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addIncome, deleteIncome, getIncomeForMonth, updateIncome } from "@/lib/expense-tracker";

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

  const income = await getIncomeForMonth(monthId);
  return NextResponse.json({ income });
}

export async function POST(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const body = await req.json();
  const monthId = Number(body.monthId);
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const expectedAmount = Number(body.expected_amount || 0);
  const receivedAmount = Number(body.received_amount || 0);
  const incomeType = typeof body.income_type === "string" ? body.income_type : "manual";

  if (!monthId || !source) {
    return NextResponse.json({ error: "monthId and source required" }, { status: 400 });
  }

  const id = await addIncome(monthId, source, expectedAmount, receivedAmount, incomeType);
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

  await updateIncome(id, {
    source: typeof body.source === "string" ? body.source : undefined,
    expected_amount: typeof body.expected_amount === "number" ? body.expected_amount : undefined,
    received_amount: typeof body.received_amount === "number" ? body.received_amount : undefined,
    income_type: typeof body.income_type === "string" ? body.income_type : undefined,
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

  await deleteIncome(id);
  return NextResponse.json({ ok: true });
}
