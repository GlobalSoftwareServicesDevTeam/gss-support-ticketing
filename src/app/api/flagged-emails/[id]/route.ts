import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, ticketReceivedTemplate, newIssueAdminTemplate } from "@/lib/email";

// POST: take action on a flagged email (admin only)
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
  const { action, assignToUserId } = body;
  // action: "ignore" | "block_sender" | "create_ticket"

  const flagged = await prisma.flaggedEmail.findUnique({ where: { id } });
  if (!flagged) {
    return NextResponse.json({ error: "Flagged email not found" }, { status: 404 });
  }

  if (flagged.status !== "PENDING") {
    return NextResponse.json({ error: "Already resolved" }, { status: 400 });
  }

  if (action === "ignore") {
    await prisma.flaggedEmail.update({
      where: { id },
      data: {
        status: "IGNORED",
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
      },
    });
    return NextResponse.json({ message: "Email ignored" });
  }

  if (action === "block_sender") {
    // Add sender to blocked list
    const existing = await prisma.blockedSender.findUnique({
      where: { email: flagged.fromEmail.toLowerCase() },
    });
    if (!existing) {
      await prisma.blockedSender.create({
        data: {
          email: flagged.fromEmail.toLowerCase(),
          reason: `Blocked from flagged email: ${flagged.subject}`,
          blockedBy: session.user.id,
        },
      });
    }
    await prisma.flaggedEmail.update({
      where: { id },
      data: {
        status: "IGNORED",
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
      },
    });
    return NextResponse.json({ message: "Sender blocked and email ignored" });
  }

  if (action === "create_ticket") {
    // Create a ticket from this flagged email, optionally assign to a user
    let customer = await prisma.customer.findUnique({
      where: { emailAddress: flagged.fromEmail },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          emailAddress: flagged.fromEmail,
          contactPerson: flagged.fromName || flagged.fromEmail.split("@")[0],
          company: flagged.fromName || flagged.fromEmail.split("@")[0],
        },
      });
    }

    // Try to match user by email or use provided assignToUserId
    let userId = assignToUserId || null;
    if (!userId) {
      const matchedUser = await prisma.user.findUnique({
        where: { email: flagged.fromEmail },
      });
      if (matchedUser) userId = matchedUser.id;
    }

    const issue = await prisma.issue.create({
      data: {
        subject: flagged.subject,
        initialNotes: flagged.bodyText,
        status: "OPEN",
        priority: "MEDIUM",
        company: customer.company,
        customerId: customer.id,
        userId,
        emailThreadId: flagged.messageId,
      },
    });

    await prisma.flaggedEmail.update({
      where: { id },
      data: {
        status: "ASSIGNED",
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        assignedToIssueId: issue.id,
      },
    });

    // Send auto-reply to original sender
    try {
      await sendEmail({
        to: flagged.fromEmail,
        subject: `Re: ${flagged.subject} [GSS-${issue.id}]`,
        html: ticketReceivedTemplate(issue.id, flagged.subject, flagged.fromName || flagged.fromEmail),
      });
    } catch {
      // email send failure is non-critical
    }

    // Notify admins
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `New Support Ticket: ${flagged.subject} [GSS-${issue.id}]`,
          html: newIssueAdminTemplate(issue.id, flagged.subject, flagged.fromEmail, flagged.bodyText || ""),
        });
      }
    } catch {
      // email send failure is non-critical
    }

    return NextResponse.json({ message: "Ticket created", issueId: issue.id });
  }

  return NextResponse.json({ error: "Invalid action. Use: ignore, block_sender, create_ticket" }, { status: 400 });
}

// DELETE: remove a flagged email
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.flaggedEmail.delete({ where: { id } });
  return NextResponse.json({ message: "Deleted" });
}
