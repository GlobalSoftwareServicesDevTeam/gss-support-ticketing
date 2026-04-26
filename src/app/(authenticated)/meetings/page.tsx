"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  UsersRound,
  Video,
  Phone,
  Trash2,
  Pencil,
  X,
  RefreshCw,
} from "lucide-react";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface MeetingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  location: string | null;
  meetingUrl: string | null;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  attendees: { userId: string; user: MeetingUser }[];
}

interface ExternalMeeting {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  location: string | null;
  meetingUrl: string | null;
  startsAt: string;
  endsAt: string;
  source: string;
  attendeeEmails: string[];
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateTimeLocal(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(localDateTime: string): string {
  if (!localDateTime) return "";
  return localDateTime.split("T")[0] || "";
}

function toTimeInput(localDateTime: string): string {
  if (!localDateTime || !localDateTime.includes("T")) return "09:00";
  return (localDateTime.split("T")[1] || "09:00").slice(0, 5);
}

function combineDateAndTime(datePart: string, timePart: string): string {
  if (!datePart) return "";
  return `${datePart}T${timePart || "09:00"}`;
}

function localDateTimeFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundUpToQuarterHour(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15;
  if (rounded >= 60) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(rounded, 0, 0);
  }
  return d;
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOnDay(isoStr: string, day: Date) {
  const d = new Date(isoStr);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

export default function MeetingsSchedulerPage() {
  const { data: session } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [externalMeetings, setExternalMeetings] = useState<ExternalMeeting[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [showModal, setShowModal] = useState(false);

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return options;
  }, []);

  const canManage = session?.user?.role === "ADMIN" || session?.user?.role === "EMPLOYEE";

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "CALL",
    status: "SCHEDULED",
    location: "",
    meetingUrl: "",
    startsAt: "",
    endsAt: "",
    notes: "",
    attendeeIds: [] as string[],
  });

