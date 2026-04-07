import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isGooglePlayConfigured,
  listAchievementConfigs,
  listLeaderboardConfigs,
  resetAllAchievements,
  resetAllEvents,
  resetLeaderboard,
} from "@/lib/google-play";

// GET: list game configurations (achievements & leaderboards)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId");
  const type = searchParams.get("type") || "all"; // achievements, leaderboards, all

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  try {
    const result: Record<string, unknown> = {};

    if (type === "all" || type === "achievements") {
      const achievements = await listAchievementConfigs(applicationId);
      result.achievements = achievements.items || [];
    }

    if (type === "all" || type === "leaderboards") {
      const leaderboards = await listLeaderboardConfigs(applicationId);
      result.leaderboards = leaderboards.items || [];
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch game configs" },
      { status: 500 }
    );
  }
}

// POST: management actions (reset achievements, events, leaderboards)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, leaderboardId } = body as {
    action: "resetAchievements" | "resetEvents" | "resetLeaderboard";
    leaderboardId?: string;
  };

  try {
    switch (action) {
      case "resetAchievements":
        await resetAllAchievements();
        return NextResponse.json({ success: true, message: "All achievements reset" });
      case "resetEvents":
        await resetAllEvents();
        return NextResponse.json({ success: true, message: "All events reset" });
      case "resetLeaderboard":
        if (!leaderboardId) {
          return NextResponse.json({ error: "leaderboardId is required" }, { status: 400 });
        }
        await resetLeaderboard(leaderboardId);
        return NextResponse.json({ success: true, message: `Leaderboard ${leaderboardId} reset` });
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Game management action failed" },
      { status: 500 }
    );
  }
}
