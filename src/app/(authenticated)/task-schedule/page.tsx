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
  dueDate: string | null;
  startTime: string | null;
  estimatedDuration: number | null;
  order: number;
  projectId: string;
  issueId: string | null;
  project: { id: string; projectName: string };
  assignments: { user: TaskUser }[];
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
  return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
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
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"planner" | "week" | "list">("planner");

  const [form, setForm] = useState({
    projectId: "",
    title: "",
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    startTime: "",
    estimatedDuration: "",
    assigneeIds: [] as string[],
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
    setForm({ projectId: "", title: "", description: "", priority: "MEDIUM", dueDate: dateStr || "", startTime: "", estimatedDuration: "", assigneeIds: [] });
    setShowAddModal(true);
    setMsg("");
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setForm({
      projectId: task.projectId,
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      startTime: task.startTime || "",
      estimatedDuration: task.estimatedDuration ? String(task.estimatedDuration) : "",
      assigneeIds: task.assignments.map((a) => a.user.id),
    });
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
            dueDate: form.dueDate || null,
            startTime: form.startTime || null,
            estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : null,
            assigneeIds: form.assigneeIds,
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
            dueDate: form.dueDate || null,
            startTime: form.startTime || null,
            estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : null,
            assigneeIds: form.assigneeIds,
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

  async function handleSetDueDate(taskId: string, dueDate: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: dueDate || null }),
    });
    fetchTasks();
  }

  async function handleStatusChange(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
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
                    <button
                      key={t.id}
                      onClick={() => openEdit(t)}
                      className={`w-full text-left p-2 rounded-lg border-l-4 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 transition text-xs ${PRIORITY_COLORS[t.priority]}`}
                    >
                      <p className="font-medium text-slate-800 dark:text-white truncate">
                        {t.issueId && <Ticket size={10} className="inline mr-1 text-purple-500" />}
                        {t.title}
                      </p>
                      <p className="text-slate-500 dark:text-gray-400 truncate">{t.project.projectName}</p>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </button>
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
                    type="date"
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
                    {t.dueDate ? (
                      <span className={`text-xs ${new Date(t.dueDate) < today && t.status !== "DONE" ? "text-red-600 font-medium" : "text-slate-600 dark:text-gray-400"}`}>
                        {formatDate(t.dueDate)}
                      </span>
                    ) : (
                      <input
                        type="date"
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
                    <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-gray-500">
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

      {/* Add/Edit Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
                      onChange={(e) => setForm({ ...form, projectId: e.target.value })}
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
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Due Date</label>
                    <input
                      type="date"
                      title="Due date"
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Start Time</label>
                    <input
                      type="time"
                      title="Start time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Duration (minutes)</label>
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
    </div>
  );
}
