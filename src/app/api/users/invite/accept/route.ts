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

  // First check User table (direct user invites)
  const user = await prisma.user.findFirst({
    where: { inviteToken: token, isDeleted: false },
    select: { id: true, email: true, firstName: true, lastName: true, inviteExpiresAt: true, emailConfirmed: true },
  });

  if (user) {
    if (user.emailConfirmed) {
      return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
    }
    if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }
    return NextResponse.json({ email: user.email, firstName: user.firstName, lastName: user.lastName });
  }

  // Fall back to Contact table (contact invites from the contacts page)
  const contact = await prisma.contact.findFirst({
    where: { inviteToken: token },
    select: { id: true, email: true, firstName: true, lastName: true, inviteExpiresAt: true, inviteAccepted: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
  }

  if (contact.inviteAccepted) {
    return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
  }

  if (contact.inviteExpiresAt && new Date() > contact.inviteExpiresAt) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  return NextResponse.json({ email: contact.email, firstName: contact.firstName, lastName: contact.lastName });
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

  // Check User table first (direct user invites)
  const user = await prisma.user.findFirst({
    where: { inviteToken: token, isDeleted: false },
  });

  if (user) {
    if (user.emailConfirmed) {
      return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
    }
    if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }

    const existingUsername = await prisma.user.findFirst({ where: { username, id: { not: user.id } } });
    if (existingUsername) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username, passwordHash,
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

  // Fall back to Contact table (contact invites from the contacts page)
  const contact = await prisma.contact.findFirst({
    where: { inviteToken: token },
    include: { customer: { select: { company: true } } },
  });

  if (!contact) {
    return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
  }
  if (contact.inviteAccepted) {
    return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
  }
  if (contact.inviteExpiresAt && new Date() > contact.inviteExpiresAt) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  // Ensure username is unique
  const existingUsername = await prisma.user.findFirst({ where: { username } });
  if (existingUsername) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }

  // Ensure no existing user with same email
  const existingEmail = await prisma.user.findFirst({ where: { email: contact.email, isDeleted: false } });
  if (existingEmail) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create the User from the contact
  const newUser = await prisma.user.create({
    data: {
      email: contact.email,
      username,
      firstName: contact.firstName,
      lastName: contact.lastName,
      passwordHash,
      role: "USER",
      phoneNumber: phoneNumber || contact.phone || null,
      company: company || contact.customer?.company || null,
      companyRegNo: companyRegNo || null,
      companyVatNo: companyVatNo || null,
      companyAddress: companyAddress || null,
      position: position || contact.position || null,
      emailConfirmed: true,
      legalAcceptedAt: new Date(),
      legalDocVersion: "1.0",
    },
  });

  // Link the contact to the new user and mark accepted
  await prisma.contact.update({
    where: { id: contact.id },
    data: { userId: newUser.id, inviteAccepted: true, inviteToken: null, inviteExpiresAt: null },
  });

  return NextResponse.json({ message: "Account setup complete. You can now log in." });
}
