import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findCustomerByEmail, createSessionUrl, isPleskConfiguredAsync } from "@/lib/plesk";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const { default: prisma } = await import("@/lib/prisma");
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { emailAddress: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const pleskCustomer = await findCustomerByEmail(customer.emailAddress);
  if (!pleskCustomer) {
    return NextResponse.json({ error: "Customer not found in Plesk" }, { status: 404 });
  }

  try {
    const loginUrl = await createSessionUrl(pleskCustomer.login);
    return NextResponse.json({ url: loginUrl });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to create session: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
