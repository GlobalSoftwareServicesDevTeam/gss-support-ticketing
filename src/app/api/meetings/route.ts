import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hasStaffPermission, type StaffPermissions } from "@/lib/permissions";

function canManageMeetings(sessionUser: { role?: string; staffPermissions?: StaffPermissions } | undefined): boolean {
  if (!sessionUser) return false;
  if (sessionUser.role === "ADMIN") return true;
  return hasStaffPermission(sessionUser, "manageTasks");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  const canManage = canManageMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions });

  if (!canManage) {
    where.attendees = { some: { userId: session.user.id } };
  }

  if (status) where.status = status;
  if (from || to) {
    where.startsAt = {};
    if (from) (where.startsAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.startsAt as Record<string, unknown>).lte = new Date(to);
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      attendees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: [{ startsAt: "asc" }],
  });

  return NextResponse.json(meetings);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = canManageMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions });
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    title,
    description,
    type,
    location,
    meetingUrl,
    startsAt,
    endsAt,
    notes,
    attendeeIds,
    status,
  } = body;

  if (!title || !startsAt || !endsAt) {
    return NextResponse.json({ error: "title, startsAt and endsAt are required" }, { status: 400 });
  }

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
  }
  if (endDate <= startDate) {
    return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
  }

  const normalizedAttendeeIds: string[] = Array.isArray(attendeeIds)
    ? Array.from(new Set(attendeeIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)))
    : [];

  const meeting = await prisma.meeting.create({
    data: {
      title: String(title),
      description: description ? String(description) : null,
      type: type ? String(type) : "CALL",
      location: location ? String(location) : null,
      meetingUrl: meetingUrl ? String(meetingUrl) : null,
      startsAt: startDate,
      endsAt: endDate,
      notes: notes ? String(notes) : null,
      status: status ? String(status) : "SCHEDULED",
      attendees: normalizedAttendeeIds.length
        ? {
            createMany: {
              data: normalizedAttendeeIds.map((userId) => ({ userId })),
            },
          }
        : undefined,
    },
    include: {
      attendees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  logAudit({
    action: "CREATE",
    entity: "MEETING",
    entityId: meeting.id,
    description: `Created meeting \"${meeting.title}\"`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { startsAt: meeting.startsAt, endsAt: meeting.endsAt, attendees: normalizedAttendeeIds.length },
  });

  return NextResponse.json(meeting, { status: 201 });
}
