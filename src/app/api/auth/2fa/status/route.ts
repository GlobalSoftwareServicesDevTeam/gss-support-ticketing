import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/auth/2fa/status – check if 2FA is enabled for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });

  return NextResponse.json({ enabled: user?.totpEnabled || false });
}
