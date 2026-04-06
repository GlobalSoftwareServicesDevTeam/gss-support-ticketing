import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyTotpToken, verifyBackupCode } from "@/lib/totp";

// POST /api/auth/2fa/verify – check if user needs 2FA and/or verify TOTP
// Called during login flow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, totpToken, backupCode } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Credentials required" }, { status: 400 });
  }

  // Look up the user
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }],
      isDeleted: false,
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      emailConfirmed: true,
      totpEnabled: true,
      totpSecret: true,
      totpBackupCodes: true,
    },
  });

  if (!user || !user.emailConfirmed) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // User doesn't have 2FA enabled — no challenge needed
  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ requires2FA: false });
  }

  // User has 2FA but no token provided — send challenge
  if (!totpToken && !backupCode) {
    return NextResponse.json({ requires2FA: true });
  }

  // Verify TOTP token
  if (totpToken) {
    const valid = verifyTotpToken(user.totpSecret, totpToken);
    if (!valid) {
      return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
    }
    return NextResponse.json({ requires2FA: false, verified: true });
  }

  // Verify backup code
  if (backupCode && user.totpBackupCodes) {
    const result = verifyBackupCode(user.totpBackupCodes, backupCode);
    if (!result.valid) {
      return NextResponse.json({ error: "Invalid backup code" }, { status: 401 });
    }

    // Update remaining backup codes
    if (result.remainingEncrypted) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpBackupCodes: result.remainingEncrypted },
      });
    }

    return NextResponse.json({ requires2FA: false, verified: true });
  }

  return NextResponse.json({ error: "Authentication code required" }, { status: 401 });
}
