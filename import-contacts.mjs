// One-time script to import clients & contacts from Invoice Ninja
// Run on server: cd nodejs && TOKIO_WORKER_THREADS=2 node import-contacts.mjs

import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// Load .env
const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const cleanLine = line.replace(/\r$/, '');
  const match = cleanLine.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1].trim()] = val;
  }
}

const INVOICE_NINJA_URL = (env.INVOICE_NINJA_URL || '').replace(/\/+$/, '');
const INVOICE_NINJA_TOKEN = env.INVOICE_NINJA_TOKEN || '';

if (!INVOICE_NINJA_URL || !INVOICE_NINJA_TOKEN) {
  console.error('Invoice Ninja not configured in .env');
  process.exit(1);
}

console.log('Invoice Ninja URL:', INVOICE_NINJA_URL);

async function ninjaFetch(endpoint) {
  const url = `${INVOICE_NINJA_URL}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    headers: { 'X-Api-Token': INVOICE_NINJA_TOKEN, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllClients() {
  let page = 1;
  const all = [];
  while (true) {
    const data = await ninjaFetch(`clients?per_page=500&is_deleted=false&page=${page}`);
    const items = data.data || [];
    all.push(...items);
    const meta = data.meta?.pagination;
    if (!meta || page >= meta.total_pages) break;
    page++;
  }
  return all;
}

const prisma = new PrismaClient({ 
  datasourceUrl: env.DATABASE_URL,
  log: [],
});

async function main() {
  const clients = await fetchAllClients();
  console.log(`Found ${clients.length} clients in Invoice Ninja`);

  let customersCreated = 0, contactsCreated = 0, skipped = 0;

  for (const client of clients) {
    const primaryContact = client.contacts?.[0];
    const email = primaryContact?.email || '';
    if (!email) { skipped++; continue; }

    let customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { invoiceNinjaClientId: client.id },
          { emailAddress: email },
        ],
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          company: client.name || client.display_name || email,
          contactPerson: primaryContact
            ? `${primaryContact.first_name} ${primaryContact.last_name}`.trim()
            : client.name,
          emailAddress: email,
          invoiceNinjaClientId: client.id,
        },
      });
      customersCreated++;
      console.log(`  Created customer: ${customer.company}`);
    } else {
      if (!customer.invoiceNinjaClientId) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { invoiceNinjaClientId: client.id },
        });
      }
      skipped++;
    }

    // Import contacts
    for (let i = 0; i < (client.contacts || []).length; i++) {
      const c = client.contacts[i];
      if (!c.email) continue;

      const existing = await prisma.contact.findFirst({
        where: { email: c.email },
      });
      if (existing) {
        console.log(`    Contact already exists: ${c.email} (customer: ${existing.customerId})`);
        continue;
      }

      try {
        const contact = await prisma.contact.create({
          data: {
            firstName: c.first_name || client.name,
            lastName: c.last_name || '',
            email: c.email,
            customerId: customer.id,
            isPrimary: i === 0 && customersCreated > 0,
            inviteToken: randomUUID(),
          },
        });

        // Create default notification prefs
        const categories = ['TICKETS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'HOSTING', 'MAINTENANCE', 'GENERAL'];
        await prisma.contactNotificationPref.createMany({
          data: categories.map(category => ({
            contactId: contact.id,
            channel: 'EMAIL',
            category,
            enabled: true,
          })),
          skipDuplicates: true,
        });

        contactsCreated++;
        console.log(`    Created contact: ${c.first_name} ${c.last_name} <${c.email}>`);
      } catch (err) {
        console.log(`    Skipped contact (duplicate): ${c.email} - ${err.code || err.message}`);
      }
    }
  }

  console.log(`\nDone! Customers created: ${customersCreated}, Contacts created: ${contactsCreated}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
