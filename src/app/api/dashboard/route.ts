import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    totalIssues,
    openIssues,
    inProgressIssues,
    closedIssues,
    totalUsers,
    totalProjects,
    recentIssues,
  ] = await Promise.all([
    prisma.issue.count(),
    prisma.issue.count({ where: { status: "OPEN" } }),
    prisma.issue.count({ where: { status: "IN_PROGRESS" } }),
    prisma.issue.count({ where: { status: "CLOSED" } }),
    prisma.user.count(),
    prisma.project.count(),
    prisma.issue.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true } },
        customer: { select: { contactPerson: true, company: true } },
      },
    }),
  ]);

  return NextResponse.json({
    totalIssues,
    openIssues,
    inProgressIssues,
    closedIssues,
    totalUsers,
    totalProjects,
    recentIssues,
  });
}
