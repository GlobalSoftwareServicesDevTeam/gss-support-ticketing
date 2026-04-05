"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface ScheduleTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  project: string;
}

interface ScheduleData {
  user: { firstName: string; lastName: string };
  date: string;
  tasks: ScheduleTask[];
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  TODO: <Clock size={16} className="text-slate-400" />,
  IN_PROGRESS: <Loader2 size={16} className="text-blue-500 animate-spin" />,
  IN_REVIEW: <AlertTriangle size={16} className="text-yellow-500" />,
  DONE: <CheckCircle2 size={16} className="text-green-500" />,
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

function ScheduleContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(() =>
    !searchParams.get("token") ? "Missing schedule token. Please use the link provided by your project manager." : ""
  );
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    fetch(`/api/schedule?token=${encodeURIComponent(token)}&date=${date}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Failed to load schedule");
        }
        return res.json();
      })
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, date]);

  function changeDay(offset: number) {
    setDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d.toISOString().split("T")[0];
    });
  }

  function goToday() {
    setDate(new Date().toISOString().split("T")[0]);
  }

  const isToday = date === new Date().toISOString().split("T")[0];

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-3 text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">My Task Schedule</h1>
              {data && (
                <p className="text-xs text-slate-500">
                  {data.user.firstName} {data.user.lastName}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            title="Previous day"
            onClick={() => changeDay(-1)}
            className="p-2 rounded-lg border border-slate-300 hover:bg-white transition"
          >
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">
              {new Date(date + "T00:00:00").toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            {!isToday && (
              <button onClick={goToday} className="text-xs text-blue-600 hover:underline mt-1">
                Go to today
              </button>
            )}
            {isToday && <p className="text-xs text-blue-600 font-medium mt-1">Today</p>}
          </div>
          <button
            title="Next day"
            onClick={() => changeDay(1)}
            className="p-2 rounded-lg border border-slate-300 hover:bg-white transition"
          >
            <ChevronRight size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            <p className="mt-2 text-sm text-slate-500">Loading schedule...</p>
          </div>
        )}

        {/* Tasks */}
        {!loading && data && (
          <>
            {data.tasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <CalendarDays className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">No tasks scheduled for this day.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">{data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""} scheduled</p>
                {data.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{STATUS_ICONS[t.status]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">{t.title}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[t.priority]}`}>
                            {t.priority}
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 mt-0.5">{t.project}</p>
                        {t.description && (
                          <p className="text-xs text-slate-500 mt-2">{t.description}</p>
                        )}
                        <div className="mt-2">
                          <span className="text-xs text-slate-400">
                            Status: {STATUS_LABELS[t.status]}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ScheduleContent />
    </Suspense>
  );
}
