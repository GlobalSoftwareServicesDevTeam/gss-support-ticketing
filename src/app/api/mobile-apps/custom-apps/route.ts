import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isGooglePlayConfigured, createCustomApp, listCustomApps } from "@/lib/google-play";

// GET: list custom apps for an account
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  try {
    const apps = await listCustomApps(accountId);
    return NextResponse.json({ apps });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list custom apps" },
      { status: 500 }
    );
  }
}

// POST: create a custom app
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { accountId, title, languageCode } = body as {
    accountId: string;
    title: string;
    languageCode?: string;
  };

  if (!accountId || !title) {
    return NextResponse.json(
      { error: "accountId and title are required" },
      { status: 400 }
    );
  }

  try {
    const app = await createCustomApp(accountId, title, languageCode || "en-US");
    return NextResponse.json(app, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create custom app" },
      { status: 500 }
    );
  }
}
