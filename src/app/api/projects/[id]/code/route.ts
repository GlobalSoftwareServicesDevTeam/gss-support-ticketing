import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET: list code releases for a project
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const releases = await prisma.codeRelease.findMany({
      where: { projectId: id },
      select: {
        id: true,
        version: true,
        notes: true,
        fileName: true,
        fileExt: true,
        fileSize: true,
        uploadedBy: true,
        createdAt: true,
        _count: { select: { downloads: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(releases);
  } catch (error) {
    console.error("Code releases GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: upload a new code release (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { version, notes, fileName, fileBase64 } = body;

    if (!version || !fileName || !fileBase64) {
      return NextResponse.json({ error: "version, fileName, and fileBase64 are required" }, { status: 400 });
    }

    // Check for duplicate version
    const existing = await prisma.codeRelease.findFirst({
      where: { projectId: id, version },
    });
    if (existing) {
      return NextResponse.json({ error: `Version ${version} already exists` }, { status: 409 });
    }

    const ext = fileName.includes(".") ? fileName.split(".").pop()! : "";
    const sizeBytes = Math.ceil((fileBase64.length * 3) / 4);

    const release = await prisma.codeRelease.create({
      data: {
        projectId: id,
        version,
        notes: notes || null,
        fileName,
        fileExt: ext,
        fileBase64,
        fileSize: sizeBytes,
        uploadedBy: session.user.id,
      },
    });

    logAudit({
      action: "UPLOAD",
      entity: "CODE_RELEASE",
      entityId: release.id,
      description: `Uploaded code release v${version} (${fileName}) for project ${id.slice(0, 8)}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { version, fileName, projectId: id },
    });

    return NextResponse.json(release, { status: 201 });
  } catch (error) {
    console.error("Code release POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
