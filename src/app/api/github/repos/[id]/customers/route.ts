import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list customers assigned to this repo
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assignments = await prisma.customerRepo.findMany({
    where: { repoId: id },
    include: { customer: { select: { id: true, company: true, emailAddress: true } } },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json(assignments);
}

// POST: assign a customer to this repo
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { customerId } = await req.json();

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  // Check repo exists
  const repo = await prisma.gitHubRepo.findUnique({ where: { id } });
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Check customer exists
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Check not already assigned
  const existing = await prisma.customerRepo.findUnique({
    where: { customerId_repoId: { customerId, repoId: id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already assigned" }, { status: 409 });
  }

  const assignment = await prisma.customerRepo.create({
    data: {
      customerId,
      repoId: id,
      assignedBy: session.user.id,
    },
    include: { customer: { select: { id: true, company: true, emailAddress: true } } },
  });

  return NextResponse.json(assignment, { status: 201 });
}
