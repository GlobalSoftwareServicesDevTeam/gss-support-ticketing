import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listServicePlansDetailed, testConnection } from "@/lib/plesk";

// GET /api/plesk/plans — fetch plans from Plesk
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const plans = await listServicePlansDetailed();
    return NextResponse.json(plans);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Plesk plans" },
      { status: 500 }
    );
  }
}

// POST /api/plesk/plans — test Plesk connection
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await testConnection();
  return NextResponse.json(result);
}
