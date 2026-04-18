"use client";

import { useState } from "react";
import { X, FileText, FileSpreadsheet, Table, ExternalLink, Download, Loader2 } from "lucide-react";

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  projectId: string;
  project: { id: string; projectName: string };
  assignments: { user: { firstName: string; lastName: string; email: string } }[];
  stageId: string | null;
  stage?: { id: string; name: string; subProject?: { id: string; name: string } } | null;
  testCompleted: boolean;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

type ExportFormat = "csv" | "excel" | "pdf" | "gsheets";

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-ZA");
}

function getExportRows(tasks: TaskData[]) {
  return tasks.map((t) => ({
    Title: t.title,
    Project: t.project.projectName,
    "Sub-Project": t.stage?.subProject?.name || "",
    Stage: t.stage?.name || "",
    Priority: PRIORITY_LABELS[t.priority] || t.priority,
    Status: STATUS_LABELS[t.status] || t.status,
    Assignee: t.assignments.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ") || "Unassigned",
    "Start Date": formatDate(t.startDate),
    "Due Date": formatDate(t.dueDate),
    "Test Completed": t.testCompleted ? "Yes" : "No",
    Notes: t.description || "",
  }));
}

async function exportCSV(tasks: TaskData[], filename: string) {
  const rows = getExportRows(tasks);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h as keyof typeof row] || "");
          // Escape CSV values with commas, quotes, or newlines
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

async function exportExcel(tasks: TaskData[], filename: string) {
  const XLSX = await import("xlsx");
  const rows = getExportRows(tasks);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width columns
  const colWidths = Object.keys(rows[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => String(r[key as keyof typeof r] || "").length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `${filename}.xlsx`);
}

async function exportPDF(tasks: TaskData[], filename: string, title: string) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, 15);

  // Subtitle with date
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Exported on ${new Date().toLocaleDateString("en-ZA")} · ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`, 14, 21);

  const rows = getExportRows(tasks);
  const headers = Object.keys(rows[0] || {});

  // Priority/status color mapping for cells
  const priorityColors: Record<string, [number, number, number]> = {
    Low: [241, 245, 249],
    Medium: [219, 234, 254],
    High: [255, 237, 213],
    Critical: [254, 226, 226],
  };
  const statusColors: Record<string, [number, number, number]> = {
    "To Do": [241, 245, 249],
    "In Progress": [219, 234, 254],
    "In Review": [254, 249, 195],
    Done: [220, 252, 231],
  };

  autoTable(doc, {
    startY: 25,
    head: [headers],
    body: rows.map((r) => headers.map((h) => r[h as keyof typeof r] || "")),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 45 }, // Title
      9: { cellWidth: 40 }, // Notes
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell(data: any) {
      if (data.section === "body") {
        const val = String(data.cell.raw);
        if (data.column.index === 4 && priorityColors[val]) {
          data.cell.styles.fillColor = priorityColors[val];
        }
        if (data.column.index === 5 && statusColors[val]) {
          data.cell.styles.fillColor = statusColors[val];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}

function exportGoogleSheets(tasks: TaskData[]) {
  // Export as CSV, then open Google Sheets import
  const rows = getExportRows(tasks);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const tsvContent = [
    headers.join("\t"),
    ...rows.map((row) =>
      headers.map((h) => String(row[h as keyof typeof row] || "").replace(/\t/g, " ")).join("\t")
    ),
  ].join("\n");

  // Create a temporary CSV file and open Google Sheets with import URL
  const blob = new Blob(["\ufeff" + tsvContent], { type: "text/tab-separated-values;charset=utf-8;" });
  downloadBlob(blob, "tasks-for-google-sheets.csv");

  // Open Google Sheets new spreadsheet
  window.open("https://sheets.google.com/create", "_blank");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FORMAT_OPTIONS: { key: ExportFormat; label: string; desc: string; icon: typeof FileText }[] = [
  { key: "pdf", label: "PDF Document", desc: "Formatted table with colors", icon: FileText },
  { key: "excel", label: "Excel Spreadsheet", desc: ".xlsx file with auto-sized columns", icon: FileSpreadsheet },
  { key: "csv", label: "CSV File", desc: "Comma-separated values", icon: Table },
  { key: "gsheets", label: "Google Sheets", desc: "Downloads file + opens Google Sheets", icon: ExternalLink },
];

export default function TaskExportModal({
  tasks,
  onClose,
}: {
  tasks: TaskData[];
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("excel");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  // Get unique projects in current tasks
  const taskProjects = Array.from(
    new Map(tasks.map((t) => [t.projectId, t.project])).values()
  );

  const filenameBase = projectFilter !== "all"
    ? `tasks-${taskProjects.find((p) => p.id === projectFilter)?.projectName.replace(/[^a-zA-Z0-9]/g, "-") || "project"}`
    : "tasks-all-projects";

  const titleText = projectFilter !== "all"
    ? `Tasks — ${taskProjects.find((p) => p.id === projectFilter)?.projectName || "Project"}`
    : "Tasks — All Projects";

  async function handleExport() {
    if (filteredTasks.length === 0) return;
    setExporting(true);
    try {
      switch (format) {
        case "csv":
          await exportCSV(filteredTasks, filenameBase);
          break;
        case "excel":
          await exportExcel(filteredTasks, filenameBase);
          break;
        case "pdf":
          await exportPDF(filteredTasks, filenameBase, titleText);
          break;
        case "gsheets":
          exportGoogleSheets(filteredTasks);
          break;
      }
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch (e) {
      console.error("Export failed:", e);
    }
    setExporting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Download size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Export Tasks</h2>
          </div>
          <button title="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Project</label>
              <select
                title="Filter by project"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Projects ({tasks.length} tasks)</option>
                {taskProjects.map((p) => {
                  const count = tasks.filter((t) => t.projectId === p.id).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.projectName} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Status</label>
              <select
                title="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-2">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = format === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setFormat(opt.key)}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                        : "border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <Icon size={18} className={isSelected ? "text-blue-600 mt-0.5" : "text-slate-400 mt-0.5"} />
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-gray-300"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-500">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-gray-400">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""} will be exported
            {projectFilter !== "all" && (
              <> from <span className="font-medium text-slate-700 dark:text-gray-300">{taskProjects.find((p) => p.id === projectFilter)?.projectName}</span></>
            )}
          </div>

          {format === "gsheets" && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              This will download a .csv file and open Google Sheets. Use File → Import in Google Sheets to upload the downloaded file.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={filteredTasks.length === 0 || exporting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center gap-2"
          >
            {exporting ? (
              <><Loader2 size={14} className="animate-spin" /> Exporting...</>
            ) : exported ? (
              <><Download size={14} /> Exported!</>
            ) : (
              <><Download size={14} /> Export</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
