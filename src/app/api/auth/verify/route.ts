import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Invalid verification link" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { activationCode: code },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
  }

  if (user.emailConfirmed) {
    return NextResponse.redirect(new URL("/login?verified=already", req.url));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailConfirmed: true, activationCode: null },
  });

  return NextResponse.redirect(new URL("/login?verified=true", req.url));
}
