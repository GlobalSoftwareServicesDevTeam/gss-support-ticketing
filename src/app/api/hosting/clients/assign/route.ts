import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync } from "@/lib/plesk";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const body = await request.json();
  const { customerId, pleskClientId } = body as { customerId: string; pleskClientId: number };

  if (!customerId || !pleskClientId) {
    return NextResponse.json(
      { error: "customerId and pleskClientId are required" },
      { status: 400 }
    );
  }

  const { default: prisma } = await import("@/lib/prisma");

  // Get customer email
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { emailAddress: true, company: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Update Plesk client's email to match the customer's email
  const { getPleskConfig } = await import("@/lib/settings");
  const config = await getPleskConfig();
  const pleskUrl = (config.PLESK_API_URL || process.env.PLESK_API_URL || "").replace(/\/+$/, "");
  const pleskLogin = config.PLESK_API_LOGIN || process.env.PLESK_API_LOGIN || "";
  const pleskPassword = config.PLESK_API_PASSWORD || process.env.PLESK_API_PASSWORD || "";

  const authHeader = Buffer.from(`${pleskLogin}:${pleskPassword}`).toString("base64");

  try {
    const res = await fetch(`${pleskUrl}/api/v2/clients/${pleskClientId}`, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email: customer.emailAddress }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Failed to update Plesk client:", text);
      return NextResponse.json(
        { error: "Failed to update Plesk client email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Assigned Plesk client #${pleskClientId} to ${customer.company}`,
    });
  } catch (error) {
    console.error("Failed to assign Plesk client:", error);
    return NextResponse.json(
      { error: "Failed to assign Plesk hosting" },
      { status: 500 }
    );
  }
}
