import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const CONTRACT_TYPES = ["NDA", "WEBSITE_DESIGN", "SOFTWARE_DEVELOPMENT", "MAINTENANCE"] as const;

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

async function createContractDocument(contractType: string, formData: ContractFormData, signature: string, signedAt: Date, userId: string): Promise<void> {
  const label = CONTRACT_LABELS[contractType] || contractType;
  const company = formData.clientCompany || "Client";
  const sanitizedCompany = company.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const dateStr = signedAt.toISOString().split("T")[0];

  const html = generateContractHtml(contractType, formData, signature, signedAt);
  const htmlBase64 = Buffer.from(html, "utf-8").toString("base64");

  const fileName = `${contractType}_${sanitizedCompany}_${dateStr}.html`;

  await prisma.document.create({
    data: {
      name: `${label} - ${company} (Signed ${dateStr})`,
      fileName,
      fileExt: "html",
      fileBase64: htmlBase64,
      fileSize: Buffer.byteLength(html, "utf-8"),
      category: "LEGAL",
      notes: `Electronically signed ${label} between Global Software Services and ${company}. Signed by ${formData.clientRepName || "client representative"} on ${dateStr}.`,
      uploadedBy: userId,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "DOCUMENT",
    entityId: "contract-" + contractType,
    description: `Signed contract document created: ${label} - ${company}`,
    userId,
  });
}

// GET: Retrieve contracts for the logged-in user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Find the contact record for this user
  const contact = await prisma.contact.findFirst({
    where: { userId, inviteAccepted: true, isPrimary: true },
    include: { customer: true },
  });

  if (!contact) {
    return NextResponse.json({ contracts: [], required: false });
  }

  // Get existing contracts for this contact
  const contracts = await prisma.clientContract.findMany({
    where: { contactId: contact.id },
  });

  // Determine which contracts still need action
  const signedTypes = contracts
    .filter((c) => c.status === "SIGNED")
    .map((c) => c.contractType);

  const ndaSigned = signedTypes.includes("NDA");

  return NextResponse.json({
    contracts,
    required: !ndaSigned,
    customer: {
      id: contact.customer.id,
      company: contact.customer.company,
      contactPerson: contact.customer.contactPerson,
      emailAddress: contact.customer.emailAddress,
      address: contact.customer.address,
      vatNumber: contact.customer.vatNumber,
      regNumber: contact.customer.regNumber,
    },
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      position: contact.position,
    },
  });
}

// POST: Sign a contract
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contractType, formData, signature } = body;

  if (!contractType || !CONTRACT_TYPES.includes(contractType)) {
    return NextResponse.json({ error: "Invalid contract type" }, { status: 400 });
  }

  if (!signature) {
    return NextResponse.json({ error: "Signature is required" }, { status: 400 });
  }

  if (!formData) {
    return NextResponse.json({ error: "Form data is required" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { userId: session.user.id, inviteAccepted: true, isPrimary: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Only primary contacts can sign contracts" }, { status: 403 });
  }

  // NDA must be signed before other contracts
  if (contractType !== "NDA") {
    const ndaSigned = await prisma.clientContract.findFirst({
      where: { contactId: contact.id, contractType: "NDA", status: "SIGNED" },
    });
    if (!ndaSigned) {
      return NextResponse.json({ error: "NDA must be signed first" }, { status: 400 });
    }
  }

  // Upsert the contract (in case they previously skipped)
  const contract = await prisma.clientContract.upsert({
    where: {
      contactId_contractType: {
        contactId: contact.id,
        contractType,
      },
    },
    update: {
      status: "SIGNED",
      formData: JSON.stringify(formData),
      signature,
      signedAt: new Date(),
      skippedAt: null,
    },
    create: {
      contractType,
      status: "SIGNED",
      formData: JSON.stringify(formData),
      signature,
      signedAt: new Date(),
      contactId: contact.id,
      customerId: contact.customerId,
      userId: session.user.id,
    },
  });

  // Notify admin
  try {
    const { sendEmail, contractSignedAdminTemplate } = await import("@/lib/email");
    const settings = await prisma.systemSetting.findFirst({ where: { key: "admin_email" } });
    const adminEmail = settings?.value || "nathan@globalsoftwareservices.co.za";
    await sendEmail({
      to: adminEmail,
      subject: `Contract Signed: ${CONTRACT_LABELS[contractType]} - ${contact.firstName} ${contact.lastName}`,
      html: contractSignedAdminTemplate(
        CONTRACT_LABELS[contractType],
        `${contact.firstName} ${contact.lastName}`,
        contact.email,
      ),
    });
  } catch {
    // Don't fail the sign operation if email fails
  }

  // Create a signed document record
  try {
    const parsedForm = typeof formData === "string" ? JSON.parse(formData) : formData;
    await createContractDocument(
      contractType,
      parsedForm,
      signature,
      contract.signedAt || new Date(),
      session.user.id,
    );
  } catch {
    // Don't fail the sign operation if document creation fails
  }

  return NextResponse.json({ success: true, contract });
}
