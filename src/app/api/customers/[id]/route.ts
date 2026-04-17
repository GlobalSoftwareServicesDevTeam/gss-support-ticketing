import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET: single customer with contacts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Non-admins can only access their own linked customer
  if (session.user.role !== "ADMIN") {
    const linkedCustomerId = (session.user as { customerId?: string }).customerId;
    if (!linkedCustomerId || linkedCustomerId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      contacts: {
        include: {
          notificationPreferences: true,
        },
        orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
      },
      _count: { select: { issues: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json(customer);
}

// PUT: update customer
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { company, contactPerson, emailAddress, phoneNumber, address, vatNumber, regNumber, isActive } = body;

  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Check email uniqueness if changed
  if (emailAddress && emailAddress !== existing.emailAddress) {
    const dup = await prisma.customer.findUnique({ where: { emailAddress } });
    if (dup) {
      return NextResponse.json({ error: "A customer with this email already exists" }, { status: 409 });
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(company !== undefined && { company }),
      ...(contactPerson !== undefined && { contactPerson }),
      ...(emailAddress !== undefined && { emailAddress }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(address !== undefined && { address }),
      ...(vatNumber !== undefined && { vatNumber }),
      ...(regNumber !== undefined && { regNumber }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "CUSTOMER",
    entityId: id,
    description: `Updated customer: ${customer.company}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(customer);
}

// DELETE: delete customer
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  await prisma.customer.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "CUSTOMER",
    entityId: id,
    description: `Deleted customer: ${customer.company} (${customer.emailAddress})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ message: "Customer deleted" });
}
