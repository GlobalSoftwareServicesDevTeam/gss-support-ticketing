import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const CONTRACT_LABELS: Record<string, string> = {
  NDA: "Mutual Non-Disclosure Agreement",
  WEBSITE_DESIGN: "Website Design Agreement",
  SOFTWARE_DEVELOPMENT: "Software Development Agreement",
  MAINTENANCE: "Software Maintenance Agreement",
};

const GSS_INFO = {
  company: "Global Software Services (Pty) Ltd",
  representative: "Nathan Avis",
  title: "Director",
  address: "7 Kromiet Avenue, Waldrift, Vereeniging, 1939",
  email: "nathan@globalsoftwareservices.co.za",
  phone: "071 680 9898",
};

interface ContractFormData {
  clientCompany?: string;
  clientRepName?: string;
  clientRepTitle?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientRegNumber?: string;
  clientVatNumber?: string;
  effectiveDate?: string;
  projectDescription?: string;
  projectTimeline?: string;
  projectCost?: string;
  maintenanceMonthlyFee?: string;
  maintenanceStartDate?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "[Date]";
  try {
    return new Date(dateStr).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function generateContractHtml(contractType: string, formData: ContractFormData, signature: string, signedAt: Date): string {
  const f = formData;
  const date = formatDate(f.effectiveDate);
  const client = f.clientCompany || "[Client Company]";
  const clientRep = f.clientRepName || "[Client Representative]";
  const clientTitle = f.clientRepTitle || "[Title]";
  const clientAddress = f.clientAddress || "[Client Address]";
  const signedDate = signedAt.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });

  let contractBody = "";

