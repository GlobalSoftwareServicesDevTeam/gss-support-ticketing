"use client";

import { useState, useEffect } from "react";
import { PriorityBadge } from "@/components/badges";
import { ArrowRight, CalendarClock } from "lucide-react";

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
  assignments: Assignment[];
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TaskBoardProps {
  projectId: string;
  tasks: Task[];
  isAdmin: boolean;
  onRefresh: () => void;
}

const STATUSES = [
  { key: "TODO", label: "To Do", color: "bg-slate-100 border-slate-300" },
  { key: "IN_PROGRESS", label: "In Progress", color: "bg-blue-50 border-blue-300" },
  { key: "IN_REVIEW", label: "In Review", color: "bg-yellow-50 border-yellow-300" },
  { key: "DONE", label: "Done", color: "bg-green-50 border-green-300" },
];

export default function TaskBoard({ projectId, tasks, isAdmin, onRefresh }: TaskBoardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    startDate: "",
    dueDate: "",
    assigneeIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [postponeMenuId, setPostponeMenuId] = useState<string | null>(null);
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []));
  }, []);

  function resetForm() {
    setForm({ title: "", description: "", priority: "MEDIUM", startDate: "", dueDate: "", assigneeIds: [] });
    setShowForm(false);
    setEditingTask(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    if (editingTask) {
      await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setSubmitting(false);
    resetForm();
    onRefresh();
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    onRefresh();
  }

  function startEdit(task: Task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      startDate: task.startDate ? task.startDate.slice(0, 16) : "",
      dueDate: task.dueDate ? task.dueDate.slice(0, 16) : "",
      assigneeIds: task.assignments.map((a) => a.user.id),
    });
    setShowForm(true);
  }

  function toggleAssignee(userId: string) {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId],
    }));
  }

  async function postponeTask(taskId: string, days: number) {
    const task = tasks.find((t) => t.id === taskId);
    const base = task?.dueDate ? new Date(task.dueDate) : new Date();
    base.setDate(base.getDate() + days);
    while (base.getDay() === 0 || base.getDay() === 6) {
      base.setDate(base.getDate() + 1);
    }
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: base.toISOString() }),
    });
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
    setRescheduleTaskId(null);
    onRefresh();
  }

  async function rescheduleToDate(taskId: string, newDate: string) {
    if (!newDate) return;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDate }),
    });
    setRescheduleTaskId(null);
    setRescheduleDate("");
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          {showForm ? "Cancel" : "+ New Task"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Task title"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Task description"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                title="Task priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date & Time</label>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                title="Start date and time"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date & Time</label>
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                title="Due date and time"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleAssignee(user.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      form.assigneeIds.includes(user.id)
                        ? "bg-blue-100 text-blue-800 border-blue-300"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {user.firstName} {user.lastName}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm">
              {submitting ? "Saving..." : editingTask ? "Update Task" : "Create Task"}
            </button>
            <button type="button" onClick={resetForm} className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {STATUSES.map((status) => {
          const columnTasks = tasks.filter((t) => t.status === status.key);
          return (
            <div key={status.key} className={`rounded-xl border-2 ${status.color} p-3`}>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center justify-between">
                {status.label}
                <span className="text-xs bg-white px-2 py-0.5 rounded-full text-slate-500">{columnTasks.length}</span>
              </h3>
              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <div key={task.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="text-sm font-medium text-slate-900">{task.title}</h4>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    {task.assignments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {task.assignments.map((a) => (
                          <span key={a.id} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {a.user.firstName} {a.user.lastName[0]}.
                          </span>
                        ))}
                      </div>
                    )}
                    {(task.startDate || task.dueDate) && (
                      <div className="text-xs text-slate-400 mb-2">
                        {task.startDate && <span className="mr-2">Start: {new Date(task.startDate).toLocaleString()}</span>}
                        {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleString()}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      <select
                        title="Change status"
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-slate-200 rounded text-slate-600"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                      <div className="relative">
                        <button
                          onClick={() => setPostponeMenuId(postponeMenuId === task.id ? null : task.id)}
                          className="text-xs px-2 py-1 text-slate-500 hover:bg-slate-50 rounded flex items-center gap-0.5"
                          title="Reschedule / Postpone"
                        >
                          <CalendarClock size={12} />
                        </button>
                        {postponeMenuId === task.id && (
                          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                            <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Postpone</p>
                            <button onClick={() => postponeTask(task.id, 1)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <ArrowRight size={12} /> Tomorrow
                            </button>
                            <button onClick={() => postponeTask(task.id, 3)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <ArrowRight size={12} /> 3 Days
                            </button>
                            <button onClick={() => postponeTask(task.id, 7)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <ArrowRight size={12} /> 1 Week
                            </button>
                            <button onClick={() => postponeTask(task.id, 14)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <ArrowRight size={12} /> 2 Weeks
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => { setRescheduleTaskId(task.id); setRescheduleDate(task.dueDate ? task.dueDate.slice(0, 16) : ""); setPostponeMenuId(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                            >
                              <CalendarClock size={12} /> Pick a date...
                            </button>
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <>
                          <button onClick={() => startEdit(task)} className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                          <button onClick={() => handleDelete(task.id)} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">Del</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reschedule Mini Form */}
      {rescheduleTaskId && (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <CalendarClock size={14} /> Reschedule Task
            </h4>
            <button onClick={() => { setRescheduleTaskId(null); setRescheduleDate(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">New Due Date & Time</label>
              <input
                type="datetime-local"
                title="New due date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
              />
            </div>
            <button
              onClick={() => rescheduleToDate(rescheduleTaskId, rescheduleDate)}
              disabled={!rescheduleDate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              Reschedule
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              { label: "Tomorrow", days: 1 },
              { label: "+3 Days", days: 3 },
              { label: "+1 Week", days: 7 },
              { label: "+2 Weeks", days: 14 },
            ].map((opt) => (
              <button
                key={opt.days}
                onClick={() => postponeTask(rescheduleTaskId, opt.days)}
                className="px-2 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Click-away for postpone menus */}
      {postponeMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setPostponeMenuId(null)} />
      )}
    </div>
  );
}
