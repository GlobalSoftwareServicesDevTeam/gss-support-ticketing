import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, issueUpdateTemplate } from "@/lib/email";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};

  // Non-admin users can only see their own issues
  if (session.user.role !== "ADMIN") {
    where.userId = session.user.id;
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { initialNotes: { contains: search } },
      { company: { contains: search } },
    ];
  }

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        customer: { select: { contactPerson: true, emailAddress: true, company: true } },
        _count: { select: { messages: true, fileUploads: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.issue.count({ where }),
  ]);

  return NextResponse.json({ issues, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { subject, initialNotes, priority, projectId, kind } = body;

  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const issue = await prisma.issue.create({
    data: {
      subject,
      initialNotes,
      priority: priority || "MEDIUM",
      kind,
      company: user.company,
      userId: user.id,
      projectId: projectId || null,
    },
  });

  // Notify admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `New Support Ticket: ${subject} [GSS-${issue.id}]`,
      html: issueUpdateTemplate(issue.id, initialNotes || subject, `${user.firstName} ${user.lastName}`),
    });
  }

  return NextResponse.json(issue, { status: 201 });
}
