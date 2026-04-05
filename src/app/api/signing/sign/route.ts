import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail, signingRequestTemplate, signingCompleteTemplate } from "@/lib/email";

// GET /api/signing/sign?token=xxx – get signing details (public, token-based auth)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Find by any of the three tokens
  const signing = await prisma.signingRequest.findFirst({
    where: {
      OR: [
        { signerToken: token },
        { witnessToken: token },
        { adminToken: token },
      ],
    },
  });

  if (!signing) {
    return NextResponse.json({ error: "Invalid or expired signing link" }, { status: 404 });
  }

  // Determine role from token
  let role: "signer" | "witness" | "admin" = "signer";
  if (token === signing.witnessToken) role = "witness";
  if (token === signing.adminToken) role = "admin";

  // Fetch the document for preview
  let documentBase64: string | null = null;
  let documentExt: string | null = null;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: signing.documentId },
      select: { fileBase64: true, fileExt: true },
    });
    if (doc) {
      documentBase64 = doc.fileBase64;
      documentExt = doc.fileExt;
    }
  } catch {
    // Document may have been deleted
  }

  return NextResponse.json({
    id: signing.id,
    documentName: signing.documentName,
    documentBase64,
    documentExt,
    status: signing.status,
    role,
    signerName: signing.signerName,
    signerSignature: signing.signerSignature,
    signerSignedAt: signing.signerSignedAt,
    witnessName: signing.witnessName,
    witnessSignature: signing.witnessSignature,
    witnessSignedAt: signing.witnessSignedAt,
    adminSignature: signing.adminSignature,
    adminSignedAt: signing.adminSignedAt,
    createdAt: signing.createdAt,
  });
}

// POST /api/signing/sign – submit a signature (public, token-based auth)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, signature } = body;

  if (!token || !signature) {
    return NextResponse.json({ error: "Token and signature are required" }, { status: 400 });
  }

  const signing = await prisma.signingRequest.findFirst({
    where: {
      OR: [
        { signerToken: token },
        { witnessToken: token },
        { adminToken: token },
      ],
    },
  });

  if (!signing) {
    return NextResponse.json({ error: "Invalid signing link" }, { status: 404 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://support.globaltest.net.za";
  const now = new Date();

  // Determine role and validate correct step
  if (token === signing.signerToken) {
    if (signing.status !== "PENDING_SIGNER") {
      return NextResponse.json({ error: "This document has already been signed by the signer" }, { status: 400 });
    }

    await prisma.signingRequest.update({
      where: { id: signing.id },
      data: {
        signerSignature: signature,
        signerSignedAt: now,
        status: "PENDING_WITNESS",
      },
    });

    // Send email to witness
    const witnessUrl = `${baseUrl}/sign?token=${signing.witnessToken}`;
    await sendEmail({
      to: signing.witnessEmail!,
      subject: `Witness signature required: ${signing.documentName}`,
      html: signingRequestTemplate(signing.witnessName!, signing.documentName, witnessUrl, "witness"),
    });

    return NextResponse.json({ success: true, nextStep: "PENDING_WITNESS" });
  }

  if (token === signing.witnessToken) {
    if (signing.status !== "PENDING_WITNESS") {
      return NextResponse.json({ error: "This document is not ready for witness signature" }, { status: 400 });
    }

    await prisma.signingRequest.update({
      where: { id: signing.id },
      data: {
        witnessSignature: signature,
        witnessSignedAt: now,
        status: "PENDING_ADMIN",
      },
    });

    // Send email to admin (the person who created the signing request)
    const creator = await prisma.user.findUnique({ where: { id: signing.createdBy } });
    if (creator) {
      const adminUrl = `${baseUrl}/sign?token=${signing.adminToken}`;
      await sendEmail({
        to: creator.email,
        subject: `Your countersignature required: ${signing.documentName}`,
        html: signingRequestTemplate(
          `${creator.firstName} ${creator.lastName}`,
          signing.documentName,
          adminUrl,
          "admin"
        ),
      });
    }

    return NextResponse.json({ success: true, nextStep: "PENDING_ADMIN" });
  }

  if (token === signing.adminToken) {
    if (signing.status !== "PENDING_ADMIN") {
      return NextResponse.json({ error: "This document is not ready for admin signature" }, { status: 400 });
    }

    await prisma.signingRequest.update({
      where: { id: signing.id },
      data: {
        adminSignature: signature,
        adminSignedAt: now,
        status: "COMPLETED",
      },
    });

    // Notify signer and witness that signing is complete
    const completeHtml = signingCompleteTemplate(
      signing.documentName,
      signing.signerName,
      signing.witnessName || ""
    );

    await sendEmail({
      to: signing.signerEmail,
      subject: `Document fully signed: ${signing.documentName}`,
      html: completeHtml,
    });

    if (signing.witnessEmail) {
      await sendEmail({
        to: signing.witnessEmail,
        subject: `Document fully signed: ${signing.documentName}`,
        html: completeHtml,
      });
    }

    return NextResponse.json({ success: true, nextStep: "COMPLETED" });
  }

  return NextResponse.json({ error: "Invalid token" }, { status: 400 });
}
