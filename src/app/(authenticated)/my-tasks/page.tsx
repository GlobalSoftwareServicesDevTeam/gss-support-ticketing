"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { CalendarClock, ArrowRight, Clock, Filter, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface Assignment {
  id: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  order: number;
  startTime: string | null;
  estimatedDuration: number | null;
  project: { id: string; projectName: string };
  assignments: Assignment[];
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyTasksPage() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ startDate: "", dueDate: "", status: "" });
  const [saving, setSaving] = useState(false);
  const [postponeMenuId, setPostponeMenuId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
    setLoading(false);
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  function startEdit(task: Task) {
    setEditingTaskId(task.id);
    setEditForm({
      startDate: toDateTimeLocal(task.startDate),
      dueDate: toDateTimeLocal(task.dueDate),
      status: task.status,
    });
  }

  async function saveEdit(taskId: string) {
    setSaving(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: editForm.startDate || null,
        dueDate: editForm.dueDate || null,
        status: editForm.status,
      }),
    });
    setSaving(false);
    setEditingTaskId(null);
    fetchTasks();
  }

  async function postponeTask(taskId: string, days: number) {
    const task = tasks.find((t) => t.id === taskId);
    const base = task?.dueDate ? new Date(task.dueDate) : new Date();
    base.setDate(base.getDate() + days);
    while (base.getDay() === 0 || base.getDay() === 6) {
      base.setDate(base.getDate() + 1);
    }
    const updates: Record<string, string> = { dueDate: base.toISOString() };
    if (task?.startDate) {
      const startBase = new Date(task.startDate);
      startBase.setDate(startBase.getDate() + days);
      while (startBase.getDay() === 0 || startBase.getDay() === 6) {
        startBase.setDate(startBase.getDate() + 1);
      }
      updates.startDate = startBase.toISOString();
    }
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setPostponeMenuId(null);
    fetchTasks();
  }

  const isOverdue = (task: Task) =>
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";

  const isDueSoon = (task: Task) => {
    if (!task.dueDate || task.status === "DONE") return false;
    const diff = new Date(task.dueDate).getTime() - Date.now();
    return diff > 0 && diff < 48 * 60 * 60 * 1000;
  };

  const grouped = {
    overdue: tasks.filter((t) => isOverdue(t)),
    upcoming: tasks.filter((t) => isDueSoon(t) && !isOverdue(t)),
    active: tasks.filter((t) => !isOverdue(t) && !isDueSoon(t) && t.status !== "DONE"),
    done: tasks.filter((t) => t.status === "DONE"),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
          <p className="text-slate-500 text-sm">View and manage your assigned tasks</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Filter size={16} className="text-slate-400" />
        <select
          title="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700"
        >
          <option value="">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
        <select
          title="Filter by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700"
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <span className="text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CheckCircle2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No tasks assigned</p>
          <p className="text-sm">Tasks assigned to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {grouped.overdue.length > 0 && (
            <TaskSection
              title="Overdue"
              titleColor="text-red-700"
              bgColor="bg-red-50 border-red-200"
              tasks={grouped.overdue}
              editingTaskId={editingTaskId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingTaskId(null)}
              saving={saving}
              postponeMenuId={postponeMenuId}
              setPostponeMenuId={setPostponeMenuId}
              onPostpone={postponeTask}
            />
          )}

          {/* Due Soon */}
          {grouped.upcoming.length > 0 && (
            <TaskSection
              title="Due Soon"
              titleColor="text-amber-700"
              bgColor="bg-amber-50 border-amber-200"
              tasks={grouped.upcoming}
              editingTaskId={editingTaskId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingTaskId(null)}
              saving={saving}
              postponeMenuId={postponeMenuId}
              setPostponeMenuId={setPostponeMenuId}
              onPostpone={postponeTask}
            />
          )}

          {/* Active */}
          {grouped.active.length > 0 && (
            <TaskSection
              title="Active"
              titleColor="text-slate-700"
              bgColor="bg-white border-slate-200"
              tasks={grouped.active}
              editingTaskId={editingTaskId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingTaskId(null)}
              saving={saving}
              postponeMenuId={postponeMenuId}
              setPostponeMenuId={setPostponeMenuId}
              onPostpone={postponeTask}
            />
          )}

          {/* Done */}
          {grouped.done.length > 0 && (
            <TaskSection
              title="Completed"
              titleColor="text-green-700"
              bgColor="bg-green-50 border-green-200"
              tasks={grouped.done}
              editingTaskId={editingTaskId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingTaskId(null)}
              saving={saving}
              postponeMenuId={postponeMenuId}
              setPostponeMenuId={setPostponeMenuId}
              onPostpone={postponeTask}
            />
          )}
        </div>
      )}

      {/* Click-away for postpone menus */}
      {postponeMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setPostponeMenuId(null)} />
      )}
    </div>
  );
}

