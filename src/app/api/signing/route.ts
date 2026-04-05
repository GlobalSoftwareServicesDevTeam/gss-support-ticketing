import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, signingRequestTemplate } from "@/lib/email";
import crypto from "crypto";
import { logAudit } from "@/lib/audit";

// GET /api/signing – list signing requests
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const requests = await prisma.signingRequest.findMany({
    where: isAdmin ? {} : { createdBy: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

// POST /api/signing – create signing request & send email to signer
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { documentId, documentName, signerName, signerEmail, witnessName, witnessEmail } = body;

  if (!documentId || !documentName || !signerName || !signerEmail || !witnessName || !witnessEmail) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  const signerToken = crypto.randomUUID();
  const witnessToken = crypto.randomUUID();
  const adminToken = crypto.randomUUID();

  const signing = await prisma.signingRequest.create({
    data: {
      documentId,
      documentName,
      signerName,
      signerEmail,
      signerToken,
      witnessName,
      witnessEmail,
      witnessToken,
      adminToken,
      createdBy: session.user.id,
      status: "PENDING_SIGNER",
    },
  });

  // Send email to the signer
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://support.globaltest.net.za";
  const signingUrl = `${baseUrl}/sign?token=${signerToken}`;

  await sendEmail({
    to: signerEmail,
    subject: `Please sign: ${documentName}`,
    html: signingRequestTemplate(signerName, documentName, signingUrl, "signer"),
  });

  logAudit({
    action: "CREATE",
    entity: "SIGNING_REQUEST",
    entityId: signing.id,
    description: `Created signing request for "${documentName}" — signer: ${signerName} (${signerEmail})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { documentName, signerEmail, witnessEmail },
  });

  return NextResponse.json(signing, { status: 201 });
}
