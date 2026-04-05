import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: single arrangement
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const arrangement = await prisma.paymentArrangement.findUnique({
    where: { id },
    include: {
      installments: { orderBy: { installmentNo: "asc" } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!arrangement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin && arrangement.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(arrangement);
}

// PATCH: update arrangement (admin: approve/reject/default, user: cancel)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, adminNotes, installmentId, gatewayRef } = body;

  const arrangement = await prisma.paymentArrangement.findUnique({
    where: { id },
    include: { installments: { orderBy: { installmentNo: "asc" } } },
  });

  if (!arrangement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";

  switch (action) {
    case "approve": {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (arrangement.status !== "PENDING") {
        return NextResponse.json(
          { error: "Can only approve PENDING arrangements" },
          { status: 400 }
        );
      }
      const updated = await prisma.paymentArrangement.update({
        where: { id },
        data: {
          status: "ACTIVE",
          approvedAt: new Date(),
          approvedBy: session.user.id,
          adminNotes: adminNotes || arrangement.adminNotes,
        },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logAudit({
        action: "UPDATE",
        entity: "PAYMENT_ARRANGEMENT",
        entityId: id,
        description: `Payment arrangement approved: ${arrangement.invoiceNumber}`,
        userId: session.user.id,
        userName: session.user.name || "Unknown",
      });

      return NextResponse.json(updated);
    }

    case "reject": {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (arrangement.status !== "PENDING") {
        return NextResponse.json(
          { error: "Can only reject PENDING arrangements" },
          { status: 400 }
        );
      }
      const updated = await prisma.paymentArrangement.update({
        where: { id },
        data: {
          status: "REJECTED",
          adminNotes: adminNotes || arrangement.adminNotes,
        },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logAudit({
        action: "UPDATE",
        entity: "PAYMENT_ARRANGEMENT",
        entityId: id,
        description: `Payment arrangement rejected: ${arrangement.invoiceNumber}`,
        userId: session.user.id,
        userName: session.user.name || "Unknown",
      });

      return NextResponse.json(updated);
    }

    case "default": {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["ACTIVE", "APPROVED"].includes(arrangement.status)) {
        return NextResponse.json(
          { error: "Can only default ACTIVE arrangements" },
          { status: 400 }
        );
      }
      const updated = await prisma.paymentArrangement.update({
        where: { id },
        data: {
          status: "DEFAULTED",
          adminNotes: adminNotes || arrangement.adminNotes,
        },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logAudit({
        action: "UPDATE",
        entity: "PAYMENT_ARRANGEMENT",
        entityId: id,
        description: `Payment arrangement defaulted: ${arrangement.invoiceNumber}`,
        userId: session.user.id,
        userName: session.user.name || "Unknown",
      });

      return NextResponse.json(updated);
    }

    case "cancel": {
      // Users can cancel their own PENDING arrangements
      if (!isAdmin && arrangement.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["PENDING"].includes(arrangement.status)) {
        return NextResponse.json(
          { error: "Can only cancel PENDING arrangements" },
          { status: 400 }
        );
      }
      const updated = await prisma.paymentArrangement.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logAudit({
        action: "UPDATE",
        entity: "PAYMENT_ARRANGEMENT",
        entityId: id,
        description: `Payment arrangement cancelled: ${arrangement.invoiceNumber}`,
        userId: session.user.id,
        userName: session.user.name || "Unknown",
      });

      return NextResponse.json(updated);
    }

    case "mark_paid": {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!installmentId) {
        return NextResponse.json(
          { error: "installmentId is required for mark_paid" },
          { status: 400 }
        );
      }
      const installment = arrangement.installments.find(
        (i) => i.id === installmentId
      );
      if (!installment) {
        return NextResponse.json(
          { error: "Installment not found" },
          { status: 404 }
        );
      }
      if (installment.status === "PAID") {
        return NextResponse.json(
          { error: "Installment already paid" },
          { status: 400 }
        );
      }

      await prisma.paymentArrangementInstallment.update({
        where: { id: installmentId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          gatewayRef: gatewayRef || null,
        },
      });

      // Check if all installments are now paid → complete arrangement
      const allInstallments = await prisma.paymentArrangementInstallment.findMany({
        where: { arrangementId: id },
      });
      const allPaid = allInstallments.every(
        (i) => i.status === "PAID" || i.status === "WAIVED"
      );

      if (allPaid) {
        await prisma.paymentArrangement.update({
          where: { id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }

      const updated = await prisma.paymentArrangement.findUnique({
        where: { id },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await logAudit({
        action: "UPDATE",
        entity: "PAYMENT_ARRANGEMENT",
        entityId: id,
        description: `Installment ${installment.installmentNo} marked as paid: ${arrangement.invoiceNumber}${gatewayRef ? ` (ref: ${gatewayRef})` : ""}`,
        userId: session.user.id,
        userName: session.user.name || "Unknown",
      });

      return NextResponse.json(updated);
    }

    case "admin_notes": {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const updated = await prisma.paymentArrangement.update({
        where: { id },
        data: { adminNotes: adminNotes || null },
        include: {
          installments: { orderBy: { installmentNo: "asc" } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      return NextResponse.json(updated);
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
