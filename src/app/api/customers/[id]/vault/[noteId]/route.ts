import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { getCustomerContext } from "@/lib/customer-context";

// GET: get a single secure note with decrypted fields
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (!ctx || ctx.customerId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const note = await prisma.secureNote.findFirst({
    where: { id: noteId, customerId: id },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: note.id,
    label: note.label,
    category: note.category,
    notes: note.notes,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    createdBy: note.createdBy,
    fields: JSON.parse(decrypt(note.encValue)),
  });
}

// PUT: update a secure note
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (!ctx || ctx.customerId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const existing = await prisma.secureNote.findFirst({
    where: { id: noteId, customerId: id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { label, category, fields, notes: noteText } = body;

  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = label;
  if (category !== undefined) data.category = category;
  if (noteText !== undefined) data.notes = noteText || null;

  if (fields !== undefined) {
    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { error: "fields must be a non-empty array" },
        { status: 400 }
      );
    }
    for (const field of fields) {
      if (!field.key || typeof field.key !== "string") {
        return NextResponse.json(
          { error: "Each field must have a 'key' string" },
          { status: 400 }
        );
      }
    }
    data.encValue = encrypt(JSON.stringify(fields));
  }

  const note = await prisma.secureNote.update({
    where: { id: noteId },
    data,
  });

  return NextResponse.json({
    id: note.id,
    label: note.label,
    category: note.category,
    notes: note.notes,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    createdBy: note.createdBy,
    fields: null,
  });
}

// DELETE: delete a secure note
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  // Only admins can delete vault entries
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.secureNote.findFirst({
    where: { id: noteId, customerId: id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.secureNote.delete({ where: { id: noteId } });

  return NextResponse.json({ message: "Deleted" });
}
