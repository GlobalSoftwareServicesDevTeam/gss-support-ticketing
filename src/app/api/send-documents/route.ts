import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail, documentDeliveryTemplate } from "@/lib/email";
import { generateDocumentPdf, DocumentInput } from "@/lib/pdf-generator";

// GET /api/send-documents — list sent documents + customers
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type");

  if (type === "customers") {
    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        company: true,
        contactPerson: true,
        emailAddress: true,
        address: true,
        vatNumber: true,
      },
      orderBy: { company: "asc" },
    });
    return NextResponse.json(customers);
  }

  if (type === "next-number") {
    const docType = req.nextUrl.searchParams.get("docType") || "INVOICE";
    const prefixes: Record<string, string> = {
      INVOICE: "INV",
      QUOTE: "QUO",
      STATEMENT: "STM",
      REPORT: "RPT",
    };
    const prefix = prefixes[docType] || "DOC";
    const count = await prisma.sentDocument.count({
      where: { documentType: docType },
    });
    const nextNo = `${prefix}-${String(count + 1).padStart(4, "0")}`;
    return NextResponse.json({ nextNo });
  }

  const docs = await prisma.sentDocument.findMany({
    orderBy: { sentAt: "desc" },
    take: 100,
  });

  return NextResponse.json(docs);
}

// POST /api/send-documents — generate PDF + optionally email
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    sendViaEmail,
    emailSubject,
    emailMessage,
    ...docData
  } = body as {
    sendViaEmail?: boolean;
    emailSubject?: string;
    emailMessage?: string;
  } & DocumentInput;

  // Validate required fields
  if (!docData.type || !docData.documentNo || !docData.clientName) {
    return NextResponse.json(
      { error: "Document type, number, and client name are required" },
      { status: 400 }
    );
  }

  // Generate PDF
  const pdfArrayBuffer = generateDocumentPdf(docData);
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  const filename = `${docData.type.toLowerCase()}-${docData.documentNo}.pdf`;

  if (sendViaEmail) {
    if (!docData.clientEmail) {
      return NextResponse.json(
        { error: "Client email is required for sending" },
        { status: 400 }
      );
    }

    const html = documentDeliveryTemplate(
      docData.clientName,
      docData.type,
      docData.documentNo,
      emailMessage
    );

    await sendEmail({
      to: docData.clientEmail,
      subject:
        emailSubject ||
        `${docData.type} #${docData.documentNo} from Global Software Services`,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // Record sent document
    await prisma.sentDocument.create({
      data: {
        documentType: docData.type,
        documentNo: docData.documentNo,
        title: docData.title || "",
        clientName: docData.clientName,
        clientEmail: docData.clientEmail,
        clientCompany: docData.clientCompany || null,
        totalAmount: docData.totalAmount ?? null,
        sentBy: session.user.id,
        sentByName: session.user.name || null,
      },
    });

    logAudit({
      action: "SEND",
      entity: "DOCUMENT",
      entityId: docData.documentNo,
      description: `Sent ${docData.type} #${docData.documentNo} to ${docData.clientEmail}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ ok: true, message: "Document sent successfully" });
  }

  // Download only — return PDF binary
  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
