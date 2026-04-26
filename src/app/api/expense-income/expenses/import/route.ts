import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addExpense } from "@/lib/expense-tracker";
import { parse } from "csv-parse/sync";

function parseBool(val: string) {
  if (typeof val !== "string") return 0;
  return ["1", "true", "yes", "y"].includes(val.trim().toLowerCase()) ? 1 : 0;
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const monthId = Number(req.nextUrl.searchParams.get("monthId"));
  if (!file || !monthId) {
    return NextResponse.json({ error: "File and monthId required" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let records: any[] = [];
  let headers: string[] = [];
  try {
    records = parse(buf, { columns: true, skip_empty_lines: true });
    headers = Object.keys(records[0] || {});
  } catch {
    return NextResponse.json({ error: "Failed to parse CSV" }, { status: 400 });
  }
  // Preview first 5 rows
  const preview = records.slice(0, 5);
  // Auto-mapping: try to match common names
  const autoMapping: Record<string, string> = {};
  for (const field of ["name", "expected_amount", "paid_amount", "is_recurring"]) {
    const match = headers.find((h) => h.replace(/\s+/g, "").replace(/-/g, "").toLowerCase().includes(field.replace(/_/g, "")));
    if (match) autoMapping[field] = match;
  }
  return NextResponse.json({ headers, preview, autoMapping, totalRows: records.length });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const monthId = Number(formData.get("monthId"));
  const mapping = JSON.parse(formData.get("columnMapping") as string || "{}");
  if (!file || !monthId || !mapping.name) {
    return NextResponse.json({ error: "File, monthId, and name mapping required" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let records: any[] = [];
  try {
    records = parse(buf, { columns: true, skip_empty_lines: true });
  } catch {
    return NextResponse.json({ error: "Failed to parse CSV" }, { status: 400 });
  }
  let imported = 0, errors = 0, details: any[] = [];
  for (let i = 0; i < records.length; ++i) {
    const row = records[i];
    const name = row[mapping.name]?.trim();
    if (!name) {
      errors++;
      details.push({ row: i + 2, name: "", error: "Name required" });
      continue;
    }
    const expected = Number(row[mapping.expected_amount] || 0);
    const paid = Number(row[mapping.paid_amount] || 0);
    const recurring = mapping.is_recurring ? parseBool(row[mapping.is_recurring]) : 1;
    try {
      await addExpense(monthId, name, expected, paid, recurring);
      imported++;
    } catch (e: any) {
      errors++;
      details.push({ row: i + 2, name, error: e?.message || "Failed to import" });
    }
  }
  return NextResponse.json({ imported, errors, total: records.length, details });
}
