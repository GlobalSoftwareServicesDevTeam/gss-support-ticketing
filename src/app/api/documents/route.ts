import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (projectId) where.projectId = projectId;

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
      project: { select: { id: true, projectName: true } },
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

  return NextResponse.json({ id: document.id, name: document.name, category: document.category }, { status: 201 });
}
