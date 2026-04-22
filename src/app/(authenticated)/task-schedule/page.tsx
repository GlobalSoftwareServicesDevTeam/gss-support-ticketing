"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Filter,
  ListTodo,
  Ticket,
  Timer,
  CalendarClock,
  ArrowRight,
  MoreHorizontal,
  PhoneCall,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import DailyPlanner from "@/components/daily-planner";

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
  completedAt: string | null;
  completionClientNote: string | null;
  completionPrivateNote: string | null;
  followUpType: string | null;
  followUpAt: string | null;
  followUpNotes: string | null;
  startDate: string | null;
  dueDate: string | null;
  startTime: string | null;
  estimatedDuration: number | null;
  order: number;
  projectId: string;
  issueId: string | null;
  project: { id: string; projectName: string };
  assignments: { user: TaskUser }[];
  stageId: string | null;
  stage?: { id: string; name: string; subProject?: { id: string; name: string } } | null;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface SubProjectStageOption {
  id: string;
  name: string;
}

interface SubProjectOption {
  id: string;
  name: string;
  stages: SubProjectStageOption[];
}

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  IN_REVIEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "border-l-slate-400",
  MEDIUM: "border-l-blue-400",
  HIGH: "border-l-orange-400",
  CRITICAL: "border-l-red-500",
};

