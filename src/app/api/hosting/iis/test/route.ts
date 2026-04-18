import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testIisConnection } from "@/lib/iis";

// POST: Test IIS API connection
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await testIisConnection();
  return NextResponse.json(result);
}
