import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/bulk-email/[id]/recipients – preview resolved recipients
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.bulkEmailCampaign.findUnique({
    where: { id },
    select: { recipientFilter: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const filter = campaign.recipientFilter ? JSON.parse(campaign.recipientFilter) : { type: "all" };
  const recipients = await resolvePreview(filter);

  return NextResponse.json({ recipients, total: recipients.length });
}

interface PreviewRecipient {
  email: string;
  name?: string;
  company?: string;
}

async function resolvePreview(filter: { type: string; customerIds?: string[]; contactIds?: string[]; emails?: (string | { email: string; name?: string })[] }): Promise<PreviewRecipient[]> {
  const recipients: PreviewRecipient[] = [];
  const seenEmails = new Set<string>();

  function add(r: PreviewRecipient) {
    const email = r.email.toLowerCase().trim();
    if (!email || seenEmails.has(email)) return;
    seenEmails.add(email);
    recipients.push({ ...r, email });
  }

  if (filter.type === "all" || filter.type === "customers") {
    const where = filter.type === "customers" && filter.customerIds?.length
      ? { id: { in: filter.customerIds }, isActive: true }
      : { isActive: true };

    const customers = await prisma.customer.findMany({
      where,
      select: { company: true, contactPerson: true, emailAddress: true },
    });

    for (const c of customers) {
      if (c.emailAddress) {
        add({ email: c.emailAddress, name: c.contactPerson || c.company, company: c.company });
      }
    }
  }

  if (filter.type === "all" || filter.type === "contacts") {
    const where = filter.type === "contacts" && filter.contactIds?.length
      ? { id: { in: filter.contactIds } }
      : {};

    const contacts = await prisma.contact.findMany({
      where,
      select: {
        firstName: true,
        lastName: true,
        email: true,
        customer: { select: { company: true } },
      },
    });

    for (const c of contacts) {
      if (c.email) {
        add({ email: c.email, name: `${c.firstName} ${c.lastName}`.trim(), company: c.customer?.company || undefined });
      }
    }
  }

  if (filter.type === "custom" && Array.isArray(filter.emails)) {
    for (const entry of filter.emails) {
      if (typeof entry === "string") {
        add({ email: entry });
      } else if (entry.email) {
        add({ email: entry.email, name: entry.name });
      }
    }
  }

  return recipients;
}
