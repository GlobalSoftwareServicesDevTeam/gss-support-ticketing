import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { downloadFile, verifyFileInFolder } from "@/lib/google-drive";

/** GET /api/google-drive/[fileId]/download — download a file */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  // Determine whose folder to check
  const targetUserId = (isAdmin && userId) ? userId : session.user.id!;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { googleDriveFolderId: true },
  });

  if (!user?.googleDriveFolderId) {
    return NextResponse.json({ error: "No Drive folder" }, { status: 400 });
  }

  // Non-admins can only download from their own folder
  if (!isAdmin && targetUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Verify file belongs to the user's folder
    const belongsToFolder = await verifyFileInFolder(fileId, user.googleDriveFolderId);
    if (!belongsToFolder) {
      return NextResponse.json({ error: "File not found in your folder" }, { status: 403 });
    }

    const { buffer, name, mimeType } = await downloadFile(fileId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Google Drive download error:", message);
    return NextResponse.json({ error: "Failed to download file", detail: message }, { status: 500 });
  }
}
