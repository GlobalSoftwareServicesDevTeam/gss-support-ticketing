import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync, createWebmailSessionUrl } from "@/lib/plesk";

// POST: Create a Plesk session URL that opens the mail management panel
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { pleskLogin } = body;

  if (!pleskLogin) {
    return NextResponse.json({ error: "pleskLogin is required" }, { status: 400 });
  }

  try {
    const url = await createWebmailSessionUrl(pleskLogin);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create session" }, { status: 500 });
  }
}
