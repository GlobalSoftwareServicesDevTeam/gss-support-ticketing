import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list repos accessible to the current user
// Admins see all repos; users see repos assigned to their company's customer
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role: string }).role;
  const company = (session.user as { company?: string }).company;

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

  // For regular users, find their customer by company name match
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
