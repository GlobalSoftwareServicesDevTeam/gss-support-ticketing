import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, issueUpdateTemplate } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import { getCustomerUserIds } from "@/lib/customer-users";

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
  const customerId = searchParams.get("customerId");
  const projectId = searchParams.get("projectId");
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");

  const andClauses: Record<string, unknown>[] = [];

  // Non-admin users: filter by user or customer scope
  if (session.user.role !== "ADMIN") {
    const ctx = getCustomerContext(session);
    if (ctx && ctx.permissions.tickets) {
      // Customer-scoped: see all issues for the customer (by customerId or userId)
      const customerUserIds = await getCustomerUserIds(ctx.customerId);
      andClauses.push({
        OR: [
        { customerId: ctx.customerId },
        { userId: { in: customerUserIds } },
        ],
      });
    } else {
      andClauses.push({ userId: session.user.id });
    }
  }

  if (status) andClauses.push({ status });
  if (priority) andClauses.push({ priority });
  if (customerId) andClauses.push({ customerId });
  if (projectId) andClauses.push({ projectId });

  if (fromDate || toDate) {
    const createdAt: Record<string, unknown> = {};
    if (fromDate) createdAt.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) createdAt.lte = new Date(`${toDate}T23:59:59.999Z`);
    andClauses.push({ createdAt });
  }

  if (search) {
    andClauses.push({
      OR: [
        { subject: { contains: search } },
        { initialNotes: { contains: search } },
        { company: { contains: search } },
      ],
    });
  }

  const where: Record<string, unknown> = andClauses.length > 0 ? { AND: andClauses } : {};

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        customer: { select: { contactPerson: true, emailAddress: true, company: true } },
        project: { select: { id: true, projectName: true } },
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

  logAudit({
    action: "CREATE",
    entity: "ISSUE",
    entityId: issue.id,
    description: `Created ticket: ${subject}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { priority: priority || "MEDIUM", kind },
  });

  return NextResponse.json(issue, { status: 201 });
}
