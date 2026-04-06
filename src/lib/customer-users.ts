import prisma from "@/lib/prisma";

/**
 * Get all user IDs linked to a customer (via accepted Contact invites).
 * Used to broaden data access for customer-scoped queries.
 */
export async function getCustomerUserIds(customerId: string): Promise<string[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      customerId,
      inviteAccepted: true,
      userId: { not: null },
    },
    select: { userId: true },
  });
  return contacts.map((c) => c.userId!);
}
