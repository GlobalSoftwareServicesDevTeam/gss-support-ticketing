import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET: download a code release (tracks download)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { releaseId } = await params;

    const release = await prisma.codeRelease.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    // Log the download
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";

    await prisma.codeDownloadLog.create({
      data: {
        userId: session.user.id,
        codeReleaseId: release.id,
        ipAddress: ip,
      },
    });

    logAudit({
      action: "DOWNLOAD",
      entity: "CODE_RELEASE",
      entityId: release.id,
      description: `Downloaded code release v${release.version} (${release.fileName})`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { version: release.version, fileName: release.fileName },
    });

    // Return file as download
    const buffer = Buffer.from(release.fileBase64, "base64");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${release.fileName}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Code download error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: delete a code release (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { releaseId } = await params;

    await prisma.codeRelease.delete({ where: { id: releaseId } });

    logAudit({
      action: "DELETE",
      entity: "CODE_RELEASE",
      entityId: releaseId,
      description: `Deleted code release #${releaseId.slice(0, 8)}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Code release DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
