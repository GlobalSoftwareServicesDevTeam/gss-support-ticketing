import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isInvoiceNinjaConfigured, listClients } from "@/lib/invoice-ninja";

// POST: import clients from Invoice Ninja as customers+contacts
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isInvoiceNinjaConfigured()) {
    return NextResponse.json({ error: "Invoice Ninja not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { clientIds } = body as { clientIds?: string[] };

  let inClients = await listClients();

  // If specific IDs provided, filter
  if (Array.isArray(clientIds) && clientIds.length > 0) {
    inClients = inClients.filter((c) => clientIds.includes(c.id));
  }

  const results = {
    imported: 0,
    skipped: 0,
    contacts_created: 0,
    errors: [] as string[],
  };

  for (const inClient of inClients) {
    try {
      const primaryContact = inClient.contacts?.[0];
      const email = primaryContact?.email || "";

      if (!email) {
        results.skipped++;
        continue;
      }

      // Check if customer already exists (by IN client ID or email)
      const existing = await prisma.customer.findFirst({
        where: {
          OR: [
            { invoiceNinjaClientId: inClient.id },
            { emailAddress: email },
          ],
        },
      });

      if (existing) {
        // Update the IN client ID if not set
        if (!existing.invoiceNinjaClientId) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: { invoiceNinjaClientId: inClient.id },
          });
        }

        // Import any new contacts that don't exist yet
        for (const inContact of inClient.contacts || []) {
          if (!inContact.email) continue;
          try {
            const existingContact = await prisma.contact.findFirst({
              where: { customerId: existing.id, email: inContact.email },
            });
            if (!existingContact) {
              const contact = await prisma.contact.create({
                data: {
                  firstName: inContact.first_name || inClient.name,
                  lastName: inContact.last_name || "",
                  email: inContact.email,
                  customerId: existing.id,
                  isPrimary: false,
                },
              });
              await createDefaultPrefs(contact.id);
              results.contacts_created++;
            }
          } catch {
            // Skip duplicate contacts
          }
        }

        results.skipped++;
        continue;
      }

      // Create new customer
      const customer = await prisma.customer.create({
        data: {
          company: inClient.name || inClient.display_name || email,
          contactPerson: primaryContact
            ? `${primaryContact.first_name} ${primaryContact.last_name}`.trim()
            : inClient.name,
          emailAddress: email,
          invoiceNinjaClientId: inClient.id,
        },
      });

      // Create contacts from IN client contacts
      for (let i = 0; i < (inClient.contacts || []).length; i++) {
        const inContact = inClient.contacts[i];
        if (!inContact.email) continue;

        try {
          const existingContact = await prisma.contact.findFirst({
            where: { customerId: customer.id, email: inContact.email },
          });
          if (existingContact) continue;
          const contact = await prisma.contact.create({
            data: {
              firstName: inContact.first_name || inClient.name,
              lastName: inContact.last_name || "",
              email: inContact.email,
              customerId: customer.id,
              isPrimary: i === 0,
            },
          });
          await createDefaultPrefs(contact.id);
          results.contacts_created++;
        } catch {
          // Skip duplicate contacts
        }
      }

      results.imported++;
    } catch (err) {
      results.errors.push(`${inClient.name}: ${String(err)}`);
    }
  }

  logAudit({
    action: "IMPORT",
    entity: "CUSTOMER",
    description: `Imported ${results.imported} customers, ${results.contacts_created} contacts from Invoice Ninja (${results.skipped} skipped, ${results.errors.length} errors)`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { imported: results.imported, skipped: results.skipped, errors: results.errors },
  });

  return NextResponse.json(results);
}

async function createDefaultPrefs(contactId: string) {
  const categories = ["TICKETS", "INVOICES", "PAYMENTS", "PROJECTS", "HOSTING", "MAINTENANCE", "GENERAL"];
  await prisma.contactNotificationPref.createMany({
    data: categories.map((category) => ({
      contactId,
      channel: "EMAIL",
      category,
      enabled: true,
    })),
  });
}
