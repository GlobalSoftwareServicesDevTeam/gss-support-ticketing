import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verifyTotpToken, verifyBackupCode } from "@/lib/totp";
import { verifyRecaptcha } from "@/lib/recaptcha";

const TRUST_DURATION_DAYS = 30;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// POST /api/auth/2fa/verify – check if user needs 2FA and/or verify TOTP
// Called during login flow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, totpToken, backupCode, rememberDevice, recaptchaToken } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Credentials required" }, { status: 400 });
  }

  // Verify reCAPTCHA on initial credential check (not on 2FA code entry)
  if (!totpToken && !backupCode) {
    const captcha = await verifyRecaptcha(recaptchaToken, "login");
    if (!captcha.success) {
      return NextResponse.json({ error: captcha.error || "reCAPTCHA verification failed" }, { status: 400 });
    }
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

  // Check for trusted device cookie before requiring 2FA
  const trustCookie = req.cookies.get("device_trust")?.value;
  if (trustCookie) {
    const tokenHash = hashToken(trustCookie);
    const trustedDevice = await prisma.trustedDevice.findFirst({
      where: {
        userId: user.id,
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });
    if (trustedDevice) {
      return NextResponse.json({ requires2FA: false, trusted: true });
    }
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
    return buildTrustResponse(user.id, rememberDevice, req);
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

    return buildTrustResponse(user.id, rememberDevice, req);
  }

  return NextResponse.json({ error: "Authentication code required" }, { status: 401 });
}

async function buildTrustResponse(userId: string, rememberDevice: boolean, req: NextRequest) {
  const res = NextResponse.json({ requires2FA: false, verified: true });

  if (rememberDevice) {
    // Generate a random trust token
    const trustToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(trustToken);
    const expiresAt = new Date(Date.now() + TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const deviceName = req.headers.get("user-agent")?.slice(0, 255) || "Unknown";

    // Store in DB
    await prisma.trustedDevice.create({
      data: { userId, tokenHash, deviceName, expiresAt },
    });

    // Cleanup expired tokens for this user
    await prisma.trustedDevice.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    // Set HTTP-only secure cookie
    res.cookies.set("device_trust", trustToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TRUST_DURATION_DAYS * 24 * 60 * 60,
    });
  }

  return res;
}
