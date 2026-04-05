import imaps from "imap-simple";
import { simpleParser, ParsedMail } from "mailparser";
import prisma from "./prisma";
import { sendEmail, ticketReceivedTemplate, newIssueAdminTemplate } from "./email";

// Regex to find ticket ID in subject line: [GSS-<uuid>]
const TICKET_PATTERN = /\[GSS-([a-f0-9-]+)\]/i;

// Patterns that indicate bounce / noreply / system-generated emails
const BOUNCE_SENDERS = [
  /mailer-daemon/i,
  /postmaster@/i,
  /mail-delivery/i,
  /autoresponder/i,
];

const BOUNCE_SUBJECTS = [
  /undelivered mail/i,
  /delivery status notification/i,
  /mail delivery failed/i,
  /returned to sender/i,
  /undeliverable/i,
  /delivery failure/i,
  /failure notice/i,
  /auto[- ]?reply/i,
  /out of office/i,
  /automatic reply/i,
];

const NOREPLY_SENDERS = [
  /^no[_.-]?reply@/i,
  /^do[_.-]?not[_.-]?reply@/i,
  /^noreply@/i,
];

function detectEmailFlag(fromEmail: string, subject: string): string | null {
  for (const pat of BOUNCE_SENDERS) {
    if (pat.test(fromEmail)) return "BOUNCE";
  }
  for (const pat of BOUNCE_SUBJECTS) {
    if (pat.test(subject)) return "BOUNCE";
  }
  for (const pat of NOREPLY_SENDERS) {
    if (pat.test(fromEmail)) return "NOREPLY";
  }
  return null;
}

interface ImapConfig {
  imap: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
    authTimeout: number;
    tlsOptions: { rejectUnauthorized: boolean };
  };
}

function getImapConfig(): ImapConfig {
  return {
    imap: {
      user: process.env.IMAP_USER || "",
      password: process.env.IMAP_PASSWORD || "",
      host: process.env.IMAP_HOST || "",
      port: parseInt(process.env.IMAP_PORT || "993"),
      tls: process.env.IMAP_TLS !== "false",
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false },
    },
  };
}

