import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { listFiles, createUserFolder, uploadFile } from "@/lib/google-drive";

/** GET /api/google-drive — list files in user's (or specified user's) Drive folder */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  // Admin can view any user's folder via ?userId=xxx
  let targetUserId = session.user.id!;
  if (isAdmin && searchParams.get("userId")) {
    targetUserId = searchParams.get("userId")!;
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, firstName: true, lastName: true, email: true, googleDriveFolderId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Non-admins can only see their own folder
  if (!isAdmin && user.id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!user.googleDriveFolderId) {
    return NextResponse.json({ files: [], folderExists: false });
  }

  try {
    const files = await listFiles(user.googleDriveFolderId);
    return NextResponse.json({ files, folderExists: true, folderId: user.googleDriveFolderId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Google Drive list error:", message);
    return NextResponse.json({ error: "Failed to list Google Drive files", detail: message }, { status: 500 });
  }
}

/** POST /api/google-drive — upload file (admin only) or create folder */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can upload files" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";

  // JSON request = create folder for user
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, googleDriveFolderId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.googleDriveFolderId) {
      return NextResponse.json({ folderId: user.googleDriveFolderId, message: "Folder already exists" });
    }

    try {
      const folderId = await createUserFolder(`${user.firstName} ${user.lastName}`, user.email);
      await prisma.user.update({
        where: { id: userId },
        data: { googleDriveFolderId: folderId },
      });
      return NextResponse.json({ folderId, message: "Folder created" }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Google Drive folder creation error:", message);
      return NextResponse.json({ error: "Failed to create Drive folder", detail: message }, { status: 500 });
    }
  }

  // FormData request = upload file
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;

  if (!file || !userId) {
    return NextResponse.json({ error: "file and userId are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleDriveFolderId: true },
  });

  if (!user?.googleDriveFolderId) {
    return NextResponse.json({ error: "User does not have a Google Drive folder. Create one first." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(user.googleDriveFolderId, file.name, file.type || "application/octet-stream", buffer);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Google Drive upload error:", message);
    return NextResponse.json({ error: "Failed to upload file", detail: message }, { status: 500 });
  }
}
