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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      attendees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const canManage = canManageMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions });
  if (!canManage && !meeting.attendees.some((a) => a.userId === session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(meeting);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = canManageMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions });
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { meetingId } = await params;
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

  const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!existing) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    ...(title !== undefined && { title: String(title) }),
    ...(description !== undefined && { description: description ? String(description) : null }),
    ...(type !== undefined && { type: type ? String(type) : "CALL" }),
    ...(location !== undefined && { location: location ? String(location) : null }),
    ...(meetingUrl !== undefined && { meetingUrl: meetingUrl ? String(meetingUrl) : null }),
    ...(notes !== undefined && { notes: notes ? String(notes) : null }),
    ...(status !== undefined && { status: String(status) }),
  };

  if (startsAt !== undefined) {
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
    }
    updateData.startsAt = d;
  }

  if (endsAt !== undefined) {
    const d = new Date(endsAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid endsAt" }, { status: 400 });
    }
    updateData.endsAt = d;
  }

  const candidateStart = (updateData.startsAt as Date | undefined) || existing.startsAt;
  const candidateEnd = (updateData.endsAt as Date | undefined) || existing.endsAt;
  if (candidateEnd <= candidateStart) {
    return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: updateData,
  });

  if (attendeeIds !== undefined) {
    const normalizedAttendeeIds: string[] = Array.isArray(attendeeIds)
      ? Array.from(new Set(attendeeIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)))
      : [];

    await prisma.meetingAttendee.deleteMany({ where: { meetingId } });
    if (normalizedAttendeeIds.length) {
      await prisma.meetingAttendee.createMany({
        data: normalizedAttendeeIds.map((userId) => ({ meetingId, userId })),
      });
    }
  }

  const updated = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      attendees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "MEETING",
    entityId: meetingId,
    description: `Updated meeting \"${updated?.title || meetingId}\"`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { status: updated?.status, startsAt: updated?.startsAt, endsAt: updated?.endsAt },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = canManageMeetings(session.user as { role?: string; staffPermissions?: StaffPermissions });
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { meetingId } = await params;
  await prisma.meeting.delete({ where: { id: meetingId } });

  logAudit({
    action: "DELETE",
    entity: "MEETING",
    entityId: meetingId,
    description: `Deleted meeting #${meetingId.slice(0, 8)}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ success: true });
}
