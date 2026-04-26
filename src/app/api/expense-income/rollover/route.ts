import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rolloverMonth } from "@/lib/expense-tracker";

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const body = await req.json();
  const fromMonthId = Number(body.fromMonthId);
  const toYear = Number(body.toYear);
  const toMonth = Number(body.toMonth);

  if (!fromMonthId || !toYear || !toMonth || toMonth < 1 || toMonth > 12) {
    return NextResponse.json({ error: "fromMonthId, toYear and toMonth required" }, { status: 400 });
  }

  const result = await rolloverMonth(fromMonthId, toYear, toMonth);
  return NextResponse.json(result);
}
