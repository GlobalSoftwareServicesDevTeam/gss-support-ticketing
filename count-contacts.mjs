import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync } from 'fs';
const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const cleanLine = line.replace(/\r$/, '');
  const match = cleanLine.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[match[1].trim()] = val;
  }
}
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });
const count = await prisma.contact.count();
console.log('Total contacts in DB:', count);
const contacts = await prisma.contact.findMany({ include: { customer: { select: { company: true } } }, orderBy: { createdAt: 'asc' } });
for (const c of contacts) {
  console.log(`  ${c.firstName} ${c.lastName} <${c.email}> - ${c.customer?.company || 'no customer'}`);
}
await prisma.$disconnect();
