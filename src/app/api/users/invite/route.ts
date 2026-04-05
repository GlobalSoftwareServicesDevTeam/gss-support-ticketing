import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";

// POST: invite a new user by email
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, firstName, lastName, role, projectIds, invoiceNinjaClientId } = body;

  if (!email || !firstName || !lastName) {
    return NextResponse.json({ error: "email, firstName, and lastName are required" }, { status: 400 });
  }

  // Check if user already exists
  const existing = await prisma.user.findFirst({
    where: { email, isDeleted: false },
  });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const inviteToken = randomBytes(32).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create user stub with invite token (no password yet, not confirmed)
  const user = await prisma.user.create({
    data: {
      email,
      username: email, // will be updated during accept
      firstName,
      lastName,
      passwordHash: "", // placeholder — set during invite accept
      role: role || "USER",
      emailConfirmed: false,
      inviteToken,
      inviteExpiresAt,
      invoiceNinjaClientId: invoiceNinjaClientId || null,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://support.globaltest.net.za";
  const acceptUrl = `${baseUrl}/invite?token=${inviteToken}`;

  // Assign projects to user if provided
  if (Array.isArray(projectIds) && projectIds.length > 0) {
    await prisma.projectAssignment.createMany({
      data: projectIds.map((projectId: string) => ({
        projectId,
        userId: user.id,
      })),
    });
  }

  try {
    await sendEmail({
      to: email,
      subject: "You're invited to GSS Support Portal",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
            <div style="background-color: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px;">GSS Support Portal</h1>
            </div>
            <h2 style="color: #1a365d;">Welcome, ${firstName}!</h2>
            <p>You've been invited to join the GSS Support Portal. Click the button below to set up your account:</p>
            <a href="${acceptUrl}" style="display: inline-block; background-color: #2b6cb0; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin: 20px 0; font-weight: bold;">Accept Invitation & Set Up Account</a>
            <p style="color: #718096; font-size: 13px;">This invitation expires in 7 days.</p>
            <p style="color: #718096; font-size: 13px;">During setup you'll:</p>
            <ul style="color: #718096; font-size: 13px;">
              <li>Create your username and password</li>
              <li>Enter your company information</li>
              <li>Review and sign our terms of service</li>
            </ul>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 11px;">
              <p>If you didn't expect this invitation, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  } catch {
    // Email send failed but user was created — admin can resend
  }

  return NextResponse.json(
    { id: user.id, email: user.email, message: "Invitation sent" },
    { status: 201 }
  );
}
