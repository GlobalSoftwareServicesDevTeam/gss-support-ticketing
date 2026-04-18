"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  CalendarDays,
  Save,
  X,
  Check,
  Search,
  Upload,
  Download,
} from "lucide-react";
import TaskImportModal from "@/components/task-import-modal";
import TaskExportModal from "@/components/task-export-modal";

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
  startDate: string | null;
  dueDate: string | null;
  order: number;
  projectId: string;
  project: { id: string; projectName: string };
  assignments: { user: TaskUser }[];
  stageId: string | null;
  stage?: { id: string; name: string; subProject?: { id: string; name: string } } | null;
  testCompleted: boolean;
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

interface EditingCell {
  taskId: string;
  field: string;
}

const STATUS_OPTIONS = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  IN_REVIEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function formatDateInput(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}



function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export default function DailyTasksPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [filterProject, setFilterProject] = useState("");
  const [search, setSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // New task row
  const [showNewRow, setShowNewRow] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    priority: "MEDIUM",
    projectId: "",
    assigneeIds: [] as string[],
    status: "TODO",
    startDate: "",
    dueDate: "",
    milestone: "",
    notes: "",
    stageId: "",
  });
  const [subProjects, setSubProjects] = useState<SubProjectOption[]>([]);
  const [newTaskSubProjectId, setNewTaskSubProjectId] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Editing milestone state for existing tasks
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [milestoneSubProjects, setMilestoneSubProjects] = useState<SubProjectOption[]>([]);
  const [milestoneSubProjectId, setMilestoneSubProjectId] = useState("");
  const [milestoneStageId, setMilestoneStageId] = useState("");

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProject) params.set("projectId", filterProject);
    try {
      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) setTasks(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterProject]);

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

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    Promise.all([fetch("/api/projects"), fetch("/api/users")]).then(async ([pRes, uRes]) => {
      if (pRes.ok) setProjects(await pRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    });
  }, []);

  // Tasks for the selected date: tasks whose date range includes the selected date
  const dayTasks = tasks.filter((t) => {
    const sd = selectedDate;
    // Show tasks where: dueDate = today, OR startDate = today, OR startDate <= today <= dueDate
    if (t.dueDate && isSameDay(new Date(t.dueDate), sd)) return true;
    if (t.startDate && isSameDay(new Date(t.startDate), sd)) return true;
    if (t.startDate && t.dueDate) {
      const start = new Date(t.startDate);
      const end = new Date(t.dueDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const sel = new Date(sd);
      sel.setHours(12, 0, 0, 0);
      if (sel >= start && sel <= end) return true;
    }
    // Also include unscheduled tasks
    if (!t.dueDate && !t.startDate) return true;
    return false;
  });

  const filteredTasks = dayTasks.filter((t) => {
    if (!showCompleted && t.status === "DONE") return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Sort: incomplete first, then by priority (CRITICAL > HIGH > MEDIUM > LOW), then alphabetical
  const priorityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aDone = a.status === "DONE" ? 1 : 0;
    const bDone = b.status === "DONE" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ap = priorityOrder[a.priority] ?? 2;
    const bp = priorityOrder[b.priority] ?? 2;
    if (ap !== bp) return ap - bp;
    return a.title.localeCompare(b.title);
  });

  function goToday() {
    setSelectedDate(new Date());
  }
  function prevDay() {
    setSelectedDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });
  }
  function nextDay() {
    setSelectedDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });
  }

  async function updateTaskField(taskId: string, field: string, value: unknown) {
    setSaving(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      await fetchTasks();
    } catch {
      // ignore
    }
    setSaving(null);
    setEditingCell(null);
  }

  async function toggleComplete(task: Task) {
    const newStatus = task.status === "DONE" ? "TODO" : "DONE";
    await updateTaskField(task.id, "status", newStatus);
  }

  async function updateAssignee(taskId: string, userId: string) {
    setSaving(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeIds: userId ? [userId] : [] }),
      });
      await fetchTasks();
    } catch {
      // ignore
    }
    setSaving(null);
    setEditingCell(null);
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setSaving(taskId);
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    await fetchTasks();
    setSaving(null);
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.projectId) return;
    setAddingTask(true);
    try {
      const dateStr = selectedDate.toISOString().split("T")[0];
      const res = await fetch(`/api/projects/${newTask.projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: newTask.notes || null,
          priority: newTask.priority,
          status: newTask.status,
          startDate: newTask.startDate || dateStr,
          dueDate: newTask.dueDate || dateStr,
          assigneeIds: newTask.assigneeIds,
          stageId: newTask.stageId || null,
        }),
      });
      if (res.ok) {
        setNewTask({ title: "", priority: "MEDIUM", projectId: newTask.projectId, assigneeIds: [], status: "TODO", startDate: "", dueDate: "", milestone: "", notes: "", stageId: "" });
        setNewTaskSubProjectId("");
        setSubProjects([]);
        setShowNewRow(false);
        await fetchTasks();
      }
    } catch {
      // ignore
    }
    setAddingTask(false);
  }

  function startEdit(taskId: string, field: string, currentValue: string) {
    setEditingCell({ taskId, field });
    setEditValue(currentValue);
  }

  function handleEditKeyDown(e: React.KeyboardEvent, taskId: string, field: string) {
    if (e.key === "Enter") {
      if (field === "title") updateTaskField(taskId, "title", editValue);
      else if (field === "description") updateTaskField(taskId, "description", editValue || null);
    }
    if (e.key === "Escape") setEditingCell(null);
  }

  const dateLabel = selectedDate.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const isToday = isSameDay(selectedDate, new Date());

  const completedCount = dayTasks.filter((t) => t.status === "DONE").length;
  const totalCount = dayTasks.length;

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
          <CalendarDays size={24} /> Daily Tasks
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-gray-400">
            {completedCount}/{totalCount} completed
          </span>
          <div className="w-24 h-2 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: totalCount ? `${(completedCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      {/* Date navigation + filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button title="Previous day" onClick={prevDay} className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition">
            <ChevronLeft size={18} className="text-slate-600 dark:text-gray-300" />
          </button>
          <button
            onClick={goToday}
            className={`px-3 py-1 text-sm font-medium rounded-lg border transition ${
              isToday
                ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600"
                : "border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-300"
            }`}
          >
            Today
          </button>
          <button title="Next day" onClick={nextDay} className="p-1.5 rounded-lg border border-slate-300 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-800 transition">
            <ChevronRight size={18} className="text-slate-600 dark:text-gray-300" />
          </button>
          <input
            type="date"
            title="Select date"
            value={selectedDate.toISOString().split("T")[0]}
            onChange={(e) => e.target.value && setSelectedDate(new Date(e.target.value + "T12:00:00"))}
            className="px-3 py-1 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white w-48"
            />
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
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-slate-300 dark:border-gray-600"
            />
            Show completed
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                <th className="w-10 px-3 py-3 text-center">
                  <Check size={14} className="mx-auto text-slate-400" />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide min-w-[220px]">Task</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-28">Priority</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-36">Owner</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-32">Status</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-24">Tested</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-32">Start Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-32">End Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide w-36">Milestone</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide min-w-[160px]">Notes</th>
                {isAdmin && (
                  <th className="w-10 px-3 py-3"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {sortedTasks.map((task) => {
                const isDone = task.status === "DONE";
                const owner = task.assignments[0]?.user;
                const milestone = task.stage?.subProject ? `${task.stage.subProject.name} / ${task.stage.name}` : task.stage?.name || "";
                const isSavingThis = saving === task.id;

                return (
                  <tr
                    key={task.id}
                    className={`group transition hover:bg-slate-50 dark:hover:bg-gray-800/50 ${isDone ? "opacity-60" : ""} ${isSavingThis ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {/* Completed checkbox */}
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleComplete(task)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                          isDone
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-slate-300 dark:border-gray-600 hover:border-green-400"
                        }`}
                      >
                        {isDone && <Check size={12} />}
                      </button>
                    </td>

                    {/* Task title */}
                    <td className="px-3 py-2">
                      {editingCell?.taskId === task.id && editingCell.field === "title" ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => { if (editValue.trim()) updateTaskField(task.id, "title", editValue.trim()); else setEditingCell(null); }}
                          onKeyDown={(e) => handleEditKeyDown(e, task.id, "title")}
                          className="w-full px-2 py-1 border border-blue-400 rounded text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => startEdit(task.id, "title", task.title)}
                          className={`cursor-pointer px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 transition ${isDone ? "line-through text-slate-400" : "text-slate-900 dark:text-white"}`}
                        >
                          <span className="font-medium">{task.title}</span>
                          <span className="block text-xs text-slate-400 dark:text-gray-500">{task.project.projectName}</span>
                        </div>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-2">
                      <select
                        title="Change priority"
                        value={task.priority}
                        onChange={(e) => updateTaskField(task.id, "priority", e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${PRIORITY_COLORS[task.priority]}`}
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Owner */}
                    <td className="px-3 py-2">
                      <select
                        title="Assign owner"
                        value={owner?.id || ""}
                        onChange={(e) => updateAssignee(task.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 cursor-pointer w-full"
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                      </select>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <select
                        title="Change status"
                        value={task.status}
                        onChange={(e) => updateTaskField(task.id, "status", e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[task.status]}`}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Test Completed */}
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => updateTaskField(task.id, "testCompleted", !task.testCompleted)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition mx-auto ${
                          task.testCompleted
                            ? "bg-purple-500 border-purple-500 text-white"
                            : "border-slate-300 dark:border-gray-600 hover:border-purple-400"
                        }`}
                        title={task.testCompleted ? "Mark as not tested" : "Mark as tested"}
                      >
                        {task.testCompleted && <Check size={12} />}
                      </button>
                    </td>

                    {/* Start Date */}
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        title="Start date"
                        value={formatDateInput(task.startDate)}
                        onChange={(e) => updateTaskField(task.id, "startDate", e.target.value || null)}
                        className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 cursor-pointer"
                      />
                    </td>

                    {/* End Date (Due Date) */}
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        title="End date"
                        value={formatDateInput(task.dueDate)}
                        onChange={(e) => updateTaskField(task.id, "dueDate", e.target.value || null)}
                        className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 cursor-pointer"
                      />
                    </td>

                    {/* Milestone (stage / sub-project) */}
                    <td className="px-3 py-2">
                      {editingMilestone === task.id ? (
                        <div className="flex flex-col gap-1">
                          <select
                            title="Sub-project"
                            value={milestoneSubProjectId}
                            onChange={async (e) => {
                              setMilestoneSubProjectId(e.target.value);
                              setMilestoneStageId("");
                            }}
                            className="text-xs px-2 py-1 border border-blue-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 w-full"
                          >
                            <option value="">No sub-project</option>
                            {milestoneSubProjects.map((sp) => (
                              <option key={sp.id} value={sp.id}>{sp.name}</option>
                            ))}
                          </select>
                          {milestoneSubProjectId && (
                            <select
                              title="Stage"
                              value={milestoneStageId}
                              onChange={(e) => setMilestoneStageId(e.target.value)}
                              className="text-xs px-2 py-1 border border-blue-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 w-full"
                            >
                              <option value="">No stage</option>
                              {milestoneSubProjects.find((sp) => sp.id === milestoneSubProjectId)?.stages.map((st) => (
                                <option key={st.id} value={st.id}>{st.name}</option>
                              ))}
                            </select>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                await updateTaskField(task.id, "stageId", milestoneStageId || null);
                                setEditingMilestone(null);
                              }}
                              className="p-0.5 text-green-600 hover:text-green-700"
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditingMilestone(null)}
                              className="p-0.5 text-slate-400 hover:text-slate-600"
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={async () => {
                            setEditingMilestone(task.id);
                            const sps = await fetchSubProjects(task.projectId);
                            setMilestoneSubProjects(sps);
                            // Pre-select current values
                            const currentSubProjectId = task.stage?.subProject?.id || "";
                            setMilestoneSubProjectId(currentSubProjectId);
                            setMilestoneStageId(task.stageId || "");
                          }}
                          className="cursor-pointer px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 transition text-xs text-slate-500 dark:text-gray-400 min-h-[24px]"
                        >
                          {milestone || <span className="italic text-slate-300 dark:text-gray-600">Assign...</span>}
                        </div>
                      )}
                    </td>

                    {/* Notes (description) */}
                    <td className="px-3 py-2">
                      {editingCell?.taskId === task.id && editingCell.field === "description" ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => updateTaskField(task.id, "description", editValue || null)}
                          onKeyDown={(e) => handleEditKeyDown(e, task.id, "description")}
                          className="w-full px-2 py-1 border border-blue-400 rounded text-xs bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => startEdit(task.id, "description", task.description || "")}
                          className="cursor-pointer px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 transition text-xs text-slate-500 dark:text-gray-400 min-h-[24px]"
                        >
                          {task.description || <span className="italic text-slate-300 dark:text-gray-600">Add notes...</span>}
                        </div>
                      )}
                    </td>

                    {/* Delete */}
                    {isAdmin && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="p-1 text-slate-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                          title="Delete task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* New task row */}
              {showNewRow && (
                <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                  <td className="px-3 py-2 text-center">
                    <div className="w-5 h-5 rounded border-2 border-slate-200 dark:border-gray-600" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      ref={titleInputRef}
                      autoFocus
                      placeholder="Task name..."
                      value={newTask.title}
                      onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && newTask.title.trim() && newTask.projectId) handleAddTask(e); if (e.key === "Escape") setShowNewRow(false); }}
                      className="w-full px-2 py-1 border border-blue-300 rounded text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/40 outline-none"
                    />
                    <select
                      title="Select project"
                      value={newTask.projectId}
                      onChange={async (e) => {
                        const pid = e.target.value;
                        setNewTask((f) => ({ ...f, projectId: pid, stageId: "" }));
                        setNewTaskSubProjectId("");
                        if (pid) {
                          const sps = await fetchSubProjects(pid);
                          setSubProjects(sps);
                        } else {
                          setSubProjects([]);
                        }
                      }}
                      className="mt-1 w-full text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    >
                      <option value="">Select project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.projectName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      title="Priority"
                      value={newTask.priority}
                      onChange={(e) => setNewTask((f) => ({ ...f, priority: e.target.value }))}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${PRIORITY_COLORS[newTask.priority]}`}
                    >
                      {PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      title="Assign owner"
                      value={newTask.assigneeIds[0] || ""}
                      onChange={(e) => setNewTask((f) => ({ ...f, assigneeIds: e.target.value ? [e.target.value] : [] }))}
                      className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 w-full"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      title="Status"
                      value={newTask.status}
                      onChange={(e) => setNewTask((f) => ({ ...f, status: e.target.value }))}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLORS[newTask.status]}`}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="w-5 h-5 rounded border-2 border-slate-200 dark:border-gray-600 mx-auto" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      title="Start date"
                      value={newTask.startDate || selectedDate.toISOString().split("T")[0]}
                      onChange={(e) => setNewTask((f) => ({ ...f, startDate: e.target.value }))}
                      className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      title="End date"
                      value={newTask.dueDate || selectedDate.toISOString().split("T")[0]}
                      onChange={(e) => setNewTask((f) => ({ ...f, dueDate: e.target.value }))}
                      className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {newTask.projectId && subProjects.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <select
                          title="Sub-project"
                          value={newTaskSubProjectId}
                          onChange={(e) => {
                            setNewTaskSubProjectId(e.target.value);
                            setNewTask((f) => ({ ...f, stageId: "" }));
                          }}
                          className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 w-full"
                        >
                          <option value="">Sub-project...</option>
                          {subProjects.map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.name}</option>
                          ))}
                        </select>
                        {newTaskSubProjectId && (
                          <select
                            title="Stage"
                            value={newTask.stageId}
                            onChange={(e) => setNewTask((f) => ({ ...f, stageId: e.target.value }))}
                            className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 w-full"
                          >
                            <option value="">Stage...</option>
                            {subProjects.find((sp) => sp.id === newTaskSubProjectId)?.stages.map((st) => (
                              <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 dark:text-gray-600">{newTask.projectId ? "No sub-projects" : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      placeholder="Notes..."
                      value={newTask.notes}
                      onChange={(e) => setNewTask((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full px-2 py-1 border border-slate-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    />
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleAddTask}
                          disabled={addingTask || !newTask.title.trim() || !newTask.projectId}
                          className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"
                          title="Save task"
                        >
                          {addingTask ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                        <button
                          onClick={() => setShowNewRow(false)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )}

              {/* Empty state */}
              {sortedTasks.length === 0 && !showNewRow && (
                <tr>
                  <td colSpan={isAdmin ? 11 : 10} className="px-6 py-12 text-center text-slate-400 dark:text-gray-500">
                    <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No tasks for {dateLabel}</p>
                    <button
                      onClick={() => { setShowNewRow(true); setTimeout(() => titleInputRef.current?.focus(), 100); }}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Add a task
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowNewRow(true); setTimeout(() => titleInputRef.current?.focus(), 100); }}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium inline-flex items-center gap-1"
            >
              <Plus size={14} /> Add Task
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-300 font-medium inline-flex items-center gap-1"
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-300 font-medium inline-flex items-center gap-1"
            >
              <Download size={14} /> Export
            </button>
          </div>
          <span className="text-xs text-slate-400 dark:text-gray-500">
            {sortedTasks.length} task{sortedTasks.length !== 1 ? "s" : ""} · Click any cell to edit
          </span>
        </div>
      </div>

      {/* Import modal */}
      {showImportModal && (
        <TaskImportModal
          projects={projects}
          onClose={() => setShowImportModal(false)}
          onImported={() => fetchTasks()}
        />
      )}

      {/* Export modal */}
      {showExportModal && (
        <TaskExportModal
          tasks={tasks}
          projects={projects}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
