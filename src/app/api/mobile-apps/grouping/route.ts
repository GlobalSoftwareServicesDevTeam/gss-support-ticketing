import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isGooglePlayConfigured,
  verifyGroupingToken,
  createOrUpdateTag,
  listGroupTags,
} from "@/lib/google-play";

// GET: list tags for a grouping token
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const appPackage = searchParams.get("appPackage");
  const token = searchParams.get("token");

  if (!appPackage || !token) {
    return NextResponse.json({ error: "appPackage and token are required" }, { status: 400 });
  }

  try {
    const tags = await listGroupTags(appPackage, token);
    return NextResponse.json(tags);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list tags" },
      { status: 500 }
    );
  }
}

// POST: verify token or create/update tags
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, appPackage, token, tag, value } = body as {
    action: "verify" | "tag";
    appPackage: string;
    token: string;
    tag?: string;
    value?: string;
  };

  if (!appPackage || !token) {
    return NextResponse.json({ error: "appPackage and token are required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "verify": {
        const result = await verifyGroupingToken(appPackage, token);
        return NextResponse.json(result);
      }
      case "tag": {
        if (!tag || !value) {
          return NextResponse.json({ error: "tag and value are required" }, { status: 400 });
        }
        const result = await createOrUpdateTag(appPackage, token, tag, value);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use 'verify' or 'tag'" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Grouping API error" },
      { status: 500 }
    );
  }
}
