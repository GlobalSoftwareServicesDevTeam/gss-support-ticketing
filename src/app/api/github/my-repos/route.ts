import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCustomerContext } from "@/lib/customer-context";

// GET: list repos accessible to the current user
// Admins see all repos; users see repos assigned to their customer
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role: string }).role;

  if (role === "ADMIN") {
    const repos = await prisma.gitHubRepo.findMany({
      include: {
        customers: {
          include: { customer: { select: { id: true, company: true } } },
        },
      },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json(repos);
  }

  // For regular users, use customer context from JWT session
  const ctx = getCustomerContext(session);
  if (ctx && ctx.permissions.code) {
    const repos = await prisma.gitHubRepo.findMany({
      where: {
        customers: {
          some: { customerId: ctx.customerId },
        },
      },
      include: {
        customers: {
          include: { customer: { select: { id: true, company: true } } },
        },
      },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json(repos);
  }

  // Fallback: try company name match for users not yet linked via customer context
  const company = (session.user as { company?: string }).company;
  if (!company) {
    return NextResponse.json([]);
  }

  const repos = await prisma.gitHubRepo.findMany({
    where: {
      customers: {
        some: {
          customer: { company },
        },
      },
    },
    include: {
      customers: {
        include: { customer: { select: { id: true, company: true } } },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(repos);
}
