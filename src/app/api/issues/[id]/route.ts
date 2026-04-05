import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, issueUpdateTemplate } from "@/lib/email";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      customer: { select: { contactPerson: true, emailAddress: true, company: true } },
      messages: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { dateCreated: "asc" },
      },
      fileUploads: {
        select: { id: true, fileName: true, fileExt: true, dateAdded: true, publicDoc: true },
      },
      project: true,
    },
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  // Non-admin can only view own issues
  if (session.user.role !== "ADMIN" && issue.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(issue);
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
  const body = await req.json();
  const { status, priority, subject, kind, projectId } = body;

  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && issue.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (priority) data.priority = priority;
  if (subject) data.subject = subject;
  if (kind !== undefined) data.kind = kind;
  if (projectId !== undefined) data.projectId = projectId;

  const updated = await prisma.issue.update({ where: { id }, data });

  // Notify customer/user of status change
  if (status && issue.userId) {
    const issueUser = await prisma.user.findUnique({ where: { id: issue.userId } });
    if (issueUser) {
      await sendEmail({
        to: issueUser.email,
        subject: `Ticket Updated: ${issue.subject} [GSS-${issue.id}]`,
        html: issueUpdateTemplate(issue.id, `Status changed to ${status}`, "GSS Support"),
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.issue.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
