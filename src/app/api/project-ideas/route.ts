import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const category = searchParams.get("category") || "";
  const customerId = searchParams.get("customerId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "25");
  const skip = (page - 1) * limit;

  const isAdmin = session.user.role === "ADMIN";
  const userCustomerId = (session.user as { customerId?: string }).customerId;

  const where: Record<string, unknown> = {};

  if (!isAdmin && userCustomerId) {
    where.customerId = userCustomerId;
  } else if (!isAdmin) {
    return NextResponse.json({ ideas: [], total: 0 });
  }

  if (isAdmin && customerId) {
    where.customerId = customerId;
  }

  if (status) {
    where.status = status;
  }

  if (category) {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { submittedBy: { contains: search } },
      { contactEmail: { contains: search } },
    ];
  }

  const [ideas, total] = await Promise.all([
    prisma.projectIdea.findMany({
      where,
      include: {
        customer: { select: { id: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.projectIdea.count({ where }),
  ]);

  return NextResponse.json({ ideas, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    description,
    category,
    priority,
    budget,
    timeline,
    submittedBy,
    contactEmail,
    adminNotes,
    customerId,
  } = body;

  const userCustomerId = (session.user as { customerId?: string }).customerId;

  if (!title || !description) {
    return NextResponse.json(
      { error: "Title and description are required" },
      { status: 400 }
    );
  }

  const idea = await prisma.projectIdea.create({
    data: {
      title,
      description,
      category: category || "GENERAL",
      priority: priority || "MEDIUM",
      budget: budget ? parseFloat(budget) : null,
      timeline: timeline || null,
      submittedBy: submittedBy || session.user.name || null,
      contactEmail: contactEmail || session.user.email || null,
      adminNotes: adminNotes || null,
      customerId: customerId || userCustomerId || null,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "PROJECT_IDEA",
    entityId: idea.id,
    description: `Project idea created: ${title}`,
    userId: session.user.id,
  });

  return NextResponse.json(idea, { status: 201 });
}
