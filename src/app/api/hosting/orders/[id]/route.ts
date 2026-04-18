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
  const { status, amount, notes, expiryDate, customerId, projectId, subProjectId } = body;

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
  if (customerId !== undefined) data.customerId = customerId || null;
  if (projectId !== undefined) {
    data.projectId = projectId || null;
    // Clear sub-project when project changes (unless subProjectId is also being set)
    if (subProjectId === undefined) data.subProjectId = null;
  }
  if (subProjectId !== undefined) data.subProjectId = subProjectId || null;

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const mode = req.nextUrl.searchParams.get("mode");
  const order = await prisma.hostingOrder.findUnique({
    where: { id },
    include: { sslCertificate: { select: { id: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Admin-only hard delete for support cleanup in admin console
  if (mode === "hard") {
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (order.status === "ACTIVE") {
      return NextResponse.json({ error: "Cannot delete an active order. Cancel it first." }, { status: 400 });
    }

    if (order.sslCertificate) {
      return NextResponse.json({ error: "Cannot delete order linked to an SSL certificate." }, { status: 409 });
    }

    await prisma.hostingOrder.delete({ where: { id } });

    logAudit({
      action: "DELETE",
      entity: "HOSTING_ORDER",
      entityId: id,
      description: `Deleted hosting order #${id.slice(0, 8)}${order.domain ? ` (${order.domain})` : ""}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { mode: "hard", status: order.status },
    });

    return NextResponse.json({ message: "Order deleted" });
  }

  // User-facing delete for removable orders shown in the Hosting > Orders tab.
  if (mode === "delete") {
    if (session.user.role !== "ADMIN" && order.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (["ACTIVE", "PAID", "PROVISIONING"].includes(order.status)) {
      return NextResponse.json({ error: "Cannot delete an order that is active or in fulfilment." }, { status: 400 });
    }

    if (order.sslCertificate) {
      return NextResponse.json({ error: "Cannot delete order linked to an SSL certificate." }, { status: 409 });
    }

    await prisma.hostingOrder.delete({ where: { id } });

    logAudit({
      action: "DELETE",
      entity: "HOSTING_ORDER",
      entityId: id,
      description: `Deleted hosting order #${id.slice(0, 8)}${order.domain ? ` (${order.domain})` : ""}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { mode: "delete", status: order.status },
    });

    return NextResponse.json({ message: "Order deleted" });
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
