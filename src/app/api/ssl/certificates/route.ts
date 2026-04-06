import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { orderCertificate, DIGICERT_PRODUCTS } from "@/lib/digicert";
import { encrypt } from "@/lib/encryption";

// GET: list SSL certificates
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  // Non-admins can only see their own certificates (via order.userId)
  if (session.user.role !== "ADMIN") {
    where.order = { userId: session.user.id };
  }

  const certificates = await prisma.sslCertificate.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          domain: true,
          status: true,
          amount: true,
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(certificates);
}

// POST: create SSL certificate order and optionally issue to DigiCert
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    commonName,
    productType,
    digicertProductId,
    csr,
    privateKey,
    sans,
    validityYears,
    dcvMethod,
    domain,
    amount,
    userId,
    issueNow,
  } = body;

  if (!commonName || !productType || !digicertProductId) {
    return NextResponse.json(
      { error: "commonName, productType, and digicertProductId are required" },
      { status: 400 }
    );
  }

  if (!DIGICERT_PRODUCTS[digicertProductId]) {
    return NextResponse.json({ error: "Invalid DigiCert product ID" }, { status: 400 });
  }

  // Create hosting order for SSL
  const order = await prisma.hostingOrder.create({
    data: {
      orderType: "SSL",
      domain: domain || commonName,
      amount: amount ? parseFloat(amount) : null,
      period: (validityYears || 1) * 12,
      status: "PENDING",
      userId: userId || session.user.id,
    },
  });

  // Create SSL certificate record
  const cert = await prisma.sslCertificate.create({
    data: {
      orderId: order.id,
      commonName,
      productType,
      sans: sans ? JSON.stringify(sans) : null,
      csr: csr || null,
      privateKey: privateKey ? encrypt(privateKey) : null,
      validationType: dcvMethod || "DNS",
    },
  });

  logAudit({
    action: "CREATE",
    entity: "SSL_CERTIFICATE",
    entityId: cert.id,
    description: `Created SSL certificate order for ${commonName} (${productType})`,
    userId: session.user.id,
  });

  // If payment complete or admin wants to issue now, submit to DigiCert
  if (issueNow && csr) {
    try {
      const dcResult = await orderCertificate({
        productId: digicertProductId,
        commonName,
        csr,
        validityYears: validityYears || 1,
        sans: sans || [],
        dcvMethod: dcvMethod || "dns-txt-token",
      });

      await prisma.sslCertificate.update({
        where: { id: cert.id },
        data: {
          digicertOrderId: dcResult.id,
          status: "PENDING_VALIDATION",
          validationDetails: JSON.stringify(dcResult),
        },
      });

      await prisma.hostingOrder.update({
        where: { id: order.id },
        data: { status: "PROVISIONING" },
      });

      logAudit({
        action: "UPDATE",
        entity: "SSL_CERTIFICATE",
        entityId: cert.id,
        description: `Submitted to DigiCert (Order #${dcResult.id})`,
        userId: session.user.id,
      });

      return NextResponse.json({ ...cert, digicertOrderId: dcResult.id, order }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "DigiCert API error";
      return NextResponse.json(
        { error: message, certificate: cert, order },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ ...cert, order }, { status: 201 });
}
