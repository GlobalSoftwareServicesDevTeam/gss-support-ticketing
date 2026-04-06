import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Users can only view their own profile; admins can view any
  if (session.user.role !== "ADMIN" && session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      company: true,
      role: true,
      emailConfirmed: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (session.user.role !== "ADMIN" && session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.firstName) data.firstName = body.firstName;
  if (body.lastName) data.lastName = body.lastName;
  if (body.phoneNumber !== undefined) data.phoneNumber = body.phoneNumber;
  if (body.company !== undefined) data.company = body.company;

  // Only admin can change role
  if (body.role && session.user.role === "ADMIN") {
    data.role = body.role;
  }

  // Password change
  if (body.newPassword) {
    if (session.user.role !== "ADMIN" && !body.currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }

    if (session.user.role !== "ADMIN") {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    data.passwordHash = await bcrypt.hash(body.newPassword, 12);
    data.passwordReset = false;
  }

  const updated = await prisma.user.update({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    data,
  });

  logAudit({
    action: "UPDATE",
    entity: "USER",
    entityId: id,
    description: `Updated user: ${updated.firstName} ${updated.lastName}${body.role ? ` — role → ${body.role}` : ""}${body.newPassword ? " — password changed" : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { changedFields: Object.keys(data) },
  });

  return NextResponse.json(updated);
}

// DELETE: soft-delete a user (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent self-deletion
  if (session.user.id === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      emailConfirmed: false, // prevent login
    },
  });

  logAudit({
    action: "DELETE",
    entity: "USER",
    entityId: id,
    description: `Deleted user: ${user.firstName} ${user.lastName} (${user.email})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { email: user.email },
  });

  return NextResponse.json({ message: "User deleted" });
}

// POST: admin actions (reset-password, resend-invite)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.isDeleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "reset-password") {
    // Generate a temporary password
    const tempPassword = randomBytes(4).toString("hex"); // 8-char random
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, passwordReset: true },
    });

    logAudit({
      action: "UPDATE",
      entity: "USER",
      entityId: id,
      description: `Admin reset password for user: ${user.firstName} ${user.lastName} (${user.email})`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";

    try {
      await sendEmail({
        to: user.email,
        subject: "Your password has been reset - GSS Support",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
              <div style="background-color: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 22px;">GSS Support Portal</h1>
              </div>
              <h2 style="color: #1a365d;">Password Reset</h2>
              <p>Hi ${user.firstName},</p>
              <p>Your password has been reset by an administrator. Use the temporary password below to log in:</p>
              <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0; text-align: center;">
                <span style="font-family: monospace; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #2d3748;">${tempPassword}</span>
              </div>
              <p>You will be prompted to change your password after loggin in.</p>
              <a href="${baseUrl}/login" style="display: inline-block; background-color: #2b6cb0; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0; font-weight: bold;">Log In</a>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 11px;">
                <p>If you didn't request this reset, please contact support immediately.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
    } catch {
      // Email failed but password was reset
    }

    return NextResponse.json({ message: "Password reset. Temporary password emailed to user." });
  }

  if (action === "resend-invite") {
    if (user.emailConfirmed) {
      return NextResponse.json({ error: "User has already accepted their invitation" }, { status: 400 });
    }

    const inviteToken = randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id },
      data: { inviteToken, inviteExpiresAt },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";
    const acceptUrl = `${baseUrl}/invite?token=${inviteToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Reminder: You're invited to GSS Support Portal",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
              <div style="background-color: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 22px;">GSS Support Portal</h1>
              </div>
              <h2 style="color: #1a365d;">Invitation Reminder</h2>
              <p>Hi ${user.firstName}, this is a reminder to complete your account setup:</p>
              <a href="${acceptUrl}" style="display: inline-block; background-color: #2b6cb0; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin: 20px 0; font-weight: bold;">Accept Invitation</a>
              <p style="color: #718096; font-size: 13px;">This invitation expires in 7 days.</p>
            </div>
          </body>
          </html>
        `,
      });
    } catch {
      // Email failed
    }

    return NextResponse.json({ message: "Invitation resent" });
  }

  if (action === "reset-2fa") {
    if (!user.totpEnabled) {
      return NextResponse.json({ error: "User does not have 2FA enabled" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
    });

    logAudit({
      action: "UPDATE",
      entity: "USER",
      entityId: id,
      description: `Admin reset 2FA for user: ${user.firstName} ${user.lastName} (${user.email})`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ message: "Two-factor authentication has been reset for this user." });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
