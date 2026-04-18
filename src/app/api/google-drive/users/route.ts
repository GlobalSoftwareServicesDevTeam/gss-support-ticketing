import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/** GET /api/google-drive/users — list users with their Drive folder status (admin only) */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      googleDriveFolderId: true,
    },
    orderBy: { firstName: "asc" },
  });

  return NextResponse.json(users);
}
