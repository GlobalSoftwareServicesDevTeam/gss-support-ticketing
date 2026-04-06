import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { getCustomerContext } from "@/lib/customer-context";

// GET: list all secure notes for a customer (values returned encrypted unless ?decrypt=true)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  const shouldDecrypt = req.nextUrl.searchParams.get("decrypt") === "true";

  // Access check: admin or customer contact with permission
  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (!ctx || ctx.customerId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const notes = await prisma.secureNote.findMany({
    where: { customerId: id },
    orderBy: [{ category: "asc" }, { label: "asc" }],
  });

  const result = notes.map((note) => ({
    id: note.id,
    label: note.label,
    category: note.category,
    notes: note.notes,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    createdBy: note.createdBy,
    // Only decrypt if explicitly requested
    fields: shouldDecrypt ? JSON.parse(decrypt(note.encValue)) : null,
  }));

  return NextResponse.json(result);
}

// POST: create a new secure note
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (!ctx || ctx.customerId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Verify customer exists
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const body = await req.json();
  const { label, category, fields, notes: noteText } = body;

  if (!label || !fields || !Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json(
      { error: "label and fields (array) are required" },
      { status: 400 }
    );
  }

  // Validate field structure
  for (const field of fields) {
    if (!field.key || typeof field.key !== "string") {
      return NextResponse.json(
        { error: "Each field must have a 'key' string" },
        { status: 400 }
      );
    }
  }

  const encValue = encrypt(JSON.stringify(fields));

  const note = await prisma.secureNote.create({
    data: {
      label,
      category: category || "GENERAL",
      encValue,
      notes: noteText || null,
      createdBy: session.user.id,
      customerId: id,
    },
  });

  return NextResponse.json(
    {
      id: note.id,
      label: note.label,
      category: note.category,
      notes: note.notes,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      createdBy: note.createdBy,
      fields: null,
    },
    { status: 201 }
  );
}
