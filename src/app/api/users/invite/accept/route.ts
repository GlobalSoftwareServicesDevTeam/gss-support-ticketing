import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET: validate invite token
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      inviteToken: token,
      isDeleted: false,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      inviteExpiresAt: true,
      emailConfirmed: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
  }

  if (user.emailConfirmed) {
    return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
  }

  if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
}

// POST: accept invitation — set password, company info, sign legal
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    token,
    username,
    password,
    phoneNumber,
    company,
    companyRegNo,
    companyVatNo,
    companyAddress,
    position,
    legalAccepted,
  } = body;

  if (!token || !username || !password) {
    return NextResponse.json({ error: "token, username, and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  if (!legalAccepted) {
    return NextResponse.json({ error: "You must accept the terms and conditions" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      inviteToken: token,
      isDeleted: false,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
  }

  if (user.emailConfirmed) {
    return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
  }

  if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  // Check username availability
  const existingUsername = await prisma.user.findFirst({
    where: { username, id: { not: user.id } },
  });
  if (existingUsername) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      username,
      passwordHash,
      phoneNumber: phoneNumber || null,
      company: company || null,
      companyRegNo: companyRegNo || null,
      companyVatNo: companyVatNo || null,
      companyAddress: companyAddress || null,
      position: position || null,
      emailConfirmed: true,
      inviteToken: null,
      inviteExpiresAt: null,
      legalAcceptedAt: new Date(),
      legalDocVersion: "1.0",
    },
  });

  return NextResponse.json({ message: "Account setup complete. You can now log in." });
}
