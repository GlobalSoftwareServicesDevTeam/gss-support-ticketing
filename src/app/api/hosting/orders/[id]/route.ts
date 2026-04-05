import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// PATCH: update order status (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, amount, notes, expiryDate } = body;

  const order = await prisma.hostingOrder.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (status) {
    const validStatuses = ["PENDING", "QUOTED", "PROFORMA_SENT", "PAID", "PROVISIONING", "ACTIVE", "FAILED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
  }
  if (amount != null) data.amount = amount;
  if (notes !== undefined) data.notes = notes;
  if (expiryDate !== undefined) data.expiryDate = expiryDate ? new Date(expiryDate) : null;

  const updated = await prisma.hostingOrder.update({
    where: { id },
    data,
    include: {
      product: { select: { name: true, type: true } },
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  logAudit({
    action: "STATUS_CHANGE",
    entity: "HOSTING_ORDER",
    entityId: id,
    description: `Updated hosting order #${id.slice(0, 8)}${status ? ` — status → ${status}` : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { status, amount, notes },
  });

  return NextResponse.json(updated);
}

// DELETE: cancel an order
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.hostingOrder.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Users can only cancel their own pending orders; admins can cancel any
  if (session.user.role !== "ADMIN" && order.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.status === "ACTIVE") {
    return NextResponse.json({ error: "Cannot cancel an active order" }, { status: 400 });
  }

  await prisma.hostingOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  logAudit({
    action: "CANCEL",
    entity: "HOSTING_ORDER",
    entityId: id,
    description: `Cancelled hosting order #${id.slice(0, 8)}${order.domain ? ` (${order.domain})` : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ message: "Order cancelled" });
}
