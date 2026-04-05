import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const where: Record<string, unknown> = { projectId: id };
  if (category) where.category = category;

  const documents = await prisma.document.findMany({
    where,
    select: { id: true, name: true, fileName: true, fileExt: true, fileSize: true, category: true, notes: true, uploadedAt: true, uploadedBy: true },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(documents);
}

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
  const { name, fileName, fileExt, fileBase64, fileSize, category, notes } = body;

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
      projectId: id,
      uploadedBy: session.user.id,
    },
  });

  return NextResponse.json({ id: document.id, name: document.name, category: document.category }, { status: 201 });
}
