import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { downloadCertificate } from "@/lib/digicert";

// GET: download certificate files from DigiCert
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
    include: { order: true },
  });

  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && cert.order.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!cert.digicertOrderId) {
    return NextResponse.json({ error: "Certificate not yet issued" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "pem_all";

  try {
    const certData = await downloadCertificate(cert.digicertOrderId, format);
    return new NextResponse(certData, {
      status: 200,
      headers: {
        "Content-Type": "application/x-pem-file",
        "Content-Disposition": `attachment; filename="${cert.commonName}.pem"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
