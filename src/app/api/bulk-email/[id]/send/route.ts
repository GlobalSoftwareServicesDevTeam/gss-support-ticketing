import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST /api/bulk-email/[id]/send – resolve recipients and send emails
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.bulkEmailCampaign.findUnique({
    where: { id },
    include: { recipients: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status === "SENDING") {
    return NextResponse.json({ error: "Campaign is already sending" }, { status: 400 });
  }
  if (campaign.status === "SENT") {
    return NextResponse.json({ error: "Campaign has already been sent" }, { status: 400 });
  }

  // Resolve recipients if none exist yet
  if (campaign.recipients.length === 0) {
    const recipients = await resolveRecipients(campaign.recipientFilter);
    if (recipients.length === 0) {
      return NextResponse.json({ error: "No recipients found for the selected filter" }, { status: 400 });
    }

    await prisma.bulkEmailRecipient.createMany({
      data: recipients.map((r) => ({
        campaignId: id,
        email: r.email,
        name: r.name || null,
        company: r.company || null,
        customerId: r.customerId || null,
        contactId: r.contactId || null,
      })),
    });
  }

  // Mark as sending
  await prisma.bulkEmailCampaign.update({
    where: { id },
    data: {
      status: "SENDING",
      sentAt: new Date(),
      totalRecipients: campaign.recipients.length || (await prisma.bulkEmailRecipient.count({ where: { campaignId: id } })),
    },
  });

  // Send emails in background (don't block response)
  sendCampaignEmails(id, campaign.subject, campaign.contentHtml, campaign.contentText, campaign.format, session.user.id!, session.user.name || "Admin");

  return NextResponse.json({
    success: true,
    message: "Campaign sending started",
  });
}

interface Recipient {
  email: string;
  name?: string;
  company?: string;
  customerId?: string;
  contactId?: string;
}

async function resolveRecipients(filterJson: string | null): Promise<Recipient[]> {
  const filter = filterJson ? JSON.parse(filterJson) : { type: "all" };
  const recipients: Recipient[] = [];
  const seenEmails = new Set<string>();

  function addRecipient(r: Recipient) {
    const email = r.email.toLowerCase().trim();
    if (!email || seenEmails.has(email)) return;
    seenEmails.add(email);
    recipients.push({ ...r, email });
  }

  if (filter.type === "all" || filter.type === "customers") {
    const customerWhere = filter.type === "customers" && filter.customerIds?.length
      ? { id: { in: filter.customerIds }, isActive: true }
      : { isActive: true };

    const customers = await prisma.customer.findMany({
      where: customerWhere,
      select: { id: true, company: true, contactPerson: true, emailAddress: true },
    });

    for (const c of customers) {
      if (c.emailAddress) {
        addRecipient({
          email: c.emailAddress,
          name: c.contactPerson || c.company,
          company: c.company,
          customerId: c.id,
        });
      }
    }
  }

  if (filter.type === "all" || filter.type === "contacts") {
    const contactWhere = filter.type === "contacts" && filter.contactIds?.length
      ? { id: { in: filter.contactIds } }
      : {};

    const contacts = await prisma.contact.findMany({
      where: contactWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        customerId: true,
        customer: { select: { company: true } },
      },
    });

    for (const c of contacts) {
      if (c.email) {
        addRecipient({
          email: c.email,
          name: `${c.firstName} ${c.lastName}`.trim(),
          company: c.customer?.company || undefined,
          customerId: c.customerId,
          contactId: c.id,
        });
      }
    }
  }

  if (filter.type === "custom" && Array.isArray(filter.emails)) {
    for (const entry of filter.emails) {
      if (typeof entry === "string") {
        addRecipient({ email: entry });
      } else if (entry.email) {
        addRecipient({ email: entry.email, name: entry.name });
      }
    }
  }

  return recipients;
}

async function sendCampaignEmails(
  campaignId: string,
  subject: string,
  contentHtml: string | null,
  contentText: string | null,
  format: string,
  userId: string,
  userName: string
) {
  const recipients = await prisma.bulkEmailRecipient.findMany({
    where: { campaignId, status: "PENDING" },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      const html = format === "html" ? (contentHtml || "") : `<pre style="font-family:inherit;white-space:pre-wrap;">${contentText || ""}</pre>`;
      const text = contentText || (contentHtml ? contentHtml.replace(/<[^>]*>/g, "") : "");

      await sendEmail({
        to: recipient.email,
        subject,
        html,
        text,
      });

      await prisma.bulkEmailRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await prisma.bulkEmailRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", error: errorMsg },
      });
      failedCount++;
    }

    // Small delay between sends to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Update campaign status
  await prisma.bulkEmailCampaign.update({
    where: { id: campaignId },
    data: {
      status: failedCount === recipients.length ? "FAILED" : "SENT",
      sentCount,
      failedCount,
      completedAt: new Date(),
    },
  });

  logAudit({
    action: "SEND",
    entity: "BULK_EMAIL",
    entityId: campaignId,
    description: `Sent bulk email campaign: ${sentCount} delivered, ${failedCount} failed out of ${recipients.length} recipients`,
    userId,
    userName,
    metadata: JSON.stringify({ sentCount, failedCount, total: recipients.length }),
  });
}
