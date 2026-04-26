import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasStaffPermission, type StaffPermissions } from "@/lib/permissions";
import { fetchOutlookCalendarEvents } from "@/lib/microsoft-calendar";

function canAccessMeetings(user: { role?: string; staffPermissions?: StaffPermissions } | undefined): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "EMPLOYEE") return hasStaffPermission(user, "manageTasks");
  return false;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required (ISO datetime)." }, { status: 400 });
  }

  try {
    const events = await fetchOutlookCalendarEvents(from, to);
    return NextResponse.json({ source: "OUTLOOK_TEAMS", count: events.length, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Outlook/Teams meetings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
