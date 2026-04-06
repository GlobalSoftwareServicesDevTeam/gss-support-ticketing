import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { orderCertificate } from "@/lib/digicert";

// POST: issue certificate to DigiCert (after payment is complete)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { csr, dcvMethod, validityYears } = body;

  const cert = await prisma.sslCertificate.findUnique({
    where: { id },
    include: { order: true },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (cert.digicertOrderId) {
    return NextResponse.json({ error: "Certificate already issued to DigiCert" }, { status: 400 });
  }

  const csrToUse = csr || cert.csr;
  if (!csrToUse) {
    return NextResponse.json({ error: "CSR is required to issue certificate" }, { status: 400 });
  }

  // Find the digicert product ID from productType
  const productMap: Record<string, string> = {
    DV: "ssl_dv_geotrust",
    WILDCARD: "wildcard_dv_geotrust",
    OV: "ssl_basic",
    EV: "ssl_ev_basic",
  };
  const digicertProductId = body.digicertProductId || productMap[cert.productType] || "ssl_dv_geotrust";

  try {
    const sans = cert.sans ? JSON.parse(cert.sans) : [];
    const dcResult = await orderCertificate({
      productId: digicertProductId,
      commonName: cert.commonName,
      csr: csrToUse,
      validityYears: validityYears || 1,
      sans,
      dcvMethod: dcvMethod || "dns-txt-token",
    });

    // Update CSR if new one was provided
    const updates: Record<string, unknown> = {
      digicertOrderId: dcResult.id,
      status: "PENDING_VALIDATION",
      validationDetails: JSON.stringify(dcResult),
    };
    if (csr) updates.csr = csr;

    await prisma.sslCertificate.update({
      where: { id },
      data: updates,
    });

    await prisma.hostingOrder.update({
      where: { id: cert.orderId },
      data: { status: "PROVISIONING" },
    });

    logAudit({
      action: "UPDATE",
      entity: "SSL_CERTIFICATE",
      entityId: id,
      description: `Issued SSL certificate to DigiCert (Order #${dcResult.id}) for ${cert.commonName}`,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      digicertOrderId: dcResult.id,
      dcvRandomValue: dcResult.dcv_random_value,
      certificateChain: dcResult.certificate_chain,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DigiCert API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
