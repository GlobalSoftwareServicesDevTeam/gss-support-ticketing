"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock,
  Play,
  ChevronLeft,
  ChevronRight,
  Coffee,
  AlertTriangle,
  Plus,
  Minus,
  Timer,
  ArrowRight,
  Moon,
  Bell,
} from "lucide-react";

interface TaskUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startTime: string | null;
  estimatedDuration: number | null;
  order: number;
  projectId: string;
  issueId: string | null;
  project: { id: string; projectName: string };
  assignments: { user: TaskUser }[];
}

interface ScheduleItem {
  type: "task" | "break";
  task?: Task;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // minutes
}

interface DailyPlannerProps {
  tasks: Task[];
  onRefresh: () => void;
}

const BREAK_DURATION = 10; // minutes
const DAY_END = "17:00";
const DAY_START = "08:00";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function addMinutes(time: string, mins: number): string {
  return minutesToTime(timeToMinutes(time) + mins);
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function getDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "border-l-slate-400",
  MEDIUM: "border-l-blue-400",
  HIGH: "border-l-orange-400",
  CRITICAL: "border-l-red-500",
};

const PRIORITY_BG: Record<string, string> = {
  LOW: "bg-slate-50 dark:bg-slate-900/30",
  MEDIUM: "bg-blue-50 dark:bg-blue-900/10",
  HIGH: "bg-orange-50 dark:bg-orange-900/10",
  CRITICAL: "bg-red-50 dark:bg-red-900/10",
};

