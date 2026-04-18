import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/settings";

const BASE_URL = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";
const LOGO_URL = `${BASE_URL}/logo.png`;

interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail({ to, subject, html, text, attachments }: SendEmailOptions) {
  const config = await getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: parseInt(config.SMTP_PORT || "587"),
    secure: config.SMTP_SECURE === "true",
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASSWORD,
    },
  });

  return transporter.sendMail({
    from: `"${config.SMTP_FROM_NAME || "Global Software Services"}" <${config.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ""),
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType || "application/pdf",
    })),
  });
}

function emailLayout(headerColor: string, headerTitle: string, headerSubtitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

          <!-- Logo Banner -->
          <tr>
            <td align="center" style="background-color:#1a2b47;padding:24px 30px 18px;">
              <img src="${LOGO_URL}" alt="Global Software Services" height="56" style="display:block;max-height:56px;max-width:220px;object-fit:contain;" />
            </td>
          </tr>

          <!-- Coloured Header -->
          <tr>
            <td align="center" style="background-color:${headerColor};padding:22px 30px 18px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${headerTitle}</h1>
              ${headerSubtitle ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${headerSubtitle}</p>` : ""}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px 24px;color:#2d3748;font-size:15px;line-height:1.7;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a2b47;">Global Software Services</p>
                    <p style="margin:0 0 2px;font-size:13px;color:#4a5568;">Nathan Avis &nbsp;|&nbsp; Cell: <a href="tel:0716809898" style="color:#2b6cb0;text-decoration:none;">071 680 9898</a></p>
                    <p style="margin:0 0 6px;font-size:13px;color:#4a5568;">7 Kromiet Avenue, Waldrift, Vereeniging, 1939</p>
                    <p style="margin:0;font-size:11px;color:#a0aec0;">This is an automated message from GSS Support. Please do not reply directly to this email unless instructed.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ticketReceivedTemplate(ticketId: string, subject: string, senderName: string): string {
  return emailLayout("#1a2b47", "Support Ticket Received", "Global Software Services", `
    <p>Dear <strong>${senderName}</strong>,</p>
    <p>Thank you for contacting GSS Support. We have received your support request and a ticket has been created.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background-color:#edf2f7;padding:14px 18px;border-radius:6px;border-left:4px solid #1a2b47;font-family:monospace;font-size:14px;">
          <strong>Ticket ID:</strong> ${ticketId}<br/>
          <strong>Subject:</strong> ${subject}
        </td>
      </tr>
    </table>
    <p>Our support team will review your request and respond as soon as possible. You can reply to this email to add additional information to your ticket.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
    <p style="font-size:12px;color:#718096;margin-top:20px;">Please do not delete the ticket reference in the subject line when replying.</p>
  `);
}

export function newIssueAdminTemplate(ticketId: string, subject: string, senderEmail: string, body: string): string {
  return emailLayout("#c53030", "New Support Ticket", "Internal Notification", `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="font-weight:700;color:#4a5568;">Ticket ID:</span>&nbsp; ${ticketId}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="font-weight:700;color:#4a5568;">From:</span>&nbsp; ${senderEmail}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="font-weight:700;color:#4a5568;">Subject:</span>&nbsp; ${subject}</td></tr>
    </table>
    <div style="background:#f7fafc;padding:15px;border-radius:6px;border-left:4px solid #c53030;white-space:pre-wrap;font-size:14px;">${body}</div>
  `);
}

export function issueUpdateTemplate(ticketId: string, message: string, updatedBy: string): string {
  return emailLayout("#2b6cb0", "Ticket Update", "Global Software Services Support", `
    <div style="background-color:#edf2f7;padding:12px 16px;border-radius:6px;font-family:monospace;margin-bottom:20px;">
      <strong>Ticket:</strong> ${ticketId}
    </div>
    <p><strong>${updatedBy}</strong> has added a new message to your ticket:</p>
    <div style="background:#f7fafc;padding:16px;border-radius:6px;border-left:4px solid #2b6cb0;white-space:pre-wrap;font-size:14px;line-height:1.7;">${message}</div>
    <p style="margin-top:20px;font-size:13px;color:#718096;">You can reply to this email to respond to this ticket.</p>
  `);
}

export function signingRequestTemplate(
  recipientName: string,
  documentName: string,
  signingUrl: string,
  role: "signer" | "witness" | "admin"
): string {
  const roleLabel = role === "signer" ? "sign" : role === "witness" ? "witness" : "countersign";
  const headerColor = role === "signer" ? "#2b6cb0" : role === "witness" ? "#6b46c1" : "#2f855a";
  return emailLayout(headerColor, "Document Signing Request", "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>You have been asked to <strong>${roleLabel}</strong> the following document:</p>
    <div style="background:#f7fafc;padding:14px 18px;border-radius:6px;border-left:4px solid ${headerColor};font-weight:700;font-size:15px;margin:16px 0;">${documentName}</div>
    <p>Please click the button below to review and ${roleLabel} the document:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${signingUrl}" style="display:inline-block;background-color:${headerColor};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">Review &amp; Sign Document</a>
    </p>
    <p style="color:#718096;font-size:13px;">If the button doesn&apos;t work, copy this link into your browser:<br/><a href="${signingUrl}" style="color:${headerColor};">${signingUrl}</a></p>
    <p style="font-size:12px;color:#718096;margin-top:20px;">This link is unique to you — do not forward this email.</p>
  `);
}

export function signingCompleteTemplate(documentName: string, signerName: string, witnessName: string): string {
  return emailLayout("#2f855a", "Document Fully Signed", "Global Software Services", `
    <p>The following document has been fully signed by all parties:</p>
    <div style="background:#f0fff4;padding:14px 18px;border-radius:6px;border-left:4px solid #2f855a;font-weight:700;color:#276749;margin:16px 0;">${documentName}</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><strong>Signer:</strong>&nbsp; ${signerName}</td></tr>
      <tr><td style="padding:8px 0;"><strong>Witness:</strong>&nbsp; ${witnessName}</td></tr>
    </table>
    <p>You can view the completed signing request in the GSS Support portal.</p>
  `);
}

export function domainExpiryReminderTemplate(
  recipientName: string,
  domain: string,
  expiryDate: string,
  daysLeft: number,
  invoiceNumber: string | null,
  amount: string | null
): string {
  const urgencyColor = daysLeft <= 7 ? "#c53030" : daysLeft <= 14 ? "#c05621" : "#2b6cb0";
  return emailLayout(urgencyColor, "Domain Renewal Reminder", "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>Your domain name is approaching its expiry date and needs to be renewed to avoid loss of service.</p>
    <div style="background:#edf2f7;padding:14px 18px;border-radius:6px;border-left:4px solid ${urgencyColor};margin:16px 0;">
      <p style="margin:0;"><strong>Domain:</strong> ${domain}</p>
      <p style="margin:6px 0 0;"><strong>Expiry Date:</strong> ${expiryDate}</p>
      <p style="margin:6px 0 0;color:${urgencyColor};font-weight:700;">${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining</p>
    </div>
    ${invoiceNumber ? `<p>An invoice <strong>#${invoiceNumber}</strong>${amount ? ` for <strong>R${amount}</strong>` : ""} has been generated for the domain renewal. Please arrange payment at your earliest convenience.</p>` : ""}
    <p>If you have already arranged payment or wish to discuss your domain, please contact our support team.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
    <p style="font-size:12px;color:#718096;margin-top:16px;">If your domain expires, associated services (email, website) may be interrupted.</p>
  `);
}

export function quoteNotificationTemplate(
  recipientName: string,
  quoteNo: string,
  title: string,
  totalAmount: string,
  validUntil: string | null,
  quoteUrl: string
): string {
  const validLine = validUntil ? `<p style="margin:6px 0 0;"><strong>Valid Until:</strong> ${validUntil}</p>` : "";
  return emailLayout("#2b6cb0", `Quote ${quoteNo}`, "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>We have prepared a quote for you. Please review the details below:</p>
    <div style="background:#f7fafc;padding:14px 18px;border-radius:6px;border-left:4px solid #2b6cb0;margin:16px 0;">
      <p style="margin:0;"><strong>Quote:</strong> ${quoteNo}</p>
      <p style="margin:6px 0 0;"><strong>Description:</strong> ${title}</p>
      <p style="margin:6px 0 0;"><strong>Total Amount:</strong> R${totalAmount}</p>
      ${validLine}
    </div>
    <p>Click the button below to view the full quote, accept or decline it, and provide your signature:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${quoteUrl}" style="display:inline-block;background-color:#2b6cb0;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">View &amp; Respond to Quote</a>
    </p>
    <p style="color:#718096;font-size:13px;">If the button doesn&apos;t work, copy this link into your browser:<br/><a href="${quoteUrl}" style="color:#2b6cb0;">${quoteUrl}</a></p>
    <p style="font-size:12px;color:#718096;margin-top:16px;">This link is unique to you — do not forward this email.</p>
  `);
}

export function hostingCredentialsTemplate(params: {
  recipientName: string;
  domain: string;
  planName: string;
  pleskLogin: string;
  pleskPassword: string;
  ftpLogin: string;
  ftpPassword: string;
}): string {
  const { recipientName, domain, planName, pleskLogin, pleskPassword, ftpLogin, ftpPassword } = params;
  return emailLayout("#276749", "Hosting Account Ready", "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>Your hosting account has been successfully provisioned. Below are your login credentials. Please keep this information safe.</p>

    <p style="font-size:16px;font-weight:700;color:#276749;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Hosting Details</p>
    <div style="background:#f0fff4;padding:14px 18px;border-radius:6px;border-left:4px solid #276749;margin-bottom:16px;">
      <p style="margin:0;"><strong>Domain:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">${domain}</span></p>
      <p style="margin:6px 0 0;"><strong>Plan:</strong> ${planName}</p>
    </div>

    <p style="font-size:16px;font-weight:700;color:#276749;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Control Panel (Plesk)</p>
    <div style="background:#f0fff4;padding:14px 18px;border-radius:6px;border-left:4px solid #276749;margin-bottom:16px;">
      <p style="margin:0;"><strong>Username:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">${pleskLogin}</span></p>
      <p style="margin:6px 0 0;"><strong>Password:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">${pleskPassword}</span></p>
    </div>

    <p style="font-size:16px;font-weight:700;color:#276749;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">FTP Access</p>
    <div style="background:#f0fff4;padding:14px 18px;border-radius:6px;border-left:4px solid #276749;margin-bottom:16px;">
      <p style="margin:0;"><strong>FTP Host:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">ftp.${domain}</span></p>
      <p style="margin:6px 0 0;"><strong>FTP Username:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">${ftpLogin}</span></p>
      <p style="margin:6px 0 0;"><strong>FTP Password:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">${ftpPassword}</span></p>
      <p style="margin:6px 0 0;"><strong>Port:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">21</span></p>
    </div>

    <p style="font-size:16px;font-weight:700;color:#276749;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Webmail</p>
    <div style="background:#f0fff4;padding:14px 18px;border-radius:6px;border-left:4px solid #276749;margin-bottom:16px;">
      <p style="margin:0;"><strong>Webmail URL:</strong> <span style="font-family:monospace;background:#edf2f7;padding:2px 6px;border-radius:3px;">webmail.${domain}</span></p>
      <p style="margin:6px 0 0;">You can create email accounts through your Plesk control panel.</p>
    </div>

    <div style="background:#fffbeb;border-left:4px solid #d69e2e;padding:14px 18px;border-radius:6px;margin:20px 0;font-size:13px;">
      <strong>Important:</strong> We recommend changing your passwords after your first login. Do not share these credentials with anyone. If you suspect unauthorized access, contact GSS Support immediately.
    </div>

    <p>If you need any assistance setting up your hosting, please don&apos;t hesitate to reach out to our support team.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
    <p style="font-size:12px;color:#718096;margin-top:16px;">Please keep this email confidential as it contains sensitive login information.</p>
  `);
}

export function buildApprovalTemplate(params: {
  recipientName: string;
  appName: string;
  platform: string;
  version: string;
  buildNumber: string;
  status: string;
  trackOrChannel?: string | null;
}): string {
  const { recipientName, appName, platform, version, buildNumber, status, trackOrChannel } = params;
  const platformLabel = platform === "GOOGLE_PLAY" ? "Google Play Store" : "Apple App Store";
  const statusColors: Record<string, string> = {
    APPROVED: "#276749",
    RELEASED: "#2b6cb0",
    REJECTED: "#c53030",
    IN_REVIEW: "#c05621",
  };
  const headerColor = statusColors[status] || "#2b6cb0";
  const statusLabel = status === "RELEASED" ? "Released" : status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "In Review";

  return emailLayout(headerColor, `Build ${statusLabel}`, platformLabel, `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>We&apos;re writing to let you know that your app build status has been updated:</p>
    <div style="background:#f7fafc;padding:14px 18px;border-radius:6px;border-left:4px solid ${headerColor};margin:16px 0;">
      <p style="margin:0;"><strong>App:</strong> ${appName}</p>
      <p style="margin:6px 0 0;"><strong>Platform:</strong> ${platformLabel}</p>
      <p style="margin:6px 0 0;"><strong>Version:</strong> ${version}</p>
      <p style="margin:6px 0 0;"><strong>Build Number:</strong> ${buildNumber}</p>
      ${trackOrChannel ? `<p style="margin:6px 0 0;"><strong>Track / Channel:</strong> ${trackOrChannel}</p>` : ""}
      <p style="margin:6px 0 0;"><strong>Status:</strong> <span style="display:inline-block;padding:3px 12px;border-radius:12px;font-weight:700;font-size:13px;color:#fff;background-color:${headerColor};">${statusLabel}</span></p>
    </div>
    ${status === "RELEASED" ? "<p>Your app is now live and available for users to download.</p>" : ""}
    ${status === "APPROVED" ? "<p>Your build has been approved and is ready for release.</p>" : ""}
    ${status === "REJECTED" ? "<p>Unfortunately, this build was rejected. Please check the store console for details and resubmit after making the required changes.</p>" : ""}
    <p>You can view detailed app statistics and build history in the GSS Support portal.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
  `);
}
export function sslExpiryReminderTemplate(
  recipientName: string,
  commonName: string,
  productType: string,
  expiryDate: string,
  daysLeft: number,
  invoiceNumber: string | null,
  amount: string | null
): string {
  const urgencyColor = daysLeft <= 7 ? "#c53030" : daysLeft <= 14 ? "#c05621" : "#2b6cb0";
  return emailLayout(urgencyColor, "SSL Certificate Renewal", "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>Your SSL certificate is approaching its expiry date and needs to be renewed to maintain secure connections for your website.</p>
    <div style="background:#edf2f7;padding:14px 18px;border-radius:6px;border-left:4px solid ${urgencyColor};margin:16px 0;">
      <p style="margin:0;"><strong>Domain:</strong> ${commonName}</p>
      <p style="margin:6px 0 0;"><strong>Certificate Type:</strong> ${productType}</p>
      <p style="margin:6px 0 0;"><strong>Expiry Date:</strong> ${expiryDate}</p>
      <p style="margin:6px 0 0;color:${urgencyColor};font-weight:700;">${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining</p>
    </div>
    ${invoiceNumber ? `<p>An invoice <strong>#${invoiceNumber}</strong>${amount ? ` for <strong>R${amount}</strong>` : ""} has been generated for the SSL certificate renewal. Please arrange payment at your earliest convenience to avoid any interruption to your secure connection.</p>` : ""}
    <p>If your SSL certificate expires, your website visitors will see security warnings and your site may become inaccessible via HTTPS.</p>
    <p>If you have already arranged payment or wish to discuss your SSL renewal, please contact our support team.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
    <p style="font-size:12px;color:#718096;margin-top:16px;">An expired SSL certificate will cause browser security warnings for your visitors.</p>
  `);
}

export function testEmailNoticeTemplate(recipientName: string): string {
  return emailLayout("#744210", "Important Notice", "Global Software Services", `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>You may have recently received one or more invitation emails to the <strong>GSS Support Portal</strong>. Please <strong>disregard those emails entirely</strong> — they were sent during our internal testing phase and the invitation links contained in them are no longer valid.</p>
    <div style="background:#fffbeb;padding:14px 18px;border-radius:6px;border-left:4px solid #d97706;margin:16px 0;">
      <p style="margin:0;font-weight:700;color:#92400e;">Please do not use any links from previous invitation emails.</p>
      <p style="margin:8px 0 0;color:#78350f;font-size:14px;">A new, official invitation will be sent to you shortly with a valid link to set up your account.</p>
    </div>
    <p>We apologise for any confusion this may have caused. We look forward to welcoming you to the GSS Support Portal.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
  `);
}

export function quoteRequestTemplate(params: {
  userName: string;
  userEmail: string;
  projectName: string;
  projectType: string;
  description: string;
  budget?: string;
  deadline?: string;
  notes?: string;
}): string {
  const { userName, userEmail, projectName, projectType, description, budget, deadline, notes } = params;
  return emailLayout("#1a2b47", "New Quote Request", "Global Software Services", `
    <p>A client has submitted a quote request via the Support Portal.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;width:140px;color:#2d3748;">From</td><td style="padding:10px 14px;">${userName} &lt;${userEmail}&gt;</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Project Name</td><td style="padding:10px 14px;">${projectName}</td></tr>
      <tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Project Type</td><td style="padding:10px 14px;">${projectType}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Description</td><td style="padding:10px 14px;white-space:pre-wrap;">${description}</td></tr>
      ${budget ? `<tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Budget</td><td style="padding:10px 14px;">${budget}</td></tr>` : ""}
      ${deadline ? `<tr${budget ? "" : ' style="background:#f7fafc;"'}><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Deadline</td><td style="padding:10px 14px;">${deadline}</td></tr>` : ""}
      ${notes ? `<tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Additional Notes</td><td style="padding:10px 14px;white-space:pre-wrap;">${notes}</td></tr>` : ""}
    </table>
    <p style="margin-top:24px;">Please follow up with the client at your earliest convenience.</p>
    <p style="margin-top:24px;">GSS Support Portal</p>
  `);
}

export function contactInviteTemplate(firstName: string, company: string, acceptUrl: string): string {
  const companyLine = company ? ` on behalf of <strong>${company}</strong>` : "";
  return emailLayout(
    "#1a2b47",
    "Welcome to the GSS Support Portal",
    "Your dedicated client portal is ready for you",
    `
    <p style="font-size:16px;color:#2d3748;margin:0 0 10px;">Dear <strong>${firstName}</strong>,</p>
    <p style="color:#4a5568;margin:0 0 20px;">You have been invited to access the <strong>Global Software Services Support Portal</strong>${companyLine}. This platform has been purpose-built to give you full transparency, real-time communication, and self-service access to everything related to your relationship with us.</p>

    <!-- Why we built it -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#eef2ff;border-left:4px solid #465fff;border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:14px;color:#3730a3;font-weight:600;">Why we built this portal for you</p>
        <p style="margin:8px 0 0;font-size:13px;color:#4338ca;line-height:1.6;">We believe every client deserves complete visibility into their projects, billing, and support. This portal eliminates back-and-forth emails, keeps a permanent record of all communication, and gives you 24/7 access to everything in one place.</p>
      </td></tr>
    </table>

    <!-- Feature list -->
    <p style="font-size:15px;font-weight:700;color:#1a2b47;margin:0 0 14px;">What you can do on the portal</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">

      <tr style="background:#f7fafc;">
        <td style="padding:14px 16px;width:36px;vertical-align:top;font-size:20px;">🎫</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Support Tickets</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Submit new support requests, track progress in real time, reply to updates, and view the full history of every ticket — all in one place.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">📊</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Project Tracking</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Stay informed about the progress of your development and IT projects with real-time status updates, milestones, and task breakdowns.</p>
        </td>
      </tr>

      <tr style="background:#f7fafc;">
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">🧾</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Invoices &amp; Payments</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">View all your invoices, see outstanding balances, make secure online payments, and set up payment arrangements directly through the portal.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">📄</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Documents &amp; Electronic Signing</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Access contracts, proposals, and agreements. Review and sign documents electronically — no printing, scanning, or emailing required.</p>
        </td>
      </tr>

      <tr style="background:#f7fafc;">
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">🌐</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Domains &amp; SSL Certificates</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Monitor your domain registrations and SSL certificate expiry dates so you're never caught off guard by an unexpected lapse in service.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">🖥️</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Hosting Overview</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">View your hosting packages, resource usage, and configuration details at any time without needing to contact us for basic information.</p>
        </td>
      </tr>

      <tr style="background:#f7fafc;">
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">🔒</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Secure Vault</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Store and retrieve sensitive credentials and access details securely. Your vault is encrypted and accessible only to authorised users.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:14px 16px;vertical-align:top;font-size:20px;">🔔</td>
        <td style="padding:14px 16px 14px 0;">
          <p style="margin:0;font-weight:700;color:#2d3748;font-size:14px;">Custom Notifications</p>
          <p style="margin:4px 0 0;font-size:13px;color:#718096;line-height:1.5;">Configure exactly how and when you receive updates — whether by email or within the portal — so important information always reaches you.</p>
        </td>
      </tr>

    </table>

    <!-- How to submit a ticket -->
    <p style="font-size:15px;font-weight:700;color:#1a2b47;margin:0 0 14px;">How to submit a support ticket</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td style="padding:0 0 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:12px 14px;width:36px;vertical-align:top;">
                <div style="background:#465fff;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;font-size:13px;font-weight:700;line-height:24px;">1</div>
              </td>
              <td style="padding:12px 14px 12px 0;font-size:13px;color:#4a5568;line-height:1.5;">
                <strong>Log in</strong> to the Support Portal using the account you create during this invitation process.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:12px 14px;width:36px;vertical-align:top;">
                <div style="background:#465fff;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;font-size:13px;font-weight:700;line-height:24px;">2</div>
              </td>
              <td style="padding:12px 14px 12px 0;font-size:13px;color:#4a5568;line-height:1.5;">
                In the sidebar, click <strong>Tickets</strong> (or <strong>Issues</strong>) to open the support area.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:12px 14px;width:36px;vertical-align:top;">
                <div style="background:#465fff;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;font-size:13px;font-weight:700;line-height:24px;">3</div>
              </td>
              <td style="padding:12px 14px 12px 0;font-size:13px;color:#4a5568;line-height:1.5;">
                Click <strong>New Ticket</strong>, then fill in a clear subject and a detailed description of your issue or request.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:12px 14px;width:36px;vertical-align:top;">
                <div style="background:#465fff;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;font-size:13px;font-weight:700;line-height:24px;">4</div>
              </td>
              <td style="padding:12px 14px 12px 0;font-size:13px;color:#4a5568;line-height:1.5;">
                Attach any relevant screenshots or files, select a priority level, and click <strong>Submit</strong>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:12px 14px;width:36px;vertical-align:top;">
                <div style="background:#465fff;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;font-size:13px;font-weight:700;line-height:24px;">5</div>
              </td>
              <td style="padding:12px 14px 12px 0;font-size:13px;color:#4a5568;line-height:1.5;">
                You will receive an <strong>email confirmation</strong> immediately. Our team will respond as soon as possible and you can follow all updates inside the portal.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" style="padding:8px 0;">
          <a href="${acceptUrl}" style="display:inline-block;background-color:#465fff;color:#ffffff;padding:16px 36px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:0.3px;">Accept Invitation &amp; Set Up Your Account</a>
        </td>
      </tr>
    </table>

    <!-- Expiry note -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;">
      <tr><td style="padding:12px 16px;font-size:13px;color:#92400e;">
        <strong>Please note:</strong> This invitation link will expire in <strong>7 days</strong>. If it expires, please contact us to request a new one.
      </td></tr>
    </table>

    <p style="font-size:13px;color:#718096;margin:0 0 6px;">If you were not expecting this invitation, you can safely ignore this email — no action will be taken.</p>
    <p style="font-size:13px;color:#718096;margin:0;">We look forward to working with you.</p>
    `
  );
}

export function contractSignedAdminTemplate(contractName: string, signerName: string, signerEmail: string): string {
  return emailLayout(
    "#059669",
    "Contract Signed",
    `${signerName} has signed a contract`,
    `
    <p>A client has signed a contract on the GSS Support Portal.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:12px 16px;font-weight:600;color:#166534;width:160px;">Contract</td>
        <td style="padding:12px 16px;color:#15803d;">${contractName}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Signed By</td>
        <td style="padding:12px 16px;color:#4b5563;border-top:1px solid #e5e7eb;">${signerName}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Email</td>
        <td style="padding:12px 16px;color:#4b5563;border-top:1px solid #e5e7eb;">${signerEmail}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Date</td>
        <td style="padding:12px 16px;color:#4b5563;border-top:1px solid #e5e7eb;">${new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</td>
      </tr>
    </table>
    <p>You can view the signed contract details in the GSS Support Portal admin area.</p>
  `);
}

export function contractReminderTemplate(firstName: string, portalUrl: string): string {
  return emailLayout(
    "#d97706",
    "Contract Signing Reminder",
    "You have outstanding agreements to sign",
    `
    <p>Dear <strong>${firstName}</strong>,</p>
    <p>This is a friendly reminder that you have outstanding service agreements that need your signature on the GSS Support Portal.</p>
    <p>Signing these agreements helps protect both parties and ensures we can deliver the best possible service to you.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr><td align="center">
        <a href="${portalUrl}/contracts" style="display:inline-block;padding:14px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;font-size:15px;">Sign Your Agreements</a>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6b7280;">If you have any questions about the agreements, please don&apos;t hesitate to contact us.</p>
  `);
}

export function documentDeliveryTemplate(
  clientName: string,
  documentType: string,
  documentNo: string,
  customMessage?: string
): string {
  return emailLayout("#1a2b47", `${documentType} #${documentNo}`, "Global Software Services", `
    <p>Dear <strong>${clientName}</strong>,</p>
    ${
      customMessage
        ? `<div style="white-space:pre-wrap;margin:16px 0;">${customMessage}</div>`
        : `<p>Please find attached your ${documentType.toLowerCase()} <strong>#${documentNo}</strong> from Global Software Services.</p>`
    }
    <div style="background:#edf2f7;padding:14px 18px;border-radius:6px;border-left:4px solid #1a2b47;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#2d3748;">The document is attached to this email as a PDF. Please download and review it at your convenience.</p>
    </div>
    <p>If you have any questions regarding this document, please don't hesitate to contact our support team.</p>
    <p style="margin-top:24px;">Kind regards,<br/><strong>GSS Support Team</strong></p>
  `);
}
