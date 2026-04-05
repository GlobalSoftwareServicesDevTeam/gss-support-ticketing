import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: comprehensive user profile with all related data (admin only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id, isDeleted: false },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      company: true,
      companyRegNo: true,
      companyVatNo: true,
      companyAddress: true,
      position: true,
      role: true,
      emailConfirmed: true,
      inviteToken: true,
      legalAcceptedAt: true,
      invoiceNinjaClientId: true,
      createdAt: true,
      updatedAt: true,
      issues: {
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          project: { select: { projectName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      projectAssignments: {
        select: {
          assignedAt: true,
          project: {
            select: {
              id: true,
              projectName: true,
              status: true,
              dateCreated: true,
              onMaintenance: true,
              maintAmount: true,
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
      hostingOrders: {
        select: {
          id: true,
          orderType: true,
          status: true,
          domain: true,
          amount: true,
          period: true,
          expiryDate: true,
          createdAt: true,
          product: { select: { name: true, type: true, monthlyPrice: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      paymentArrangements: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          numberOfMonths: true,
          monthlyAmount: true,
          status: true,
          createdAt: true,
          installments: {
            select: { installmentNo: true, amount: true, dueDate: true, status: true, paidAt: true },
            orderBy: { installmentNo: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch payments separately (no direct relation on model)
  const payments = await prisma.payment.findMany({
    where: { userId: id },
    select: {
      id: true,
      gateway: true,
      gatewayRef: true,
      amount: true,
      currency: true,
      status: true,
      description: true,
      invoiceNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Counts summary
  const issuesByStatus = {
    OPEN: user.issues.filter((i) => i.status === "OPEN").length,
    IN_PROGRESS: user.issues.filter((i) => i.status === "IN_PROGRESS").length,
    WAITING: user.issues.filter((i) => i.status === "WAITING").length,
    RESOLVED: user.issues.filter((i) => i.status === "RESOLVED").length,
    CLOSED: user.issues.filter((i) => i.status === "CLOSED").length,
  };

  const totalPaid = payments
    .filter((p) => p.status === "COMPLETE")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return NextResponse.json({
    ...user,
    payments,
    summary: {
      totalTickets: user.issues.length,
      issuesByStatus,
      totalProjects: user.projectAssignments.length,
      totalHostingOrders: user.hostingOrders.length,
      totalPayments: payments.length,
      totalPaid,
      totalArrangements: user.paymentArrangements.length,
      activeArrangements: user.paymentArrangements.filter((a) => a.status === "ACTIVE").length,
    },
  });
}
