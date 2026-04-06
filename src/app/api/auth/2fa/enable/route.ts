import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { verifyTotpToken, generateBackupCodes, encryptBackupCodes } from "@/lib/totp";
import { logAudit } from "@/lib/audit";

// POST /api/auth/2fa/enable – verify TOTP token and enable 2FA
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "TOTP token is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });

  if (!user || !user.totpSecret) {
    return NextResponse.json({ error: "2FA setup not initiated. Run setup first." }, { status: 400 });
  }

  if (user.totpEnabled) {
    return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
  }

  // Verify the token against the stored secret
  const valid = verifyTotpToken(user.totpSecret, token);
  if (!valid) {
    return NextResponse.json({ error: "Invalid verification code. Please try again." }, { status: 400 });
  }

  // Generate backup codes
  const { codes, hashedCodes } = generateBackupCodes();
  const encryptedCodes = encryptBackupCodes(hashedCodes);

  // Enable 2FA
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      totpEnabled: true,
      totpBackupCodes: encryptedCodes,
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "USER",
    entityId: session.user.id,
    description: "Enabled two-factor authentication",
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({
    success: true,
    backupCodes: codes, // Show backup codes only once
  });
}
