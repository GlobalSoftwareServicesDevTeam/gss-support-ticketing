import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteFile, verifyFileInFolder } from "@/lib/google-drive";

/** DELETE /api/google-drive/[fileId] — delete a file (admin only) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can delete files" }, { status: 403 });
  }

  const { fileId } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId query param required" }, { status: 400 });
  }

  // Verify the file belongs to the user's folder
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleDriveFolderId: true },
  });

  if (!user?.googleDriveFolderId) {
    return NextResponse.json({ error: "User does not have a Drive folder" }, { status: 400 });
  }

  try {
    const belongsToFolder = await verifyFileInFolder(fileId, user.googleDriveFolderId);
    if (!belongsToFolder) {
      return NextResponse.json({ error: "File does not belong to this user's folder" }, { status: 403 });
    }

    await deleteFile(fileId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Google Drive delete error:", message);
    return NextResponse.json({ error: "Failed to delete file", detail: message }, { status: 500 });
  }
}