function formatDate(d: string) {
  const date = new Date(d);
  const hasTime = d.includes("T") && !d.endsWith("T00:00:00.000Z");
  if (hasTime) {
    return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) + " " + date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function toDateTimeLocal(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function TaskSchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [subProjects, setSubProjects] = useState<SubProjectOption[]>([]);
  const [selectedSubProjectId, setSelectedSubProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"planner" | "week" | "list">("planner");
  const [rescheduleTask, setRescheduleTask] = useState<Task | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [postponeMenuId, setPostponeMenuId] = useState<string | null>(null);
  const [endTask, setEndTask] = useState<Task | null>(null);
  const [endingTask, setEndingTask] = useState(false);
  const [endTaskError, setEndTaskError] = useState("");
  const [endTaskForm, setEndTaskForm] = useState({
    clientNote: "",
    sendClientNote: false,
    privateNote: "",
    followUpType: "",
    followUpAt: "",
    followUpNotes: "",
  });

  const [form, setForm] = useState({
    projectId: "",
    title: "",
    description: "",
    priority: "MEDIUM",
    startDate: "",
    dueDate: "",
    startTime: "",
    estimatedDuration: "",
    assigneeIds: [] as string[],
    stageId: "",
  });

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProject) params.set("projectId", filterProject);
    if (filterStatus) params.set("status", filterStatus);
    try {
      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) setTasks(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterStatus]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    Promise.all([fetch("/api/projects"), fetch("/api/users")]).then(async ([pRes, uRes]) => {
      if (pRes.ok) setProjects(await pRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    });
  }, []);

  const fetchSubProjects = useCallback(async (projectId: string): Promise<SubProjectOption[]> => {
    if (!projectId) return [];
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects`);
      if (res.ok) {
        const data = await res.json();
        return data.map((sp: { id: string; name: string; stages: { id: string; name: string }[] }) => ({
          id: sp.id,
          name: sp.name,
          stages: sp.stages?.map((st: { id: string; name: string }) => ({ id: st.id, name: st.name })) || [],
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }, []);

  const loadSubProjectsForProject = useCallback(async (projectId: string, currentStageId?: string | null) => {
    if (!projectId) {
      setSubProjects([]);
      setSelectedSubProjectId("");
      return;
    }
    const options = await fetchSubProjects(projectId);
    setSubProjects(options);

    if (currentStageId) {
      const parent = options.find((sp) => sp.stages.some((st) => st.id === currentStageId));
      setSelectedSubProjectId(parent?.id || "");
    } else {
      setSelectedSubProjectId("");
    }
  }, [fetchSubProjects]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const tasksForDay = (day: Date) => tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));
  const unscheduled = tasks.filter((t) => !t.dueDate);

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

  function openAdd(dateStr?: string) {
    setEditingTask(null);
    setSubProjects([]);
    setSelectedSubProjectId("");
    setForm({ projectId: "", title: "", description: "", priority: "MEDIUM", startDate: "", dueDate: dateStr ? dateStr + "T17:00" : "", startTime: "", estimatedDuration: "", assigneeIds: [], stageId: "" });
    setShowAddModal(true);
    setMsg("");
  }

  async function openEdit(task: Task) {
    setEditingTask(task);
    setForm({
      projectId: task.projectId,
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      startDate: toDateTimeLocal(task.startDate),
      dueDate: toDateTimeLocal(task.dueDate),
      startTime: task.startTime || "",
      estimatedDuration: task.estimatedDuration ? String(task.estimatedDuration) : "",
      assigneeIds: task.assignments.map((a) => a.user.id),
      stageId: task.stageId || "",
    });
    await loadSubProjectsForProject(task.projectId, task.stageId);
    setShowAddModal(true);
    setMsg("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");

    try {
      if (editingTask) {
        // Update existing task
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description || null,
            priority: form.priority,
            startDate: form.startDate || null,
            dueDate: form.dueDate || null,
            startTime: form.startTime || null,
            estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : null,
            assigneeIds: form.assigneeIds,
            stageId: form.stageId || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update task");
      } else {
        // Create new task
        if (!form.projectId) throw new Error("Please select a project");
        if (!form.title) throw new Error("Title is required");
        const res = await fetch(`/api/projects/${form.projectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description || null,
            priority: form.priority,
            startDate: form.startDate || null,
            dueDate: form.dueDate || null,
            startTime: form.startTime || null,
            estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : null,
            assigneeIds: form.assigneeIds,
            stageId: form.stageId || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to create task");
      }
      setShowAddModal(false);
      fetchTasks();
    } catch (err: unknown) {
      setMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function postponeTask(taskId: string, days: number) {
    const task = tasks.find((t) => t.id === taskId);
    const base = task?.dueDate ? new Date(task.dueDate) : new Date();
    base.setDate(base.getDate() + days);
    // Skip weekends
    while (base.getDay() === 0 || base.getDay() === 6) {
      base.setDate(base.getDate() + 1);
    }
    const isoDate = base.toISOString();
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: isoDate, startTime: null }),
    });
    // Also shift startDate by the same amount if present
    if (task?.startDate) {
      const startBase = new Date(task.startDate);
      startBase.setDate(startBase.getDate() + days);
      while (startBase.getDay() === 0 || startBase.getDay() === 6) {
        startBase.setDate(startBase.getDate() + 1);
      }
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: startBase.toISOString() }),
      });
    }
    setPostponeMenuId(null);
    fetchTasks();
  }

  async function rescheduleToDate(taskId: string, newDate: string) {
    if (!newDate) return;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDate, startTime: null }),
    });
    setRescheduleTask(null);
    setRescheduleDate("");
    fetchTasks();
  }

  async function handleSetDueDate(taskId: string, dueDate: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: dueDate || null }),
    });
    fetchTasks();
  }

  async function handleStatusChange(taskId: string, status: string) {
    if (status === "DONE") {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setEndTask(task);
        setEndTaskError("");
        setEndTaskForm({
          clientNote: task.completionClientNote || "",
          sendClientNote: false,
          privateNote: task.completionPrivateNote || "",
          followUpType: task.followUpType || "",
          followUpAt: toDateTimeLocal(task.followUpAt),
          followUpNotes: task.followUpNotes || "",
        });
      }
      return;
    }

    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
  }

  async function handleEndTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!endTask) return;

    setEndingTask(true);
    setEndTaskError("");

    try {
      const res = await fetch(`/api/tasks/${endTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DONE",
          completionClientNote: endTaskForm.clientNote || null,
          completionPrivateNote: endTaskForm.privateNote || null,
          completionSendClientNote: endTaskForm.sendClientNote,
          followUpType: endTaskForm.followUpType || null,
          followUpAt: endTaskForm.followUpAt || null,
          followUpNotes: endTaskForm.followUpNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to end task");
      }

      if (data.clientNotification && data.clientNotification.sent === false) {
        setEndTaskError(`Task ended, but client note was not sent: ${data.clientNotification.reason || "unknown reason"}`);
      } else {
        setEndTask(null);
      }

      await fetchTasks();
    } catch (err) {
      setEndTaskError(err instanceof Error ? err.message : "Failed to end task");
    } finally {
      setEndingTask(false);
    }
  }

  const today = new Date();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarDays size={24} /> Task Schedule
        </h1>
        <button
          onClick={() => openAdd()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm inline-flex items-center gap-1"
        >
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-gray-400">
          <Filter size={14} /> Filters:
        </div>
        <select
          title="Filter by project"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="text-sm border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.projectName}</option>
          ))}
        </select>
        <select
          title="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("planner")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition inline-flex items-center gap-1.5 ${
            activeTab === "planner"
              ? "bg-white dark:bg-gray-900 border border-b-0 border-slate-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 -mb-px"
              : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300"
          }`}
        >
          <Timer size={14} /> Daily Planner
        </button>
        <button
          onClick={() => setActiveTab("week")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition inline-flex items-center gap-1.5 ${
            activeTab === "week"
              ? "bg-white dark:bg-gray-900 border border-b-0 border-slate-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 -mb-px"
              : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300"
          }`}
        >
          <CalendarDays size={14} /> Week View
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition inline-flex items-center gap-1.5 ${
            activeTab === "list"
              ? "bg-white dark:bg-gray-900 border border-b-0 border-slate-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 -mb-px"
              : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300"
          }`}
        >
          <ListTodo size={14} /> All Tasks
        </button>
      </div>

      {/* Daily Planner Tab */}
      {activeTab === "planner" && (
        <DailyPlanner tasks={tasks} onRefresh={fetchTasks} />
      )}

      {/* Week View Tab */}
      {activeTab === "week" && (
        <>
      {/* Week Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button title="Previous week" onClick={prevWeek} className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition">
          <ChevronLeft size={18} className="text-slate-600 dark:text-gray-300" />
        </button>
        <button onClick={goToday} className="px-3 py-1 text-sm font-medium rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition text-slate-700 dark:text-gray-300">
          Today
        </button>
        <button title="Next week" onClick={nextWeek} className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition">
          <ChevronRight size={18} className="text-slate-600 dark:text-gray-300" />
        </button>
        <span className="text-sm font-medium text-slate-700 dark:text-gray-300">
          {weekDays[0].toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })} — {weekDays[6].toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {weekDays.map((day) => {
          const dayTasks = tasksForDay(day);
          const isToday = isSameDay(day, today);
          const dayStr = day.toISOString().split("T")[0];
          return (
            <div
              key={dayStr}
              className={`rounded-xl border p-3 min-h-[140px] ${
                isToday
                  ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-600"
                  : "border-slate-200 bg-white dark:bg-gray-900 dark:border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold ${isToday ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-gray-400"}`}>
                  {day.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit" })}
                </span>
                <button
                  onClick={() => openAdd(dayStr)}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition"
                  title={`Add task for ${dayStr}`}
                >
                  <Plus size={14} className="text-slate-400" />
                </button>
              </div>
              {dayTasks.length === 0 ? (
                <p className="text-xs text-slate-300 dark:text-gray-600 italic">No tasks</p>
              ) : (
                <div className="space-y-1.5">
                  {dayTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => openEdit(t)}
                      className={`w-full text-left p-2 rounded-lg border-l-4 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 transition text-xs ${PRIORITY_COLORS[t.priority]} group relative`}
                    >
                      <p className="font-medium text-slate-800 dark:text-white truncate pr-5">
                        {t.issueId && <Ticket size={10} className="inline mr-1 text-purple-500" />}
                        {t.title}
                      </p>
                      <p className="text-slate-500 dark:text-gray-400 truncate">{t.project.projectName}</p>
                      {t.startDate && (
                        <p className="text-[10px] text-green-600 dark:text-green-400">Start: {new Date(t.startDate).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                      )}
                      {t.dueDate && (
                        <p className="text-[10px] text-orange-600 dark:text-orange-400">Due: {new Date(t.dueDate).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                      )}
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                      <button
                        type="button"
                        title="Reschedule"
                        onClick={(e) => { e.stopPropagation(); setRescheduleTask(t); setRescheduleDate(toDateTimeLocal(t.dueDate)); }}
                        className="absolute top-2 right-1.5 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition"
                      >
                        <CalendarClock size={12} className="text-slate-500 dark:text-gray-400" />
                      </button>
                      {t.status !== "DONE" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEndTask(t);
                            setEndTaskError("");
                            setEndTaskForm({
                              clientNote: t.completionClientNote || "",
                              sendClientNote: false,
                              privateNote: t.completionPrivateNote || "",
                              followUpType: t.followUpType || "",
                              followUpAt: toDateTimeLocal(t.followUpAt),
                              followUpNotes: t.followUpNotes || "",
                            });
                          }}
                          className="mt-2 text-[10px] text-green-700 dark:text-green-400 font-semibold hover:underline"
                        >
                          End Task
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unscheduled Tasks */}
      {unscheduled.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Clock size={16} /> Unscheduled Tasks ({unscheduled.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unscheduled.map((t) => (
              <div
                key={t.id}
                className={`p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 border-l-4 ${PRIORITY_COLORS[t.priority]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{t.project.projectName}</p>
                  </div>
                  <span className={`ml-2 shrink-0 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="datetime-local"
                    title="Set due date"
                    className="text-xs border border-slate-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    onChange={(e) => handleSetDueDate(t.id, e.target.value)}
                  />
                  <select
                    title="Change status"
                    value={t.status}
                    onChange={(e) => handleStatusChange(t.id, e.target.value)}
                    className="text-xs border border-slate-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                  </select>
                  {t.status !== "DONE" && (
                    <button
                      type="button"
                      onClick={() => {
                        setEndTask(t);
                        setEndTaskError("");
                        setEndTaskForm({
                          clientNote: t.completionClientNote || "",
                          sendClientNote: false,
                          privateNote: t.completionPrivateNote || "",
                          followUpType: t.followUpType || "",
                          followUpAt: toDateTimeLocal(t.followUpAt),
                          followUpNotes: t.followUpNotes || "",
                        });
                      }}
                      className="text-xs text-green-700 dark:text-green-400 font-semibold hover:underline"
                    >
                      End Task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}

      {/* All Tasks Tab */}
      {activeTab === "list" && (
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <ListTodo size={16} /> All Tasks ({tasks.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800 text-left">
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Task</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Project</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Priority</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Start Date</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Due Date</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Assigned</th>
                <th className="px-4 py-3 font-medium text-slate-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
              {tasks.map((t) => (
                <tr key={t.id} className="bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800 transition">
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(t)} className="text-left hover:text-blue-600 transition">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {t.title}
                        {t.issueId && (
                          <Link
                            href={`/issues/${t.issueId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 align-middle"
                            title="View source ticket"
                          >
                            <Ticket size={10} /> Ticket
                          </Link>
                        )}
                      </p>
                      {t.description && <p className="text-xs text-slate-500 dark:text-gray-400 truncate max-w-xs">{t.description}</p>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-400">{t.project.projectName}</td>
                  <td className="px-4 py-3">
                    <select
                      title="Change status"
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 ${STATUS_COLORS[t.status]}`}
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="DONE">Done</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-600 dark:text-gray-400">{t.priority}</td>
                  <td className="px-4 py-3">
                    {t.startDate ? (
                      <span className="text-xs text-slate-600 dark:text-gray-400">
                        {formatDate(t.startDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.dueDate ? (
                      <span className={`text-xs ${new Date(t.dueDate) < today && t.status !== "DONE" ? "text-red-600 font-medium" : "text-slate-600 dark:text-gray-400"}`}>
                        {formatDate(t.dueDate)}
                      </span>
                    ) : (
                      <input
                        type="datetime-local"
                        title="Set due date"
                        className="text-xs border border-slate-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                        onChange={(e) => handleSetDueDate(t.id, e.target.value)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-1">
                      {t.assignments.map((a) => (
                        <span key={a.user.id} title={`${a.user.firstName} ${a.user.lastName}`} className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-gray-900">
                          {a.user.firstName[0]}{a.user.lastName[0]}
                        </span>
                      ))}
                      {t.assignments.length === 0 && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 relative">
                      <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      {t.status !== "DONE" && (
                        <button
                          type="button"
                          onClick={() => {
                            setEndTask(t);
                            setEndTaskError("");
                            setEndTaskForm({
                              clientNote: t.completionClientNote || "",
                              sendClientNote: false,
                              privateNote: t.completionPrivateNote || "",
                              followUpType: t.followUpType || "",
                              followUpAt: toDateTimeLocal(t.followUpAt),
                              followUpNotes: t.followUpNotes || "",
                            });
                          }}
                          className="text-xs text-green-700 dark:text-green-400 hover:underline"
                        >
                          End Task
                        </button>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => setPostponeMenuId(postponeMenuId === t.id ? null : t.id)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 transition"
                          title="Reschedule / Postpone"
                        >
                          <MoreHorizontal size={14} className="text-slate-500" />
                        </button>
                        {postponeMenuId === t.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1">
                            <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide">Postpone</p>
                            <button onClick={() => postponeTask(t.id, 1)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                              <ArrowRight size={12} /> Tomorrow
                            </button>
                            <button onClick={() => postponeTask(t.id, 3)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                              <ArrowRight size={12} /> 3 Days
                            </button>
                            <button onClick={() => postponeTask(t.id, 7)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                              <ArrowRight size={12} /> 1 Week
                            </button>
                            <button onClick={() => postponeTask(t.id, 14)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 flex items-center gap-2">
                              <ArrowRight size={12} /> 2 Weeks
                            </button>
                            <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
                            <button
                              onClick={() => { setRescheduleTask(t); setRescheduleDate(toDateTimeLocal(t.dueDate)); setPostponeMenuId(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                            >
                              <CalendarClock size={12} /> Pick a date...
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-gray-500">
                    <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                    No tasks found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* End Task Modal */}
      {endTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">End Task</h2>
              <button
                title="Close"
                onClick={() => {
                  setEndTask(null);
                  setEndTaskError("");
                }}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800 transition"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <p className="text-sm text-slate-700 dark:text-gray-300 mb-4">
              Complete <strong>{endTask.title}</strong> and capture client instructions, private completion notes, and follow-up.
            </p>

            {endTaskError && (
              <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                {endTaskError}
              </div>
            )}

            <form onSubmit={handleEndTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  Client Instruction Note
                </label>
                <textarea
                  value={endTaskForm.clientNote}
                  onChange={(e) => setEndTaskForm((prev) => ({ ...prev, clientNote: e.target.value }))}
                  rows={4}
                  placeholder="Explain to the client what to do next now that this task is completed..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                />
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={endTaskForm.sendClientNote}
                    onChange={(e) => setEndTaskForm((prev) => ({ ...prev, sendClientNote: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-gray-600"
                  />
                  Optionally send this note to the client by email now
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                  Private Admin Completion Notes
                </label>
                <textarea
                  value={endTaskForm.privateNote}
                  onChange={(e) => setEndTaskForm((prev) => ({ ...prev, privateNote: e.target.value }))}
                  rows={3}
                  placeholder="Private notes visible to admins only..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <PhoneCall size={16} /> Schedule Follow-Up Call or Meeting
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Follow-Up Type</label>
                    <select
                      title="Follow-up type"
                      value={endTaskForm.followUpType}
                      onChange={(e) => setEndTaskForm((prev) => ({ ...prev, followUpType: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    >
                      <option value="">No follow-up scheduled</option>
                      <option value="CALL">Client Call</option>
                      <option value="MEETING">Client Meeting</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Follow-Up Date & Time</label>
                    <input
                      type="datetime-local"
                      title="Follow-up date and time"
                      value={endTaskForm.followUpAt}
                      onChange={(e) => setEndTaskForm((prev) => ({ ...prev, followUpAt: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Follow-Up Notes</label>
                  <textarea
                    value={endTaskForm.followUpNotes}
                    onChange={(e) => setEndTaskForm((prev) => ({ ...prev, followUpNotes: e.target.value }))}
                    rows={2}
                    placeholder="Agenda or preparation notes for the call/meeting"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEndTask(null);
                    setEndTaskError("");
                  }}
                  className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={endingTask}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <UsersRound size={14} /> {endingTask ? "Ending..." : "End Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPostponeMenuId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingTask ? "Edit Task" : "New Task"}
              </h2>
              <button title="Close" onClick={() => setShowAddModal(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800 transition">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {msg && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{msg}</div>}

            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                {!editingTask && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Project *</label>
                    <select
                      title="Select project"
                      value={form.projectId}
                      onChange={async (e) => {
                        const projectId = e.target.value;
                        setForm({ ...form, projectId, stageId: "" });
                        setSelectedSubProjectId("");
                        if (!projectId) {
                          setSubProjects([]);
                          return;
                        }
                        await loadSubProjectsForProject(projectId, null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                      required
                    >
                      <option value="">Select project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.projectName}</option>
                      ))}
                    </select>
                  </div>
                )}

                {form.projectId && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Sub Project</label>
                      <select
                        title="Select sub project"
                        value={selectedSubProjectId}
                        onChange={(e) => {
                          const subProjectId = e.target.value;
                          setSelectedSubProjectId(subProjectId);
                          setForm({ ...form, stageId: "" });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                      >
                        <option value="">No sub-project</option>
                        {subProjects.map((sp) => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Milestone / Stage</label>
                      <select
                        title="Select stage"
                        value={form.stageId}
                        onChange={(e) => setForm({ ...form, stageId: e.target.value })}
                        disabled={!selectedSubProjectId}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 disabled:opacity-60"
                      >
                        <option value="">No stage</option>
                        {(subProjects.find((sp) => sp.id === selectedSubProjectId)?.stages || []).map((st) => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Task title"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    placeholder="Task description (optional)"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Priority</label>
                    <select
                      title="Select priority"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Estimated Duration (min)</label>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      title="Estimated duration"
                      value={form.estimatedDuration}
                      onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })}
                      placeholder="60"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      title="Start date and time"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Due Date & Time</label>
                    <input
                      type="datetime-local"
                      title="Due date and time"
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Planner Start Time</label>
                    <input
                      type="time"
                      title="Daily planner start time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                  <div className="flex items-end">
                    <p className="text-xs text-slate-400 dark:text-gray-500 pb-2">Planner time is used by the Daily Planner tab for scheduling within a day.</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Assign To</label>
                  <div className="max-h-32 overflow-y-auto border border-slate-300 dark:border-gray-600 rounded-lg p-2 space-y-1">
                    {users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.assigneeIds.includes(u.id)}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              assigneeIds: e.target.checked
                                ? [...form.assigneeIds, u.id]
                                : form.assigneeIds.filter((id) => id !== u.id),
                            });
                          }}
                          className="rounded border-slate-300 dark:border-gray-600"
                        />
                        {u.firstName} {u.lastName}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <CheckCircle2 size={14} /> {submitting ? "Saving..." : editingTask ? "Update Task" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarClock size={18} /> Reschedule Task
              </h2>
              <button title="Close" onClick={() => { setRescheduleTask(null); setRescheduleDate(""); }} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800 transition">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-gray-300 mb-1 font-medium truncate">{rescheduleTask.title}</p>
            {rescheduleTask.dueDate && (
              <p className="text-xs text-slate-500 dark:text-gray-400 mb-4">
                Current due: {formatDate(rescheduleTask.dueDate)}
              </p>
            )}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">New Due Date & Time</label>
              <input
                type="datetime-local"
                title="New due date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
              />
            </div>
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-2">Quick options</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Tomorrow", days: 1 },
                  { label: "+3 Days", days: 3 },
                  { label: "+1 Week", days: 7 },
                  { label: "+2 Weeks", days: 14 },
                  { label: "+1 Month", days: 30 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => postponeTask(rescheduleTask.id, opt.days).then(() => { setRescheduleTask(null); setRescheduleDate(""); })}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-gray-600 rounded-lg text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRescheduleTask(null); setRescheduleDate(""); }}
                className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => rescheduleToDate(rescheduleTask.id, rescheduleDate)}
                disabled={!rescheduleDate}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-1"
              >
                <CalendarClock size={14} /> Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-away for postpone menu */}
      {postponeMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setPostponeMenuId(null)} />
      )}
    </div>
  );
}