export async function pollEmails(): Promise<{ processed: number; errors: string[] }> {
  const config = getImapConfig();
  let connection: imaps.ImapSimple | null = null;
  const errors: string[] = [];
  let processed = 0;

  try {
    connection = await imaps.connect(config);
    await connection.openBox("INBOX");

    // Fetch unseen emails
    const searchCriteria = ["UNSEEN"];
    const fetchOptions = {
      bodies: [""],
      markSeen: true,
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const message of messages) {
      try {
        const rawEmail = message.parts.find((p: { which: string }) => p.which === "")?.body;
        if (!rawEmail) continue;

        const parsed: ParsedMail = await simpleParser(rawEmail);

        const messageId = parsed.messageId || `generated-${Date.now()}-${Math.random()}`;
        const fromEmail = parsed.from?.value?.[0]?.address || "";
        const fromName = parsed.from?.value?.[0]?.name || fromEmail.split("@")[0];
        const subject = parsed.subject || "(No Subject)";
        const bodyText = parsed.text || "";
        const bodyHtml = parsed.html || undefined;

        if (!fromEmail) continue;

        // Check if sender is blocked
        const blockedSenders = await prisma.blockedSender.findMany();
        const isBlocked = blockedSenders.some((b) => {
          if (b.email === fromEmail.toLowerCase()) return true;
          if (b.pattern) {
            try {
              return new RegExp(b.pattern.replace(/\*/g, ".*"), "i").test(fromEmail);
            } catch {
              return false;
            }
          }
          return false;
        });

        if (isBlocked) {
          // Store in incoming_emails as processed but don't create ticket
          await prisma.incomingEmail.create({
            data: { messageId, fromEmail, fromName, subject, bodyText, bodyHtml: bodyHtml || null, processed: true },
          });
          processed++;
          continue;
        }

        // Detect bounce / noreply / system emails
        const flagReason = detectEmailFlag(fromEmail, subject);
        if (flagReason) {
          // Store as flagged email for admin review
          await prisma.flaggedEmail.create({
            data: {
              messageId,
              fromEmail,
              fromName,
              subject,
              bodyText,
              bodyHtml: bodyHtml || null,
              reason: flagReason,
              status: "PENDING",
            },
          });
          await prisma.incomingEmail.create({
            data: { messageId, fromEmail, fromName, subject, bodyText, bodyHtml: bodyHtml || null, processed: true },
          });
          processed++;
          continue;
        }

        // Check if already processed
        const existing = await prisma.incomingEmail.findUnique({
          where: { messageId },
        });
        if (existing) continue;

        // Store incoming email
        const incomingEmail = await prisma.incomingEmail.create({
          data: {
            messageId,
            fromEmail,
            fromName,
            subject,
            bodyText,
            bodyHtml: bodyHtml || null,
          },
        });

        // Check if this is a reply to an existing ticket
        const ticketMatch = subject.match(TICKET_PATTERN);

        if (ticketMatch) {
          // Reply to existing ticket
          const issueId = ticketMatch[1];
          const issue = await prisma.issue.findUnique({ where: { id: issueId } });

          if (issue) {
            // Verify sender is a registered user before allowing replies
            const replyUser = await prisma.user.findUnique({
              where: { email: fromEmail.toLowerCase() },
            });
            if (!replyUser) {
              await prisma.flaggedEmail.create({
                data: {
                  messageId,
                  fromEmail,
                  fromName,
                  subject,
                  bodyText,
                  bodyHtml: bodyHtml || null,
                  reason: "UNREGISTERED",
                  status: "PENDING",
                },
              });
              await prisma.incomingEmail.update({
                where: { id: incomingEmail.id },
                data: { processed: true },
              });
              processed++;
              continue;
            }

            // Add message to existing issue
            await prisma.message.create({
              data: {
                content: bodyText,
                issueId: issue.id,
                isFromEmail: true,
              },
            });

            // Update the issue's updatedAt
            await prisma.issue.update({
              where: { id: issue.id },
              data: { updatedAt: new Date() },
            });

            // Mark email as processed
            await prisma.incomingEmail.update({
              where: { id: incomingEmail.id },
              data: { processed: true, issueId: issue.id },
            });

            processed++;
            continue;
          }
        }

        // New ticket - only allow registered users to create tickets
        const registeredUser = await prisma.user.findUnique({
          where: { email: fromEmail.toLowerCase() },
        });

        if (!registeredUser) {
          // Sender is not a registered user - flag for admin review
          await prisma.flaggedEmail.create({
            data: {
              messageId,
              fromEmail,
              fromName,
              subject,
              bodyText,
              bodyHtml: bodyHtml || null,
              reason: "UNREGISTERED",
              status: "PENDING",
            },
          });
          await prisma.incomingEmail.update({
            where: { id: incomingEmail.id },
            data: { processed: true },
          });
          processed++;
          continue;
        }

        // Find or create customer record
        let customer = await prisma.customer.findUnique({
          where: { emailAddress: fromEmail },
        });

        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              emailAddress: fromEmail,
              contactPerson: fromName,
              company: fromName,
            },
          });
        }

        // Create new issue
        const issue = await prisma.issue.create({
          data: {
            subject,
            initialNotes: bodyText,
            status: "OPEN",
            priority: "MEDIUM",
            company: customer.company,
            customerId: customer.id,
            userId: registeredUser.id,
            emailThreadId: messageId,
          },
        });

        // Mark email as processed
        await prisma.incomingEmail.update({
          where: { id: incomingEmail.id },
          data: { processed: true, issueId: issue.id },
        });

        // Send auto-reply to the sender
        await sendEmail({
          to: fromEmail,
          subject: `Re: ${subject} [GSS-${issue.id}]`,
          html: ticketReceivedTemplate(issue.id, subject, fromName),
        });

        // Notify admins
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN" },
        });
        for (const admin of admins) {
          await sendEmail({
            to: admin.email,
            subject: `New Support Ticket: ${subject} [GSS-${issue.id}]`,
            html: newIssueAdminTemplate(issue.id, subject, fromEmail, bodyText),
          });
        }

        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(errorMsg);
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`IMAP connection error: ${errorMsg}`);
  } finally {
    if (connection) {
      try {
        connection.end();
      } catch {
        // ignore close errors
      }
    }
  }

  return { processed, errors };
}
