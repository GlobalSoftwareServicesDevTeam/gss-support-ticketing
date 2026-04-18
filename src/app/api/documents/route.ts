import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import { getCustomerUserIds } from "@/lib/customer-users";

export async function GET(
  req: NextRequest
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const projectId = searchParams.get("projectId");
  const customerId = searchParams.get("customerId");
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const search = searchParams.get("search");

  const andClauses: Record<string, unknown>[] = [];
  if (category) andClauses.push({ category });
  if (projectId) andClauses.push({ projectId });
  if (customerId) andClauses.push({ project: { customerId } });

  if (fromDate || toDate) {
    const uploadedAt: Record<string, unknown> = {};
    if (fromDate) uploadedAt.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) uploadedAt.lte = new Date(`${toDate}T23:59:59.999Z`);
    andClauses.push({ uploadedAt });
  }

  if (search) {
    andClauses.push({
      OR: [
        { name: { contains: search } },
        { fileName: { contains: search } },
        { notes: { contains: search } },
        { project: { projectName: { contains: search } } },
        { project: { customer: { company: { contains: search } } } },
      ],
    });
  }

  // Non-admin: filter documents to those uploaded by the user or their customer group,
  // or documents belonging to projects they have access to
  if (session.user.role !== "ADMIN") {
    const ctx = getCustomerContext(session);
    if (ctx && ctx.permissions.documents) {
      const customerUserIds = await getCustomerUserIds(ctx.customerId);
      andClauses.push({
        OR: [
          { uploadedBy: { in: customerUserIds } },
          { project: { assignments: { some: { userId: { in: customerUserIds } } } } },
        ],
      });
    } else {
      andClauses.push({
        OR: [
          { uploadedBy: session.user.id },
          { project: { assignments: { some: { userId: session.user.id } } } },
        ],
      });
    }
  }

  const where = andClauses.length ? { AND: andClauses } : {};

  const documents = await prisma.document.findMany({
    where,
    select: {
      id: true,
      name: true,
      fileName: true,
      fileExt: true,
      fileSize: true,
      category: true,
      notes: true,
      uploadedAt: true,
      uploadedBy: true,
      projectId: true,
      project: {
        select: {
          id: true,
          projectName: true,
          customer: { select: { id: true, company: true } },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(
  req: NextRequest
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, fileName, fileExt, fileBase64, fileSize, category, notes, projectId } = body;

  if (!name || !fileName || !fileBase64 || !category) {
    return NextResponse.json({ error: "name, fileName, fileBase64, and category are required" }, { status: 400 });
  }

  const allowedCategories = ["LEGAL", "PROJECT", "RESOURCE", "CODE", "INVOICE", "QUOTE", "STATEMENT", "CREDIT_NOTE", "PAYMENT_NOTE", "OTHER"];
  if (!allowedCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      name,
      fileName,
      fileExt: fileExt || "",
      fileBase64,
      fileSize: fileSize || 0,
      category,
      notes: notes || null,
      projectId: projectId || null,
      uploadedBy: session.user.id,
    },
  });

  logAudit({
    action: "UPLOAD",
    entity: "DOCUMENT",
    entityId: document.id,
    description: `Uploaded document: ${name} (${category})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { fileName, category, fileSize },
  });

  return NextResponse.json({ id: document.id, name: document.name, category: document.category }, { status: 201 });
}