  const fetchMeetings = useCallback(async () => {
    const from = new Date(weekStart);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const res = await fetch(`/api/meetings?${params.toString()}`);
      if (res.ok) {
        setMeetings(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || "Failed to fetch meetings.");
      }
    } catch {
      setMessage("Failed to fetch meetings.");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    fetch("/api/users")
      .then(async (res) => {
        if (res.ok) setUsers(await res.json());
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const meetingsForDay = useCallback((day: Date) => {
    return meetings.filter((m) => isOnDay(m.startsAt, day));
  }, [meetings]);

  const fetchOutlookMeetings = useCallback(async () => {
    const from = new Date(weekStart);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);

    setLoadingExternal(true);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const res = await fetch(`/api/meetings/outlook?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Failed to fetch Outlook/Teams meetings.");
        return;
      }

      setExternalMeetings(data.events || []);
      setMessage(`Loaded ${data.count || 0} Outlook/Teams meeting(s).`);
    } catch {
      setMessage("Failed to fetch Outlook/Teams meetings.");
    } finally {
      setLoadingExternal(false);
    }
  }, [weekStart]);

  function resetForm() {
    setForm({
      title: "",
      description: "",
      type: "CALL",
      status: "SCHEDULED",
      location: "",
      meetingUrl: "",
      startsAt: "",
      endsAt: "",
      notes: "",
      attendeeIds: [],
    });
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    const now = roundUpToQuarterHour(new Date());
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    setForm((prev) => ({
      ...prev,
      startsAt: localDateTimeFromDate(now),
      endsAt: localDateTimeFromDate(oneHourLater),
    }));
    setShowModal(true);
  }

  function updateStartDate(datePart: string) {
    setForm((prev) => ({
      ...prev,
      startsAt: combineDateAndTime(datePart, toTimeInput(prev.startsAt)),
    }));
  }

  function updateStartTime(timePart: string) {
    setForm((prev) => ({
      ...prev,
      startsAt: combineDateAndTime(toDateInput(prev.startsAt), timePart),
    }));
  }

  function updateEndDate(datePart: string) {
    setForm((prev) => ({
      ...prev,
      endsAt: combineDateAndTime(datePart, toTimeInput(prev.endsAt)),
    }));
  }

  function updateEndTime(timePart: string) {
    setForm((prev) => ({
      ...prev,
      endsAt: combineDateAndTime(toDateInput(prev.endsAt), timePart),
    }));
  }

  function applyDuration(minutes: number) {
    if (!form.startsAt) return;
    const start = new Date(form.startsAt);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    setForm((prev) => ({ ...prev, endsAt: localDateTimeFromDate(end) }));
  }

  function openEdit(meeting: Meeting) {
    setEditing(meeting);
    setForm({
      title: meeting.title,
      description: meeting.description || "",
      type: meeting.type,
      status: meeting.status,
      location: meeting.location || "",
      meetingUrl: meeting.meetingUrl || "",
      startsAt: toDateTimeLocal(meeting.startsAt),
      endsAt: toDateTimeLocal(meeting.endsAt),
      notes: meeting.notes || "",
      attendeeIds: meeting.attendees.map((a) => a.userId),
    });
    setShowModal(true);
  }

  async function submitMeeting(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      };

      const res = await fetch(editing ? `/api/meetings/${editing.id}` : "/api/meetings", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Failed to save meeting.");
        return;
      }

      setShowModal(false);
      resetForm();
      setMessage(editing ? "Meeting updated." : "Meeting created.");
      fetchMeetings();
    } catch {
      setMessage("Failed to save meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeeting(id: string) {
    if (!confirm("Delete this meeting?")) return;
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || "Failed to delete meeting.");
        return;
      }
      setMessage("Meeting deleted.");
      fetchMeetings();
    } catch {
      setMessage("Failed to delete meeting.");
    }
  }

  function prevWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToday() {
    setWeekStart(startOfWeek(new Date()));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-blue-600" />
            Meetings Scheduler
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Schedule, track, and manage team/client meetings.</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchOutlookMeetings}
              disabled={loadingExternal}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loadingExternal ? "animate-spin" : ""}`} />
              Get Outlook/Teams
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Meeting
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" title="Previous week" onClick={prevWeek} className="rounded-md border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <span className="sr-only">Previous week</span>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" title="Next week" onClick={nextWeek} className="rounded-md border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <span className="sr-only">Next week</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={goToday} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Today
            </button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Week of {weekDays[0].toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500 dark:text-slate-400">Loading meetings...</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((day) => {
              const dayMeetings = meetingsForDay(day);
              return (
                <div key={day.toISOString()} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="mb-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{day.toLocaleDateString("en-ZA", { weekday: "short" })}</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{day.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}</p>
                  </div>

                  <div className="space-y-2">
                    {dayMeetings.length === 0 ? (
                      <p className="text-xs text-slate-400">No meetings</p>
                    ) : (
                      dayMeetings.map((m) => (
                        <div key={m.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-slate-900 dark:text-white line-clamp-2">{m.title}</p>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[m.status] || STATUS_COLORS.SCHEDULED}`}>
                              {m.status.replace("_", " ")}
                            </span>
                          </div>

                          <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <p className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(m.startsAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} - {new Date(m.endsAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {m.location && (
                              <p className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {m.location}
                              </p>
                            )}
                            <p className="flex items-center gap-1">
                              <UsersRound className="h-3.5 w-3.5" />
                              {m.attendees.length} attendee(s)
                            </p>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{m.type}</span>
                            {canManage && (
                              <div className="flex items-center gap-1">
                                <button type="button" title="Edit meeting" onClick={() => openEdit(m)} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Delete meeting" onClick={() => deleteMeeting(m.id)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Upcoming Meetings</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Attendees</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{m.title}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{formatDateTime(m.startsAt)}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{m.type}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{m.attendees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ") || "-"}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${STATUS_COLORS[m.status] || STATUS_COLORS.SCHEDULED}`}>
                      {m.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {meetings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">No meetings scheduled in this window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Outlook / Teams Meetings</h2>
          <button
            type="button"
            onClick={fetchOutlookMeetings}
            disabled={loadingExternal}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingExternal ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Join</th>
              </tr>
            </thead>
            <tbody>
              {externalMeetings.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{m.title}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{formatDateTime(m.startsAt)}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{m.location || "-"}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{m.type}</td>
                  <td className="py-2 pr-4">
                    {m.meetingUrl ? (
                      <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Open
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loadingExternal && externalMeetings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">No Outlook/Teams meetings loaded. Click "Get Outlook/Teams".</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Edit Meeting" : "New Meeting"}</h2>
              <button type="button" title="Close dialog" onClick={() => setShowModal(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitMeeting} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Title</label>
                  <input
                    required
                    title="Meeting title"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      title="Meeting start date"
                      value={toDateInput(form.startsAt)}
                      onChange={(e) => updateStartDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    <select
                      required
                      title="Meeting start time"
                      value={toTimeInput(form.startsAt)}
                      onChange={(e) => updateStartTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      {timeOptions.map((time) => (
                        <option key={`start-${time}`} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">End</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      title="Meeting end date"
                      value={toDateInput(form.endsAt)}
                      onChange={(e) => updateEndDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    <select
                      required
                      title="Meeting end time"
                      value={toTimeInput(form.endsAt)}
                      onChange={(e) => updateEndTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      {timeOptions.map((time) => (
                        <option key={`end-${time}`} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[30, 60, 90].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => applyDuration(mins)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title={`Set end time to ${mins} minutes after start`}
                      >
                        +{mins} min
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                  <select
                    title="Meeting type"
                    value={form.type}
                    onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="CALL">Call</option>
                    <option value="VIDEO">Video</option>
                    <option value="IN_PERSON">In Person</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    title="Meeting status"
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Location</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Office, client site..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Meeting URL</label>
                  <input
                    value={form.meetingUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                  <textarea
                    rows={2}
                    title="Meeting description"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
                  <textarea
                    rows={3}
                    title="Meeting notes"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Attendees</label>
                  <select
                    multiple
                    title="Meeting attendees"
                    value={form.attendeeIds}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, (opt) => opt.value);
                      setForm((prev) => ({ ...prev, attendeeIds: values }));
                    }}
                    className="h-36 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.email})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Hold Ctrl/Cmd to select multiple users.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update Meeting" : "Create Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