function TaskSection({
  title,
  titleColor,
  bgColor,
  tasks,
  editingTaskId,
  editForm,
  setEditForm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  saving,
  postponeMenuId,
  setPostponeMenuId,
  onPostpone,
}: {
  title: string;
  titleColor: string;
  bgColor: string;
  tasks: Task[];
  editingTaskId: string | null;
  editForm: { startDate: string; dueDate: string; status: string };
  setEditForm: (f: { startDate: string; dueDate: string; status: string }) => void;
  onStartEdit: (task: Task) => void;
  onSaveEdit: (taskId: string) => void;
  onCancelEdit: () => void;
  saving: boolean;
  postponeMenuId: string | null;
  setPostponeMenuId: (id: string | null) => void;
  onPostpone: (taskId: string, days: number) => void;
}) {
  return (
    <div>
      <h2 className={`text-sm font-semibold ${titleColor} mb-2 flex items-center gap-2`}>
        {title}
        <span className="text-xs font-normal opacity-60">({tasks.length})</span>
      </h2>
      <div className={`rounded-xl border ${bgColor} overflow-hidden`}>
        <table className="w-full">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Task</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Project</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Priority</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">
                <span className="flex items-center gap-1"><Clock size={12} /> Start Date & Time</span>
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">
                <span className="flex items-center gap-1"><CalendarClock size={12} /> Due Date & Time</span>
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-white/50 transition">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">{task.description}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/projects/${task.project.id}`} className="text-xs text-blue-600 hover:underline">
                    {task.project.projectName}
                  </Link>
                </td>
                <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                <td className="px-4 py-3">
                  {editingTaskId === task.id ? (
                    <select
                      title="Status"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-700"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="DONE">Done</option>
                    </select>
                  ) : (
                    <StatusBadge status={task.status} />
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingTaskId === task.id ? (
                    <input
                      type="datetime-local"
                      title="Start date and time"
                      value={editForm.startDate}
                      onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                      className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-700 w-full"
                    />
                  ) : (
                    <span className="text-xs text-slate-600">{formatDateTime(task.startDate)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingTaskId === task.id ? (
                    <input
                      type="datetime-local"
                      title="Due date and time"
                      value={editForm.dueDate}
                      onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                      className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-700 w-full"
                    />
                  ) : (
                    <span className="text-xs text-slate-600">{formatDateTime(task.dueDate)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingTaskId === task.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => onSaveEdit(task.id)}
                        disabled={saving}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "..." : "Save"}
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onStartEdit(task)}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Edit Dates
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setPostponeMenuId(postponeMenuId === task.id ? null : task.id)}
                          className="text-xs px-1.5 py-1 text-slate-500 hover:bg-slate-50 rounded"
                          title="Postpone"
                        >
                          <CalendarClock size={14} />
                        </button>
                        {postponeMenuId === task.id && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                            <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Postpone</p>
                            {[
                              { label: "Tomorrow", days: 1 },
                              { label: "3 Days", days: 3 },
                              { label: "1 Week", days: 7 },
                              { label: "2 Weeks", days: 14 },
                            ].map((opt) => (
                              <button
                                key={opt.days}
                                onClick={() => onPostpone(task.id, opt.days)}
                                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <ArrowRight size={12} /> {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
