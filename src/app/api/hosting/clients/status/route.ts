import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync } from "@/lib/plesk";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const body = await request.json();
  const { domainId, action } = body as { domainId: number; action: string };

  if (!domainId || !action) {
    return NextResponse.json({ error: "domainId and action are required" }, { status: 400 });
  }

  if (action !== "suspend" && action !== "activate") {
    return NextResponse.json({ error: "action must be 'suspend' or 'activate'" }, { status: 400 });
  }

  const { suspendSubscription, activateSubscription } = await import("@/lib/plesk");

  try {
    if (action === "suspend") {
      await suspendSubscription(domainId);
    } else {
      await activateSubscription(domainId);
    }

    return NextResponse.json({
      success: true,
      domainId,
      newStatus: action === "suspend" ? "disabled" : "active",
    });
  } catch (error) {
    console.error("Failed to update subscription status:", error);
    return NextResponse.json(
      { error: "Failed to update subscription status" },
      { status: 500 }
    );
  }
}
