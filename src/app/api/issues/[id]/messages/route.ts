import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, issueUpdateTemplate } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { content } = body;

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: { user: true, customer: true },
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && issue.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      content,
      issueId: id,
      userId: session.user.id,
    },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  // Update issue timestamp
  await prisma.issue.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  // Send notification emails
  const senderName = session.user.name || "Support Agent";

  if (session.user.role === "ADMIN" && issue.userId) {
    // Admin replying - notify the ticket owner
    const issueUser = await prisma.user.findUnique({ where: { id: issue.userId } });
    if (issueUser) {
      await sendEmail({
        to: issueUser.email,
        subject: `Ticket Update: ${issue.subject} [GSS-${issue.id}]`,
        html: issueUpdateTemplate(issue.id, content, senderName),
      });
    }
  } else if (session.user.role === "ADMIN" && issue.customer) {
    // Admin replying to email-based ticket
    await sendEmail({
      to: issue.customer.emailAddress,
      subject: `Re: ${issue.subject} [GSS-${issue.id}]`,
      html: issueUpdateTemplate(issue.id, content, senderName),
    });
  } else {
    // User replying - notify admins
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `Ticket Reply: ${issue.subject} [GSS-${issue.id}]`,
        html: issueUpdateTemplate(issue.id, content, senderName),
      });
    }
  }

  return NextResponse.json(message, { status: 201 });
}
