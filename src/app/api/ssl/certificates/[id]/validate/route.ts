import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkDcv, getValidationStatus, resendDcvEmails } from "@/lib/digicert";

// POST: check/trigger domain control validation
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
  const { action } = body; // "check", "resend-email", "status"

  const cert = await prisma.sslCertificate.findUnique({
    where: { id },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (!cert.digicertOrderId) {
    return NextResponse.json({ error: "Certificate not yet submitted to DigiCert" }, { status: 400 });
  }

  try {
    let result;

    if (action === "check") {
      result = await checkDcv(cert.digicertOrderId);
      await prisma.sslCertificate.update({
        where: { id },
        data: {
          validationStatus: "COMPLETED",
          validationDetails: JSON.stringify(result),
        },
      });
      logAudit({
        action: "UPDATE",
        entity: "SSL_CERTIFICATE",
        entityId: id,
        description: `DCV check triggered for ${cert.commonName}`,
        userId: session.user.id,
      });
    } else if (action === "resend-email") {
      result = await resendDcvEmails(cert.digicertOrderId);
    } else if (action === "status") {
      result = await getValidationStatus(cert.digicertOrderId);
    } else {
      return NextResponse.json({ error: "Invalid action. Use: check, resend-email, status" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation action failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
