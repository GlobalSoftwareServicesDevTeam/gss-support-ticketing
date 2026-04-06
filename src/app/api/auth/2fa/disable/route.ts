import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { verifyTotpToken } from "@/lib/totp";
import { logAudit } from "@/lib/audit";

// POST /api/auth/2fa/disable – disable 2FA (requires current TOTP token)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "TOTP token is required to disable 2FA" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });

  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
  }

  const valid = verifyTotpToken(user.totpSecret, token);
  if (!valid) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: null,
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "USER",
    entityId: session.user.id,
    description: "Disabled two-factor authentication",
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ success: true });
}