  if (contractType === "NDA") {
    contractBody = `
      <h2 style="text-align:center;">MUTUAL NON-DISCLOSURE AGREEMENT</h2>
      <p>This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of <strong>${date}</strong> by and between:</p>
      <p><strong>Party A:</strong> ${GSS_INFO.company}<br/>Address: ${GSS_INFO.address}<br/>Represented by: ${GSS_INFO.representative}, ${GSS_INFO.title}</p>
      <p><strong>Party B:</strong> ${client}<br/>Address: ${clientAddress}<br/>Represented by: ${clientRep}, ${clientTitle}</p>
      <p><strong>Collectively referred to as the "Parties" and individually as a "Party".</strong></p>
      <h3>1. PURPOSE</h3>
      <p>The Parties wish to explore a potential business relationship related to software development and IT services. In the course of discussions, each Party may disclose Confidential Information to the other. This Agreement is intended to protect the confidentiality of such information.</p>
      <h3>2. DEFINITION OF CONFIDENTIAL INFORMATION</h3>
      <p>"Confidential Information" means any and all non-public information disclosed by one Party to the other, whether in writing, orally, electronically, or by inspection, including but not limited to: trade secrets, business plans, source code, algorithms, software designs, technical data, customer lists, financial information, marketing strategies, and any other proprietary information.</p>
      <h3>3. OBLIGATIONS OF RECEIVING PARTY</h3>
      <p>Each Party agrees to:</p>
      <ul>
        <li>Hold and maintain the other Party's Confidential Information in strict confidence.</li>
        <li>Not disclose the Confidential Information to any third parties without prior written consent.</li>
        <li>Use the Confidential Information solely for the purpose of evaluating the potential business relationship.</li>
        <li>Take reasonable measures to protect the secrecy of the Confidential Information, at least equal to the measures it takes to protect its own confidential information.</li>
      </ul>
      <h3>4. EXCLUSIONS</h3>
      <p>Confidential Information does not include information that:</p>
      <ul>
        <li>Was already publicly available at the time of disclosure;</li>
        <li>Becomes publicly available through no fault of the receiving Party;</li>
        <li>Was already known to the receiving Party prior to disclosure, as documented by written records;</li>
        <li>Is independently developed by the receiving Party without use of the disclosing Party's Confidential Information;</li>
        <li>Is disclosed with the prior written approval of the disclosing Party.</li>
      </ul>
      <h3>5. TERM</h3>
      <p>This Agreement shall remain in effect for a period of two (2) years from the date of execution. The obligations of confidentiality shall survive termination of this Agreement.</p>
      <h3>6. RETURN OF INFORMATION</h3>
      <p>Upon termination of this Agreement or upon request, each Party shall promptly return or destroy all Confidential Information received from the other Party, including all copies.</p>
      <h3>7. REMEDIES</h3>
      <p>Each Party acknowledges that any breach of this Agreement may cause irreparable harm and that the disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law.</p>
      <h3>8. GOVERNING LAW</h3>
      <p>This Agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa.</p>
      <h3>9. ENTIRE AGREEMENT</h3>
      <p>This Agreement constitutes the entire agreement between the Parties concerning the subject matter hereof and supersedes all prior agreements, understandings, and communications.</p>
    `;
  } else if (contractType === "WEBSITE_DESIGN") {
    contractBody = `
      <h2 style="text-align:center;">WEBSITE DESIGN AGREEMENT</h2>
      <p>This Website Design Agreement ("Agreement") is entered into as of <strong>${date}</strong> by and between:</p>
      <p><strong>Service Provider:</strong> ${GSS_INFO.company}<br/>Address: ${GSS_INFO.address}</p>
      <p><strong>Client:</strong> ${client}<br/>Address: ${clientAddress}<br/>Contact: ${clientRep}, ${clientTitle}</p>
      <h3>1. SCOPE OF WORK</h3>
      <p>The Service Provider agrees to design, develop, and deliver a website for the Client as described: <strong>${f.projectDescription || "[To be defined]"}</strong></p>
      <h3>2. TIMELINE</h3>
      <p>The project is estimated to be completed within: <strong>${f.projectTimeline || "[To be agreed]"}</strong></p>
      <h3>3. COMPENSATION</h3>
      <p>The Client agrees to pay: <strong>${f.projectCost || "[To be quoted]"}</strong> as per the invoice schedule provided by the Service Provider.</p>
      <h3>4. INTELLECTUAL PROPERTY</h3>
      <p>Upon full payment, the Client shall own the design and content of the final website. The Service Provider retains ownership of any proprietary tools, frameworks, or reusable components used in the development process.</p>
      <h3>5. CLIENT RESPONSIBILITIES</h3>
      <p>The Client agrees to provide all required content, images, branding materials, and feedback in a timely manner to avoid project delays.</p>
      <h3>6. WARRANTIES</h3>
      <p>The Service Provider warrants that the website will be free from material defects for a period of 30 days after delivery. Bug fixes during this period are included.</p>
      <h3>7. LIMITATION OF LIABILITY</h3>
      <p>The Service Provider's liability under this Agreement shall not exceed the total amount paid by the Client.</p>
      <h3>8. GOVERNING LAW</h3>
      <p>This Agreement shall be governed by the laws of the Republic of South Africa.</p>
    `;
  } else if (contractType === "SOFTWARE_DEVELOPMENT") {
    contractBody = `
      <h2 style="text-align:center;">SOFTWARE DEVELOPMENT AGREEMENT</h2>
      <p>This Software Development Agreement ("Agreement") is entered into as of <strong>${date}</strong> by and between:</p>
      <p><strong>Developer:</strong> ${GSS_INFO.company}<br/>Address: ${GSS_INFO.address}</p>
      <p><strong>Client:</strong> ${client}<br/>Address: ${clientAddress}<br/>Contact: ${clientRep}, ${clientTitle}</p>
      <h3>1. SCOPE OF DEVELOPMENT</h3>
      <p>The Developer agrees to design, develop, test, and deliver software as described: <strong>${f.projectDescription || "[To be defined]"}</strong></p>
      <h3>2. PROJECT TIMELINE</h3>
      <p>Estimated delivery timeline: <strong>${f.projectTimeline || "[To be agreed]"}</strong></p>
      <h3>3. COMPENSATION</h3>
      <p>The Client agrees to pay: <strong>${f.projectCost || "[To be quoted]"}</strong> according to milestones and invoices issued by the Developer.</p>
      <h3>4. INTELLECTUAL PROPERTY</h3>
      <p>Upon full payment, the Client shall own the custom software developed specifically for this project. The Developer retains ownership of all pre-existing code libraries, frameworks, tools, and reusable components.</p>
      <h3>5. CONFIDENTIALITY</h3>
      <p>Both Parties agree to keep confidential all proprietary information shared during the project, subject to the Mutual Non-Disclosure Agreement signed between the Parties.</p>
      <h3>6. TESTING & ACCEPTANCE</h3>
      <p>The Client will be given a 14-day acceptance period after delivery to review and test the software. Acceptance is deemed given if no written objections are raised within this period.</p>
      <h3>7. WARRANTY</h3>
      <p>The Developer warrants the software will be free from material defects for 60 days after delivery. Bug fixes during this period are included at no additional cost.</p>
      <h3>8. LIMITATION OF LIABILITY</h3>
      <p>The Developer's total liability shall not exceed the total fees paid by the Client under this Agreement.</p>
      <h3>9. TERMINATION</h3>
      <p>Either Party may terminate this Agreement with 30 days' written notice. The Client shall pay for all work completed up to the date of termination.</p>
      <h3>10. GOVERNING LAW</h3>
      <p>This Agreement shall be governed by the laws of the Republic of South Africa.</p>
    `;
  } else if (contractType === "MAINTENANCE") {
    const maintStart = f.maintenanceStartDate ? formatDate(f.maintenanceStartDate) : "[Start Date]";
    contractBody = `
      <h2 style="text-align:center;">SOFTWARE MAINTENANCE AGREEMENT</h2>
      <p>This Software Maintenance Agreement ("Agreement") is entered into as of <strong>${date}</strong> by and between:</p>
      <p><strong>Service Provider:</strong> ${GSS_INFO.company}<br/>Address: ${GSS_INFO.address}</p>
      <p><strong>Client:</strong> ${client}<br/>Address: ${clientAddress}<br/>Contact: ${clientRep}, ${clientTitle}</p>
      <h3>1. SCOPE OF MAINTENANCE</h3>
      <p>The Service Provider agrees to provide ongoing maintenance and support services for the Client's software, including: bug fixes, security patches, performance optimization, minor feature enhancements, and technical support.</p>
      <h3>2. MONTHLY FEE</h3>
      <p>The Client agrees to pay a monthly maintenance fee of: <strong>${f.maintenanceMonthlyFee || "[To be agreed]"}</strong>, payable on the first business day of each month.</p>
      <h3>3. COMMENCEMENT</h3>
      <p>Maintenance services commence on: <strong>${maintStart}</strong></p>
      <h3>4. RESPONSE TIMES</h3>
      <ul>
        <li>Critical issues: Response within 4 business hours</li>
        <li>High priority: Response within 8 business hours</li>
        <li>Medium priority: Response within 2 business days</li>
        <li>Low priority: Response within 5 business days</li>
      </ul>
      <h3>5. EXCLUSIONS</h3>
      <p>This Agreement does not cover: new feature development, hardware issues, third-party software problems, or issues caused by unauthorized modifications.</p>
      <h3>6. TERMINATION</h3>
      <p>Either Party may terminate this Agreement with 30 days' written notice. Outstanding fees remain payable.</p>
      <h3>7. GOVERNING LAW</h3>
      <p>This Agreement shall be governed by the laws of the Republic of South Africa.</p>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${CONTRACT_LABELS[contractType]} - ${client}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #222; line-height: 1.6; }
    h2 { margin-top: 0; }
    h3 { margin-top: 24px; margin-bottom: 8px; }
    ul { margin-top: 4px; }
    .signature-block { margin-top: 40px; border-top: 2px solid #333; padding-top: 20px; }
    .signature-block table { width: 100%; border-collapse: collapse; }
    .signature-block td { vertical-align: top; padding: 8px 16px; width: 50%; }
    .sig-img { max-width: 250px; max-height: 100px; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
  </style>
</head>
<body>
  ${contractBody}
  <div class="signature-block">
    <table>
      <tr>
        <td>
          <strong>${GSS_INFO.company}</strong><br/>
          <br/><br/><br/>
          ___________________________<br/>
          ${GSS_INFO.representative}<br/>
          ${GSS_INFO.title}<br/>
        </td>
        <td>
          <strong>${client}</strong><br/>
          <img src="${signature}" alt="Signature" class="sig-img"/><br/>
          ___________________________<br/>
          ${clientRep}<br/>
          ${clientTitle}<br/>
          <small>Signed electronically on ${signedDate}</small>
        </td>
      </tr>
    </table>
  </div>
  <div class="footer">
    Document generated by Global Software Services Support Portal<br/>
    Signed electronically on ${signedDate}
  </div>
</body>
</html>`;
}

// POST: Backfill documents for all previously signed contracts that don't have a document yet
// Admin only
export async function POST(req: Request) {
  // Allow auth via admin session OR one-time secret header for CLI use
  const secretHeader = req.headers.get("x-backfill-secret");
  const expectedSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  let userId = "system";

  if (secretHeader && expectedSecret && secretHeader === expectedSecret) {
    // CLI auth via NEXTAUTH_SECRET
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (admin) userId = admin.id;
  } else {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    userId = session.user.id;
  }

  // Get all signed contracts
  const signedContracts = await prisma.clientContract.findMany({
    where: { status: "SIGNED", signature: { not: null } },
    include: {
      contact: {
        include: { customer: true },
      },
    },
  });

  // Get existing contract documents to avoid duplicates
  const existingDocs = await prisma.document.findMany({
    where: {
      category: "LEGAL",
      fileName: { startsWith: "NDA_" },
    },
    select: { fileName: true },
  });
  // Also check for other contract types
  const allContractDocs = await prisma.document.findMany({
    where: {
      category: "LEGAL",
      OR: [
        { fileName: { startsWith: "NDA_" } },
        { fileName: { startsWith: "WEBSITE_DESIGN_" } },
        { fileName: { startsWith: "SOFTWARE_DEVELOPMENT_" } },
        { fileName: { startsWith: "MAINTENANCE_" } },
      ],
    },
    select: { fileName: true },
  });
  const existingFileNames = new Set([
    ...existingDocs.map((d) => d.fileName),
    ...allContractDocs.map((d) => d.fileName),
  ]);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const contract of signedContracts) {
    try {
      const formData: ContractFormData = contract.formData ? JSON.parse(contract.formData) : {};
      const signedAt = contract.signedAt || contract.createdAt;
      const company = formData.clientCompany || contract.contact?.customer?.company || "Client";
      const sanitizedCompany = company.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const dateStr = signedAt.toISOString().split("T")[0];
      const fileName = `${contract.contractType}_${sanitizedCompany}_${dateStr}.html`;

      if (existingFileNames.has(fileName)) {
        skipped++;
        continue;
      }

      // Fill in missing formData from customer/contact records if available
      if (!formData.clientCompany && contract.contact?.customer?.company) {
        formData.clientCompany = contract.contact.customer.company;
      }
      if (!formData.clientRepName && contract.contact) {
        formData.clientRepName = `${contract.contact.firstName} ${contract.contact.lastName}`;
      }
      if (!formData.clientEmail && contract.contact?.email) {
        formData.clientEmail = contract.contact.email;
      }
      if (!formData.clientPhone && contract.contact?.phone) {
        formData.clientPhone = contract.contact.phone;
      }
      if (!formData.clientRepTitle && contract.contact?.position) {
        formData.clientRepTitle = contract.contact.position;
      }
      if (!formData.clientAddress && contract.contact?.customer?.address) {
        formData.clientAddress = contract.contact.customer.address;
      }
      if (!formData.clientRegNumber && contract.contact?.customer?.regNumber) {
        formData.clientRegNumber = contract.contact.customer.regNumber;
      }
      if (!formData.clientVatNumber && contract.contact?.customer?.vatNumber) {
        formData.clientVatNumber = contract.contact.customer.vatNumber;
      }

      const html = generateContractHtml(contract.contractType, formData, contract.signature!, signedAt);
      const htmlBase64 = Buffer.from(html, "utf-8").toString("base64");
      const label = CONTRACT_LABELS[contract.contractType] || contract.contractType;

      await prisma.document.create({
        data: {
          name: `${label} - ${company} (Signed ${dateStr})`,
          fileName,
          fileExt: "html",
          fileBase64: htmlBase64,
          fileSize: Buffer.byteLength(html, "utf-8"),
          category: "LEGAL",
          notes: `Electronically signed ${label} between Global Software Services and ${company}. Signed by ${formData.clientRepName || "client representative"} on ${dateStr}. [Backfilled]`,
          uploadedBy: contract.userId,
        },
      });

      existingFileNames.add(fileName);
      created++;
    } catch (err) {
      errors.push(`${contract.contractType} (${contract.id}): ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  logAudit({
    action: "CREATE",
    entity: "DOCUMENT",
    entityId: "backfill",
    description: `Backfilled ${created} contract documents (${skipped} already existed)`,
    userId,
  });

  return NextResponse.json({
    success: true,
    total: signedContracts.length,
    created,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
