import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && issue.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const isPublic = formData.get("isPublic") === "true";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Limit file size to 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const fileName = file.name;
  const fileExt = fileName.split(".").pop() || "";

  const upload = await prisma.fileUpload.create({
    data: {
      fileName,
      fileExt,
      fileBase64: base64,
      publicDoc: isPublic,
      issueId: id,
    },
  });

  return NextResponse.json(
    { id: upload.id, fileName: upload.fileName, fileExt: upload.fileExt, dateAdded: upload.dateAdded },
    { status: 201 }
  );
}
