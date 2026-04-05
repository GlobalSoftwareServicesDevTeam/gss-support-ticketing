import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: get notification preferences for the current user (or specified user if admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = session.user.role === "ADMIN" && searchParams.get("userId")
    ? searchParams.get("userId")!
    : session.user.id;

  const prefs = await prisma.userNotificationPref.findMany({
    where: { userId },
  });

  // If no prefs exist, create defaults
  if (prefs.length === 0) {
    const channels = ["EMAIL"];
    const categories = ["TICKETS", "INVOICES", "PAYMENTS", "PROJECTS", "HOSTING", "MAINTENANCE", "GENERAL"];
    await prisma.userNotificationPref.createMany({
      data: channels.flatMap((channel) =>
        categories.map((category) => ({
          userId,
          channel,
          category,
          enabled: true,
        }))
      ),
    });
    const created = await prisma.userNotificationPref.findMany({ where: { userId } });
    return NextResponse.json(created);
  }

  return NextResponse.json(prefs);
}

// PUT: bulk update notification preferences
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { userId: targetUserId, preferences } = body as {
    userId?: string;
    preferences: { channel: string; category: string; enabled: boolean }[];
  };

  const userId = session.user.role === "ADMIN" && targetUserId
    ? targetUserId
    : session.user.id;

  if (!Array.isArray(preferences)) {
    return NextResponse.json({ error: "preferences array is required" }, { status: 400 });
  }

  for (const pref of preferences) {
    await prisma.userNotificationPref.upsert({
      where: {
        userId_channel_category: {
          userId,
          channel: pref.channel,
          category: pref.category,
        },
      },
      update: { enabled: pref.enabled },
      create: {
        userId,
        channel: pref.channel,
        category: pref.category,
        enabled: pref.enabled,
      },
    });
  }

  const updated = await prisma.userNotificationPref.findMany({ where: { userId } });
  return NextResponse.json(updated);
}