export default function DailyPlanner({ tasks, onRefresh }: DailyPlannerProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [overtimeEnabled, setOvertimeEnabled] = useState(false);
  const [overtimeEnd, setOvertimeEnd] = useState("19:00");
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null);
  const [customExtend, setCustomExtend] = useState("");
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  });
  const [reminderTask, setReminderTask] = useState<ScheduleItem | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
      );
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = getDateStr(selectedDate);
  const dayEnd = overtimeEnabled ? overtimeEnd : DAY_END;

  // Get tasks for the selected date (tasks with dueDate matching the selected day)
  const dayTasks = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const taskDate = t.dueDate.split("T")[0];
    return taskDate === dateStr && t.status !== "DONE";
  });

  // Build schedule from tasks
  const schedule = useMemo(() => {
    const sorted = [...dayTasks].sort((a, b) => {
      // Sort by startTime if available, then by order
      if (a.startTime && b.startTime) return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return a.order - b.order;
    });

    const items: ScheduleItem[] = [];
    let cursor = DAY_START;

    for (let i = 0; i < sorted.length; i++) {
      const task = sorted[i];
      const duration = task.estimatedDuration || 60; // default 1 hour

      // If task has a specific start time, use it
      const taskStart = task.startTime || cursor;

      // If there's a gap, you could insert idle time, but we keep it simple
      if (timeToMinutes(taskStart) > timeToMinutes(cursor)) {
        cursor = taskStart;
      }

      const taskEnd = addMinutes(cursor, duration);

      items.push({
        type: "task",
        task,
        startTime: cursor,
        endTime: taskEnd,
        duration,
      });

      cursor = taskEnd;

      // Add 10-minute break between tasks (not after last task)
      if (i < sorted.length - 1) {
        const breakEnd = addMinutes(cursor, BREAK_DURATION);
        items.push({
          type: "break",
          startTime: cursor,
          endTime: breakEnd,
          duration: BREAK_DURATION,
        });
        cursor = breakEnd;
      }
    }

    return items;
  }, [dayTasks, dayEnd]);

  // Reminder system: check if next task starts within 5 minutes
  useEffect(() => {
    const now = timeToMinutes(currentTime);
    const isCurrentDay = getDateStr(new Date()) === dateStr;
    if (!isCurrentDay) return;

    for (const item of schedule) {
      if (item.type !== "task" || !item.task) continue;
      const start = timeToMinutes(item.startTime);
      const diff = start - now;
      // Remind 5 minutes before
      if (diff > 0 && diff <= 5 && !notifiedRef.current.has(item.task.id)) {
        notifiedRef.current.add(item.task.id);
        // Use a microtask to avoid direct setState in effect body
        queueMicrotask(() => setReminderTask(item));
        // Auto-dismiss after 30 seconds
        const t = setTimeout(() => setReminderTask(null), 30000);

        // Browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`Task starting in ${diff} min`, {
            body: `"${item.task.title}" starts at ${formatTimeDisplay(item.startTime)}`,
            icon: "/favicon.ico",
          });
        }
        return () => clearTimeout(t);
      }
    }
  }, [currentTime, schedule, dateStr]);

  // Request notification permission
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Check for overflow tasks (tasks that extend past day end)
  const overflowTasks = schedule.filter(
    (s) => s.type === "task" && timeToMinutes(s.endTime) > timeToMinutes(dayEnd)
  );
  const lastItem = schedule[schedule.length - 1];
  const scheduleEndTime = lastItem ? lastItem.endTime : DAY_START;
  const hasOverflow = timeToMinutes(scheduleEndTime) > timeToMinutes(dayEnd);

  // Navigation
  function prevDay() {
    setSelectedDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });
    notifiedRef.current.clear();
  }
  function nextDay() {
    setSelectedDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });
    notifiedRef.current.clear();
  }
  function goToday() {
    setSelectedDate(new Date());
    notifiedRef.current.clear();
  }

  // Extend task duration
  async function extendTask(taskId: string, extraMinutes: number) {
    const task = dayTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newDuration = (task.estimatedDuration || 60) + extraMinutes;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedDuration: newDuration }),
    });
    setShowExtendModal(null);
    setCustomExtend("");
    onRefresh();
  }

  // Move overflow tasks to next day
  async function moveOverflowToNextDay() {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    // Skip weekends
    while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    const nextDateStr = getDateStr(nextDate);

    for (const item of overflowTasks) {
      if (!item.task) continue;
      await fetch(`/api/tasks/${item.task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: nextDateStr, startTime: null }),
      });
    }
    onRefresh();
  }

  // Move a single task to next day
  async function moveTaskToNextDay(taskId: string) {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: getDateStr(nextDate), startTime: null }),
    });
    onRefresh();
  }

  // Auto-plan: assign start times sequentially from DAY_START
  async function autoPlanDay() {
    let cursor = DAY_START;
    const sorted = [...dayTasks].sort((a, b) => {
      // Priority order: CRITICAL > HIGH > MEDIUM > LOW
      const pOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
    });

    for (let i = 0; i < sorted.length; i++) {
      const task = sorted[i];
      const duration = task.estimatedDuration || 60;

      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: cursor,
          estimatedDuration: duration,
        }),
      });

      cursor = addMinutes(cursor, duration);
      // Add break between tasks
      if (i < sorted.length - 1) {
        cursor = addMinutes(cursor, BREAK_DURATION);
      }
    }
    onRefresh();
  }

  // Update task start time
  async function updateTaskStartTime(taskId: string, startTime: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime }),
    });
    onRefresh();
  }

  // Update task duration
  async function updateTaskDuration(taskId: string, duration: number) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedDuration: duration }),
    });
    onRefresh();
  }

  const isToday = getDateStr(new Date()) === dateStr;

  // Calculate total work time and remaining time
  const totalWorkMins = schedule
    .filter((s) => s.type === "task")
    .reduce((sum, s) => sum + s.duration, 0);
  const totalBreakMins = schedule
    .filter((s) => s.type === "break")
    .reduce((sum, s) => sum + s.duration, 0);
  const availableMins = timeToMinutes(dayEnd) - timeToMinutes(DAY_START);
  const remainingMins = availableMins - totalWorkMins - totalBreakMins;

  // Find next upcoming task
  const nextUpcomingTask = isToday
    ? schedule.find(
        (s) => s.type === "task" && timeToMinutes(s.startTime) > timeToMinutes(currentTime)
      )
    : null;

  return (
    <div>
      {/* Reminder Toast */}
      {reminderTask && reminderTask.task && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 max-w-sm">
          <div className="bg-amber-50 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-600 rounded-xl shadow-lg p-4">
            <div className="flex items-start gap-3">
              <Bell className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" size={20} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Next task starting soon!
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1 truncate">
                  &quot;{reminderTask.task.title}&quot; at{" "}
                  {formatTimeDisplay(reminderTask.startTime)}
                </p>
              </div>
              <button
                onClick={() => setReminderTask(null)}
                className="text-amber-500 hover:text-amber-700 shrink-0"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Header & Nav */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            title="Previous day"
            onClick={prevDay}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
          >
            <ChevronLeft size={18} className="text-slate-600 dark:text-gray-300" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-sm font-medium rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition text-slate-700 dark:text-gray-300"
          >
            Today
          </button>
          <button
            title="Next day"
            onClick={nextDay}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
          >
            <ChevronRight size={18} className="text-slate-600 dark:text-gray-300" />
          </button>
          <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">
            {selectedDate.toLocaleDateString("en-ZA", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </span>
          {isToday && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
              <Clock size={12} className="inline mr-1" />
              {formatTimeDisplay(currentTime)}
            </span>
          )}
        </div>
        <button
          onClick={autoPlanDay}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm inline-flex items-center gap-1.5"
        >
          <Timer size={16} /> Auto-Plan Day
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3">
          <p className="text-xs text-slate-500 dark:text-gray-400">Tasks</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{dayTasks.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3">
          <p className="text-xs text-slate-500 dark:text-gray-400">Work Time</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDuration(totalWorkMins)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3">
          <p className="text-xs text-slate-500 dark:text-gray-400">Breaks</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDuration(totalBreakMins)}</p>
        </div>
        <div className={`border rounded-xl p-3 ${remainingMins < 0 ? "bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700" : "bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700"}`}>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {remainingMins < 0 ? "Overflow" : "Remaining"}
          </p>
          <p className={`text-lg font-bold ${remainingMins < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
            {formatDuration(Math.abs(remainingMins))}
          </p>
        </div>
      </div>

      {/* Next Task Reminder Bar */}
      {nextUpcomingTask && nextUpcomingTask.task && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center gap-3">
          <ArrowRight className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Next up: <span className="font-semibold">{nextUpcomingTask.task.title}</span>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Starts at {formatTimeDisplay(nextUpcomingTask.startTime)} · {formatDuration(nextUpcomingTask.duration)}
            </p>
          </div>
        </div>
      )}

      {/* Overflow Warning */}
      {hasOverflow && (
        <div className="mb-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Schedule exceeds {formatTimeDisplay(dayEnd)}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                {overflowTasks.length} task(s) extend past end of day. Choose an option:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={moveOverflowToNextDay}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-700 transition inline-flex items-center gap-1"
                >
                  <ArrowRight size={14} /> Move to next day
                </button>
                <button
                  onClick={() => setOvertimeEnabled(!overtimeEnabled)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition inline-flex items-center gap-1 ${
                    overtimeEnabled
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-700"
                  }`}
                >
                  <Moon size={14} /> {overtimeEnabled ? "Overtime ON" : "Enable Overtime"}
                </button>
                {overtimeEnabled && (
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-slate-600 dark:text-gray-400">End:</label>
                    <input
                      type="time"
                      value={overtimeEnd}
                      onChange={(e) => setOvertimeEnd(e.target.value)}
                      title="Overtime end time"
                      className="text-xs border border-slate-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Time axis */}
        <div className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
          {/* Day boundaries header */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">
              {formatTimeDisplay(DAY_START)} — {formatTimeDisplay(dayEnd)}
              {overtimeEnabled && (
                <span className="ml-2 text-purple-600 dark:text-purple-400">(Overtime)</span>
              )}
            </span>
            <span className="text-xs text-slate-400 dark:text-gray-500">
              10-min breaks auto-scheduled between tasks
            </span>
          </div>

          {schedule.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-gray-500">
              <Clock className="mx-auto mb-2" size={32} />
              <p className="text-sm">
                No tasks scheduled for this day.
              </p>
              <p className="text-xs mt-1">
                Assign tasks with a due date, then click &quot;Auto-Plan Day&quot; to generate a schedule.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {schedule.map((item, idx) => {
                const isPastEndOfDay =
                  timeToMinutes(item.endTime) > timeToMinutes(dayEnd);
                const isCurrentTask =
                  isToday &&
                  item.type === "task" &&
                  timeToMinutes(item.startTime) <= timeToMinutes(currentTime) &&
                  timeToMinutes(item.endTime) > timeToMinutes(currentTime);

                if (item.type === "break") {
                  return (
                    <div
                      key={`break-${idx}`}
                      className="flex items-center gap-3 px-4 py-2 bg-emerald-50/50 dark:bg-emerald-900/5"
                    >
                      <div className="w-20 text-right">
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                          {formatTimeDisplay(item.startTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                        <Coffee size={14} />
                        <span>Break ({item.duration}m)</span>
                      </div>
                      <div className="ml-auto text-xs text-slate-400 dark:text-gray-500 font-mono">
                        → {formatTimeDisplay(item.endTime)}
                      </div>
                    </div>
                  );
                }

                const task = item.task!;
                return (
                  <div
                    key={task.id}
                    className={`px-4 py-3 transition ${
                      isCurrentTask
                        ? "bg-blue-50/70 dark:bg-blue-900/15 ring-2 ring-inset ring-blue-400 dark:ring-blue-600"
                        : isPastEndOfDay
                        ? "bg-red-50/50 dark:bg-red-900/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Time Column */}
                      <div className="w-20 text-right shrink-0 pt-0.5">
                        <input
                          type="time"
                          value={item.startTime}
                          onChange={(e) => updateTaskStartTime(task.id, e.target.value)}
                          className="text-xs font-mono bg-transparent border-0 border-b border-dashed border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 p-0 w-full text-right focus:ring-0 focus:border-blue-400"
                          title="Edit start time"
                        />
                        <p className="text-[10px] text-slate-400 dark:text-gray-500 font-mono mt-0.5">
                          → {formatTimeDisplay(item.endTime)}
                        </p>
                      </div>

                      {/* Task Card */}
                      <div
                        className={`flex-1 min-w-0 border-l-4 ${PRIORITY_COLORS[task.priority]} ${PRIORITY_BG[task.priority]} rounded-r-lg p-3`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {isCurrentTask && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">
                                  <Play size={10} /> NOW
                                </span>
                              )}
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {task.title}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                              {task.project.projectName} · {formatDuration(item.duration)}
                              {task.assignments.length > 0 && (
                                <span className="ml-2">
                                  {task.assignments
                                    .map((a) => `${a.user.firstName} ${a.user.lastName[0]}.`)
                                    .join(", ")}
                                </span>
                              )}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              task.priority === "CRITICAL"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : task.priority === "HIGH"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                                : task.priority === "MEDIUM"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>

                        {/* Duration control & action buttons */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {/* Duration picker */}
                          <div className="flex items-center bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <button
                              onClick={() =>
                                updateTaskDuration(
                                  task.id,
                                  Math.max(15, (task.estimatedDuration || 60) - 15)
                                )
                              }
                              className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 transition"
                              title="Decrease by 15 min"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="px-2 text-xs font-medium text-slate-700 dark:text-gray-300 min-w-[50px] text-center">
                              {formatDuration(task.estimatedDuration || 60)}
                            </span>
                            <button
                              onClick={() =>
                                updateTaskDuration(
                                  task.id,
                                  (task.estimatedDuration || 60) + 15
                                )
                              }
                              className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 transition"
                              title="Increase by 15 min"
                            >
                              <Plus size={12} />
                            </button>
                          </div>

                          {/* Extend buttons */}
                          <button
                            onClick={() => extendTask(task.id, 15)}
                            className="px-2 py-1 text-[10px] font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-600"
                          >
                            +15m
                          </button>
                          <button
                            onClick={() => extendTask(task.id, 30)}
                            className="px-2 py-1 text-[10px] font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-600"
                          >
                            +30m
                          </button>
                          <button
                            onClick={() => setShowExtendModal(task.id)}
                            className="px-2 py-1 text-[10px] font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-600"
                          >
                            Custom
                          </button>

                          <div className="ml-auto flex gap-1">
                            {/* Move to next day */}
                            <button
                              onClick={() => moveTaskToNextDay(task.id)}
                              className="px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
                              title="Move to next working day"
                            >
                              <ArrowRight size={12} className="inline mr-0.5" /> Next day
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-xs mx-4 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Extend Task Duration
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customExtend}
                onChange={(e) => setCustomExtend(e.target.value)}
                placeholder="Minutes"
                title="Custom duration in minutes"
                min="1"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
              />
              <span className="text-sm text-slate-500 dark:text-gray-400">min</span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowExtendModal(null);
                  setCustomExtend("");
                }}
                className="px-3 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const mins = parseInt(customExtend);
                  if (mins > 0 && showExtendModal) {
                    extendTask(showExtendModal, mins);
                  }
                }}
                disabled={!customExtend || parseInt(customExtend) <= 0}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Extend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
