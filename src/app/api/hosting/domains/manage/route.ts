import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list all domain orders with user + product info, expiry tracking
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status"); // ACTIVE | PENDING | ALL | EXPIRING
  const customerIdParam = searchParams.get("customerId");
  const now = new Date();

  const where: Record<string, unknown> = {
    orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER"] },
  };

  if (!isAdmin) {
    where.userId = session.user.id;
  }

  if (customerIdParam && isAdmin) {
    where.customerId = customerIdParam;
  }

  if (statusParam === "ACTIVE") {
    where.status = "ACTIVE";
  } else if (statusParam === "PENDING") {
    where.status = { in: ["PENDING", "QUOTED", "PROFORMA_SENT", "PAID", "PROVISIONING"] };
  } else if (statusParam === "EXPIRING") {
    const thirtyDaysOut = new Date(now);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    where.status = "ACTIVE";
    where.expiryDate = { not: null, lte: thirtyDaysOut };
  } else if (statusParam === "EXPIRED") {
    where.status = "ACTIVE";
    where.expiryDate = { not: null, lt: now };
  } else if (statusParam && statusParam !== "ALL") {
    where.status = statusParam;
  }

  const orders = await prisma.hostingOrder.findMany({
    where,
    include: {
      product: { select: { name: true, type: true, monthlyPrice: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      customer: { select: { id: true, company: true } },
      project: { select: { id: true, projectName: true } },
      // subProject: { select: { id: true, name: true } }, // TODO: uncomment after prisma generate
    },
    orderBy: { createdAt: "desc" },
  });

  const domains = orders.map((order) => {
    const expiryDate = order.expiryDate;
    let daysLeft: number | null = null;
    let expiryStatus: "ok" | "warning" | "critical" | "expired" | "none" = "none";

    if (expiryDate) {
      daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) expiryStatus = "expired";
      else if (daysLeft <= 14) expiryStatus = "critical";
      else if (daysLeft <= 30) expiryStatus = "warning";
      else expiryStatus = "ok";
    }

    return {
      id: order.id,
      domain: order.domain,
      orderType: order.orderType,
      status: order.status,
      amount: order.amount ? Number(order.amount) : null,
      period: order.period,
      expiryDate: expiryDate?.toISOString() || null,
      daysLeft,
      expiryStatus,
      reminderSentAt: order.reminderSentAt?.toISOString() || null,
      pleskSubscriptionId: order.pleskSubscriptionId,
      invoiceNinjaInvoiceId: order.invoiceNinjaInvoiceId,
      recurringInvoiceId: order.recurringInvoiceId,
      provisionedAt: order.provisionedAt?.toISOString() || null,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      product: order.product,
      user: order.user,
      customer: order.customer,
      project: order.project,
    };
  });

  // Summary stats
  const allDomainOrders = await prisma.hostingOrder.findMany({
    where: {
      orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER"] },
      ...(isAdmin ? {} : { userId: session.user.id }),
    },
    select: { status: true, expiryDate: true },
  });

  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const stats = {
    total: allDomainOrders.length,
    active: allDomainOrders.filter((o) => o.status === "ACTIVE").length,
    pending: allDomainOrders.filter((o) =>
      ["PENDING", "QUOTED", "PROFORMA_SENT", "PAID", "PROVISIONING"].includes(o.status)
    ).length,
    expiringSoon: allDomainOrders.filter((o) => {
      if (o.status !== "ACTIVE" || !o.expiryDate) return false;
      const dl = Math.ceil((o.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return dl > 0 && dl <= 30;
    }).length,
    expired: allDomainOrders.filter((o) => {
      if (o.status !== "ACTIVE" || !o.expiryDate) return false;
      return o.expiryDate < now;
    }).length,
    cancelled: allDomainOrders.filter((o) => o.status === "CANCELLED").length,
  };

  return NextResponse.json({ domains, stats });
}
