import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getOrderInfo, revokeCertificate } from "@/lib/digicert";
import { decrypt } from "@/lib/encryption";

// GET: get single SSL certificate details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const cert = await prisma.sslCertificate.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  // Non-admins can only see their own
  if (session.user.role !== "ADMIN" && cert.order.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sync status from DigiCert if we have an order ID
  if (cert.digicertOrderId && ["PENDING_VALIDATION", "PENDING"].includes(cert.status)) {
    try {
      const dcOrder = await getOrderInfo(cert.digicertOrderId);
      const updates: Record<string, unknown> = {};

      if (dcOrder.status === "issued") {
        updates.status = "ISSUED";
        updates.issuedAt = new Date();
        if (dcOrder.certificate?.valid_from) {
          updates.validFrom = new Date(dcOrder.certificate.valid_from);
        }
        if (dcOrder.certificate?.valid_till) {
          updates.validTo = new Date(dcOrder.certificate.valid_till);
        }
        // Store the certificate if returned
        if (dcOrder.certificate?.pem) {
          updates.certificate = dcOrder.certificate.pem;
        }
        if (dcOrder.certificate?.intermediate_certificate?.pem) {
          updates.intermediateCert = dcOrder.certificate.intermediate_certificate.pem;
        }
        if (dcOrder.certificate?.root_certificate?.pem) {
          updates.rootCert = dcOrder.certificate.root_certificate.pem;
        }
      } else if (dcOrder.status === "rejected") {
        updates.status = "REJECTED";
      } else if (dcOrder.status === "revoked") {
        updates.status = "REVOKED";
      }

      if (Object.keys(updates).length > 0) {
        const updatedCert = await prisma.sslCertificate.update({
          where: { id },
          data: updates,
          include: {
            order: {
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        });

        if (updates.status === "ISSUED") {
          await prisma.hostingOrder.update({
            where: { id: cert.orderId },
            data: { status: "ACTIVE", provisionedAt: new Date() },
          });
        }

        return NextResponse.json(updatedCert);
      }
    } catch (error) {
      // Log but don't fail - return cached data
      console.error("Failed to sync DigiCert status:", error);
    }
  }

  return NextResponse.json(cert);
}

// PATCH: update SSL certificate (admin only)
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
  const { action } = body;

  const cert = await prisma.sslCertificate.findUnique({
    where: { id },
    include: { order: true },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (action === "revoke") {
    if (!cert.digicertOrderId) {
      return NextResponse.json({ error: "No DigiCert order to revoke" }, { status: 400 });
    }
    try {
      await revokeCertificate(cert.digicertOrderId, body.reason);
      const updated = await prisma.sslCertificate.update({
        where: { id },
        data: { status: "REVOKED" },
      });
      await prisma.hostingOrder.update({
        where: { id: cert.orderId },
        data: { status: "CANCELLED" },
      });
      logAudit({
        action: "UPDATE",
        entity: "SSL_CERTIFICATE",
        entityId: id,
        description: `Revoked SSL certificate for ${cert.commonName}`,
        userId: session.user.id,
      });
      return NextResponse.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revoke";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (action === "download-key") {
    if (!cert.privateKey) {
      return NextResponse.json({ error: "No private key stored" }, { status: 404 });
    }
    try {
      const decrypted = decrypt(cert.privateKey);
      return NextResponse.json({ privateKey: decrypted });
    } catch {
      return NextResponse.json({ error: "Failed to decrypt private key" }, { status: 500 });
    }
  }

  // General update
  const allowedFields = ["status", "csr", "certificate", "intermediateCert", "rootCert", "validationType"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.sslCertificate.update({
    where: { id },
    data: updates,
  });

  logAudit({
    action: "UPDATE",
    entity: "SSL_CERTIFICATE",
    entityId: id,
    description: `Updated SSL certificate: ${Object.keys(updates).join(", ")}`,
    userId: session.user.id,
  });

  return NextResponse.json(updated);
}
