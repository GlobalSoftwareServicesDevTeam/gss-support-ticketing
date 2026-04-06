import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateTotpSecret } from "@/lib/totp";
import QRCode from "qrcode";

// POST /api/auth/2fa/setup – generate a new TOTP secret and QR code
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, totpEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.totpEnabled) {
    return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
  }

  const { secret, encryptedSecret, otpauthUrl } = generateTotpSecret(user.email);

  // Store the encrypted secret temporarily (not yet enabled)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: encryptedSecret },
  });

  // Generate QR code as data URL
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({
    qrCode: qrCodeDataUrl,
    secret, // Show the secret so user can manually enter it
  });
}
