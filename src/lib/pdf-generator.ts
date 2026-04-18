import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface PdfTransaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface PdfReportSection {
  heading: string;
  content: string;
}

export interface DocumentInput {
  type: "INVOICE" | "QUOTE" | "STATEMENT" | "REPORT";
  documentNo: string;
  title: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  clientName: string;
  clientEmail?: string;
  clientCompany?: string;
  clientAddress?: string;
  lineItems?: PdfLineItem[];
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  totalAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
  statementPeriod?: string;
  openingBalance?: number;
  closingBalance?: number;
  transactions?: PdfTransaction[];
  reportSections?: PdfReportSection[];
  notes?: string;
}

const BRAND_COLOR: [number, number, number] = [26, 43, 71];
const TEXT_COLOR: [number, number, number] = [30, 41, 59];
const MUTED_COLOR: [number, number, number] = [100, 116, 139];
const ALT_ROW: [number, number, number] = [248, 250, 252];

export function generateDocumentPdf(input: DocumentInput): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Header banner ──
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pageWidth, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Global Software Services", 14, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("support.globalsoftwareservices.co.za", 14, 23);
  doc.text("support@globalsoftwareservices.co.za", 14, 28);

  // Document type badge (right side)
  const typeLabel = input.type;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(typeLabel, pageWidth - 14, 16, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`#${input.documentNo}`, pageWidth - 14, 24, { align: "right" });

  // ── Client info (left) + Document details (right) ──
  let yLeft = 46;
  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(input.type === "STATEMENT" ? "Account Holder:" : "Bill To:", 14, yLeft);
  doc.setFont("helvetica", "normal");
  yLeft += 5;
  if (input.clientCompany) {
    doc.setFont("helvetica", "bold");
    doc.text(input.clientCompany, 14, yLeft);
    doc.setFont("helvetica", "normal");
    yLeft += 5;
  }
  if (input.clientName) { doc.text(input.clientName, 14, yLeft); yLeft += 5; }
  if (input.clientEmail) {
    doc.setTextColor(...MUTED_COLOR);
    doc.text(input.clientEmail, 14, yLeft);
    doc.setTextColor(...TEXT_COLOR);
    yLeft += 5;
  }
  if (input.clientAddress) {
    const addrLines = doc.splitTextToSize(input.clientAddress, 80);
    doc.text(addrLines, 14, yLeft);
    yLeft += addrLines.length * 4.5;
  }

  // Right side details
  let yRight = 46;
  const rLabelX = pageWidth - 70;
  const rValueX = pageWidth - 14;

  const addDetailRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, rLabelX, yRight);
    doc.setFont("helvetica", "normal");
    doc.text(value, rValueX, yRight, { align: "right" });
    yRight += 5;
  };

  addDetailRow("Date:", input.date);
  if (input.dueDate) addDetailRow("Due Date:", input.dueDate);
  if (input.validUntil) addDetailRow("Valid Until:", input.validUntil);
  if (input.statementPeriod) addDetailRow("Period:", input.statementPeriod);

  let y = Math.max(yLeft, yRight) + 8;

  // ── Title ──
  if (input.title) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_COLOR);
    doc.text(input.title, 14, y);
    y += 8;
  }

  doc.setTextColor(...TEXT_COLOR);

  // ── Line items table (Invoice / Quote) ──
  if ((input.type === "INVOICE" || input.type === "QUOTE") && input.lineItems?.length) {
    autoTable(doc, {
      startY: y,
      head: [["#", "Description", "Qty", "Unit Price (R)", "Total (R)"]],
      body: input.lineItems.map((item, i) => [
        String(i + 1),
        item.description,
        String(item.qty),
        Number(item.unitPrice).toFixed(2),
        (Number(item.qty) * Number(item.unitPrice)).toFixed(2),
      ]),
      styles: { fontSize: 9, cellPadding: 3, textColor: TEXT_COLOR },
      headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 32, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;

    // Totals block
    const totX = pageWidth - 80;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    if (input.subtotal !== undefined) {
      doc.text("Subtotal:", totX, y);
      doc.text(`R ${Number(input.subtotal).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      y += 6;
    }
    if (input.taxRate !== undefined && input.taxAmount !== undefined) {
      doc.text(`VAT (${input.taxRate}%):`, totX, y);
      doc.text(`R ${Number(input.taxAmount).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      y += 6;
    }
    if (input.totalAmount !== undefined) {
      doc.setDrawColor(200, 200, 200);
      doc.line(totX, y - 2, pageWidth - 14, y - 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Total:", totX, y + 2);
      doc.text(`R ${Number(input.totalAmount).toFixed(2)}`, pageWidth - 14, y + 2, { align: "right" });
      y += 10;
    }
    if (input.amountPaid !== undefined && input.amountPaid > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Amount Paid:", totX, y);
      doc.text(`R ${Number(input.amountPaid).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      y += 6;
    }
    if (input.balanceDue !== undefined) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(185, 28, 28);
      doc.text("Balance Due:", totX, y);
      doc.text(`R ${Number(input.balanceDue).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      doc.setTextColor(...TEXT_COLOR);
      y += 10;
    }
  }

  // ── Transactions table (Statement) ──
  if (input.type === "STATEMENT" && input.transactions?.length) {
    if (input.openingBalance !== undefined) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Opening Balance: R ${Number(input.openingBalance).toFixed(2)}`, 14, y);
      y += 7;
    }

    autoTable(doc, {
      startY: y,
      head: [["Date", "Description", "Debit (R)", "Credit (R)", "Balance (R)"]],
      body: input.transactions.map((t) => [
        t.date,
        t.description,
        t.debit ? Number(t.debit).toFixed(2) : "-",
        t.credit ? Number(t.credit).toFixed(2) : "-",
        Number(t.balance).toFixed(2),
      ]),
      styles: { fontSize: 9, cellPadding: 3, textColor: TEXT_COLOR },
      headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;

    if (input.closingBalance !== undefined) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Closing Balance: R ${Number(input.closingBalance).toFixed(2)}`, 14, y);
      y += 10;
    }
  }

  // ── Report sections ──
  if (input.type === "REPORT" && input.reportSections?.length) {
    for (const section of input.reportSections) {
      if (y > pageHeight - 40) { doc.addPage(); y = 20; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_COLOR);
      doc.text(section.heading, 14, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_COLOR);
      const lines = doc.splitTextToSize(section.content, pageWidth - 28);
      for (let i = 0; i < lines.length; i++) {
        if (y > pageHeight - 20) { doc.addPage(); y = 20; }
        doc.text(lines[i], 14, y);
        y += 4.5;
      }
      y += 6;
    }
  }

  // ── Notes ──
  if (input.notes) {
    if (y > pageHeight - 50) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_COLOR);
    doc.text("Notes", 14, y);
    y += 5;

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    const noteLines = doc.splitTextToSize(input.notes, pageWidth - 32);
    const noteHeight = noteLines.length * 4.5 + 6;
    doc.roundedRect(14, y - 2, pageWidth - 28, noteHeight, 2, 2, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(noteLines, 16, y + 3);
    y += noteHeight + 6;
  }

  // ── Footer ──
  const footerY = pageHeight - 14;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, footerY - 4, pageWidth - 14, footerY - 4);
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("Global Software Services (Pty) Ltd", 14, footerY);
  doc.text("support@globalsoftwareservices.co.za | support.globalsoftwareservices.co.za", 14, footerY + 3.5);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-ZA")}`, pageWidth - 14, footerY, { align: "right" });

  return doc.output("arraybuffer");
}
