import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  return transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || "GSS Support"}" <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ""),
  });
}

export function ticketReceivedTemplate(ticketId: string, subject: string, senderName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .ticket-id { background-color: #e2e8f0; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 14px; margin: 15px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">GSS Support</h1>
          <p style="margin:5px 0 0;">Global Software Services</p>
        </div>
        <p>Dear ${senderName},</p>
        <p>Thank you for contacting GSS Support. We have received your support request and a ticket has been created.</p>
        <div class="ticket-id">
          <strong>Ticket ID:</strong> ${ticketId}<br/>
          <strong>Subject:</strong> ${subject}
        </div>
        <p>Our support team will review your request and respond as soon as possible. You can reply to this email to add additional information to your ticket.</p>
        <p>Best regards,<br/>GSS Support Team</p>
        <div class="footer">
          <p>This is an automated message from GSS Support Ticketing System. Please do not delete the ticket reference in the subject line when replying.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function newIssueAdminTemplate(ticketId: string, subject: string, senderEmail: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; }
        .header { background-color: #c53030; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .detail { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .label { font-weight: bold; color: #4a5568; }
        .body-content { background: #f7fafc; padding: 15px; border-radius: 4px; margin-top: 15px; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">New Support Ticket</h1>
        </div>
        <div class="detail"><span class="label">Ticket ID:</span> ${ticketId}</div>
        <div class="detail"><span class="label">From:</span> ${senderEmail}</div>
        <div class="detail"><span class="label">Subject:</span> ${subject}</div>
        <div class="body-content">${body}</div>
      </div>
    </body>
    </html>
  `;
}

export function issueUpdateTemplate(ticketId: string, message: string, updatedBy: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; }
        .header { background-color: #2b6cb0; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .ticket-id { background-color: #e2e8f0; padding: 10px 15px; border-radius: 4px; font-family: monospace; margin: 15px 0; }
        .message { background: #f7fafc; padding: 15px; border-radius: 4px; margin-top: 15px; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">Ticket Update</h1>
        </div>
        <div class="ticket-id"><strong>Ticket:</strong> ${ticketId}</div>
        <p><strong>${updatedBy}</strong> added a new message:</p>
        <div class="message">${message}</div>
        <p style="margin-top:20px;color:#718096;font-size:12px;">Reply to this email to respond to this ticket.</p>
      </div>
    </body>
    </html>
  `;
}

export function signingRequestTemplate(
  recipientName: string,
  documentName: string,
  signingUrl: string,
  role: "signer" | "witness" | "admin"
): string {
  const roleLabel = role === "signer" ? "sign" : role === "witness" ? "witness" : "countersign";
  const headerColor = role === "signer" ? "#2b6cb0" : role === "witness" ? "#6b46c1" : "#2f855a";
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: ${headerColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .btn { display: inline-block; background: ${headerColor}; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">Document Signing Request</h1>
          <p style="margin:5px 0 0;">GSS Support</p>
        </div>
        <p>Dear ${recipientName},</p>
        <p>You have been asked to <strong>${roleLabel}</strong> the following document:</p>
        <p style="background:#f7fafc;padding:12px;border-radius:4px;font-weight:bold;">${documentName}</p>
        <p>Please click the button below to review and sign the document:</p>
        <p style="text-align:center;">
          <a href="${signingUrl}" class="btn" style="color: white;">Review &amp; Sign Document</a>
        </p>
        <p style="color:#718096;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>${signingUrl}</p>
        <div class="footer">
          <p>This is an automated message from GSS Support. This link is unique to you — do not forward this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function signingCompleteTemplate(documentName: string, signerName: string, witnessName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #2f855a; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">Document Fully Signed</h1>
        </div>
        <p>The following document has been fully signed by all parties:</p>
        <p style="background:#f0fff4;padding:12px;border-radius:4px;font-weight:bold;color:#276749;">${documentName}</p>
        <p><strong>Signer:</strong> ${signerName}</p>
        <p><strong>Witness:</strong> ${witnessName}</p>
        <p>You can view the completed signing request in the GSS Support portal.</p>
        <div class="footer">
          <p>This is an automated message from GSS Support.</p>
        </div>
      </div>
    </body>
    </html>
  `;
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
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center; }
        .domain-box { background-color: #edf2f7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid ${urgencyColor}; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;">Domain Renewal Reminder</h1>
          <p style="margin:5px 0 0;">GSS Support</p>
        </div>
        <p>Dear ${recipientName},</p>
        <p>Your domain name is approaching its expiry date and needs to be renewed to avoid loss of service.</p>
        <div class="domain-box">
          <p style="margin:0;"><strong>Domain:</strong> ${domain}</p>
          <p style="margin:5px 0 0;"><strong>Expiry Date:</strong> ${expiryDate}</p>
          <p style="margin:5px 0 0;color:${urgencyColor};font-weight:bold;">${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining</p>
        </div>
        ${invoiceNumber ? `<p>An invoice <strong>#${invoiceNumber}</strong>${amount ? ` for <strong>R${amount}</strong>` : ""} has been generated for the domain renewal. Please arrange payment at your earliest convenience.</p>` : ""}
        <p>If you have already arranged payment or wish to discuss your domain, please contact our support team.</p>
        <p>Best regards,<br/>GSS Support Team</p>
        <div class="footer">
          <p>This is an automated reminder from GSS Support. If your domain expires, associated services (email, website) may be interrupted.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
