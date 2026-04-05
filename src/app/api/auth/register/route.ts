import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, email, firstName, lastName, password, phoneNumber, company } = body;

  if (!username || !email || !firstName || !lastName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Password validation
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existingUser) {
    return NextResponse.json({ error: "User with this email or username already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const activationCode = uuidv4();

  await prisma.user.create({
    data: {
      username,
      email,
      firstName,
      lastName,
      passwordHash,
      phoneNumber,
      company,
      role: "USER",
      activationCode,
      emailConfirmed: false,
    },
  });

  logAudit({
    action: "REGISTER",
    entity: "AUTH",
    entityId: email,
    description: `New user registration: ${firstName} ${lastName} (${email})`,
    metadata: { username, email },
  });

  // Send verification email
  const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify?code=${activationCode}`;

  await sendEmail({
    to: email,
    subject: "Verify your email - GSS Support",
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
          <h2 style="color: #1a365d;">Welcome to GSS Support, ${firstName}!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verifyUrl}" style="display: inline-block; background-color: #2b6cb0; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; margin: 15px 0;">Verify Email</a>
          <p style="color: #718096; font-size: 12px; margin-top: 20px;">If you didn't create this account, please ignore this email.</p>
        </div>
      </body>
      </html>
    `,
  });

  return NextResponse.json(
    { message: "Registration successful. Please check your email to verify your account." },
    { status: 201 }
  );
}
