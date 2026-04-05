import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list all code download logs (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const where = projectId
      ? { codeRelease: { projectId } }
      : {};

    const [logs, total] = await Promise.all([
      prisma.codeDownloadLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
          codeRelease: {
            select: {
              id: true,
              version: true,
              fileName: true,
              project: { select: { id: true, projectName: true } },
            },
          },
        },
        orderBy: { downloadedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.codeDownloadLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit });
  } catch (error) {
    console.error("Download logs GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
