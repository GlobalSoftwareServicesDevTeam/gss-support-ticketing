import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/** DELETE /api/client-repos/[id] — remove a client repo link */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  const link = await prisma.clientGitHubLink.findUnique({ where: { id } });
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Only owner or admin can delete
  if (!isAdmin && link.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.clientGitHubLink.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
