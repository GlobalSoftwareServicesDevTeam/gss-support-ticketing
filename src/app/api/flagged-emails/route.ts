import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list flagged emails (admin only)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "PENDING";

  const flagged = await prisma.flaggedEmail.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { receivedAt: "desc" },
  });

  const total = await prisma.flaggedEmail.count({
    where: { status: "PENDING" },
  });

  return NextResponse.json({ flagged, pendingCount: total });
}
