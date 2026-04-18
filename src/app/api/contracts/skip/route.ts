import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST: Skip signing optional contracts (not NDA)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contractTypes } = body;

  if (!Array.isArray(contractTypes) || contractTypes.length === 0) {
    return NextResponse.json({ error: "Contract types required" }, { status: 400 });
  }

  // NDA cannot be skipped
  if (contractTypes.includes("NDA")) {
    return NextResponse.json({ error: "NDA cannot be skipped" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { userId: session.user.id, inviteAccepted: true, isPrimary: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Only primary contacts can manage contracts" }, { status: 403 });
  }

  const results = [];

  for (const contractType of contractTypes) {
    const contract = await prisma.clientContract.upsert({
      where: {
        contactId_contractType: {
          contactId: contact.id,
          contractType,
        },
      },
      update: {
        status: "SKIPPED",
        skippedAt: new Date(),
      },
      create: {
        contractType,
        status: "SKIPPED",
        skippedAt: new Date(),
        contactId: contact.id,
        customerId: contact.customerId,
        userId: session.user.id,
      },
    });
    results.push(contract);
  }

  return NextResponse.json({ success: true, contracts: results });
}
