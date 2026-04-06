import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// DELETE: unassign a customer from a repo
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; customerId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, customerId } = await params;

  const assignment = await prisma.customerRepo.findUnique({
    where: { customerId_repoId: { customerId, repoId: id } },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  await prisma.customerRepo.delete({ where: { id: assignment.id } });

  return NextResponse.json({ success: true });
}
