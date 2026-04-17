import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.contact.updateMany({
    data: {
      inviteToken: null,
      inviteExpiresAt: null,
      invitedAt: null,
      inviteAccepted: false,
    },
  });
  console.log("Updated contacts:", result.count);
}
main().finally(() => prisma.$disconnect());
