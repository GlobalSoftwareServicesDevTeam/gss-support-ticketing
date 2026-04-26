import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllMonths, getCurrentMonth, getOrCreateMonth, setCurrentMonth } from "@/lib/expense-tracker";

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const months = await getAllMonths();
  const current = await getCurrentMonth();
  return NextResponse.json({ months, current });
}

export async function POST(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const body = await req.json();
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "year and month required" }, { status: 400 });
  }

  const targetMonth = await getOrCreateMonth(year, month);
  await setCurrentMonth(targetMonth.id);
  return NextResponse.json({ month: targetMonth });
}
