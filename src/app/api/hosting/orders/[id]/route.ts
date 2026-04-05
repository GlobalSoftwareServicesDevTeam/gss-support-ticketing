import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  const { status, amount, notes } = body;

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

  const updated = await prisma.hostingOrder.update({
    where: { id },
    data,
    include: {
      product: { select: { name: true, type: true } },
      user: { select: { firstName: true, lastName: true, email: true } },
    },
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

  return NextResponse.json({ message: "Order cancelled" });
}
