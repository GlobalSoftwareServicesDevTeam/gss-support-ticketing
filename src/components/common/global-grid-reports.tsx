"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { FileSpreadsheet, FileText, Search, Table2, Download, ExternalLink, FilterX } from "lucide-react";

type ExportFormat = "csv" | "excel" | "pdf" | "gsheets";

interface TableMeta {
  id: string;
  index: number;
  title: string;
  rowCount: number;
}

function parsePossibleDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getRowsFromTable(table: HTMLTableElement) {
  const headCells = Array.from(table.querySelectorAll("thead th"));
  const headers = headCells.map((th) => (th.textContent || "").trim() || "Column");
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));

  const rows = bodyRows
    .filter((row) => {
      const el = row as HTMLElement;
      return el.style.display !== "none" && !el.hidden;
    })
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return headers.map((_, i) => (cells[i]?.textContent || "").trim());
    });

  return { headers, rows };
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

async function exportCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((v) => {
          const val = String(v || "");
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(",")
    ),
  ].join("\n");

  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

async function exportExcel(headers: string[], rows: string[][], filename: string) {
  const XLSX = await import("xlsx");
  const data = rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] || "";
    });
    return record;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}.xlsx`
  );
}

async function exportPDF(headers: string[], rows: string[][], filename: string, title: string) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Exported: ${new Date().toLocaleString("en-ZA")}`, 14, 20);

  autoTable(doc, {
    startY: 24,
    head: [headers],
    body: rows,
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7 },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}

export default function GlobalGridReports() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [exporting, setExporting] = useState<ExportFormat | "">("");

  const isAdmin = session?.user?.role === "ADMIN";

  const refreshTables = useCallback(() => {
    const found = Array.from(document.querySelectorAll("table"));
    const mapped: TableMeta[] = found.map((t, i) => {
      const table = t as HTMLTableElement;
      const caption = table.querySelector("caption")?.textContent?.trim();
      const firstHeader = table.querySelector("thead th")?.textContent?.trim();
      const rowCount = table.querySelectorAll("tbody tr").length;
      return {
        id: `grid-${i + 1}`,
        index: i,
        title: caption || (firstHeader ? `Grid ${i + 1} · ${firstHeader}` : `Grid ${i + 1}`),
        rowCount,
      };
    });

    setTables(mapped);
    if (!mapped.some((m) => m.id === selectedTableId)) {
      setSelectedTableId(mapped[0]?.id || "");
    }
  }, [selectedTableId]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(refreshTables, 300);
    const observer = new MutationObserver(() => refreshTables());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname, isAdmin, refreshTables]);

  const selectedTable = useMemo(() => {
    const meta = tables.find((t) => t.id === selectedTableId);
    if (!meta) return null;
    const table = document.querySelectorAll("table")[meta.index] as HTMLTableElement | undefined;
    return table || null;
  }, [tables, selectedTableId]);

  const applyFilters = useCallback(() => {
    if (!selectedTable) return;

    const tbodyRows = Array.from(selectedTable.querySelectorAll("tbody tr"));
    const q = search.trim().toLowerCase();
    const clientQ = clientFilter.trim().toLowerCase();
    const projectQ = projectFilter.trim().toLowerCase();

    const from = fromDate ? normalizeDateOnly(new Date(`${fromDate}T12:00:00`)) : null;
    const to = toDate ? normalizeDateOnly(new Date(`${toDate}T12:00:00`)) : null;

    tbodyRows.forEach((row) => {
      const text = (row.textContent || "").toLowerCase();

      let matches = true;
      if (q && !text.includes(q)) matches = false;
      if (clientQ && !text.includes(clientQ)) matches = false;
      if (projectQ && !text.includes(projectQ)) matches = false;

      if (matches && (from || to)) {
        const cells = Array.from(row.querySelectorAll("td"));
        const dates = cells
          .map((c) => parsePossibleDate(c.textContent || ""))
          .filter((d): d is Date => Boolean(d))
          .map(normalizeDateOnly);

        if (dates.length === 0) {
          matches = false;
        } else {
          const anyInRange = dates.some((d) => {
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
          });
          matches = anyInRange;
        }
      }

      (row as HTMLElement).style.display = matches ? "" : "none";
    });
  }, [selectedTable, search, clientFilter, projectFilter, fromDate, toDate]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setClientFilter("");
    setProjectFilter("");
    setFromDate("");
    setToDate("");

    if (!selectedTable) return;
    const rows = Array.from(selectedTable.querySelectorAll("tbody tr"));
    rows.forEach((row) => {
      (row as HTMLElement).style.display = "";
    });
  }, [selectedTable]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!selectedTable) return;
      const { headers, rows } = getRowsFromTable(selectedTable);
      if (headers.length === 0 || rows.length === 0) return;

      const filename = `grid-report-${new Date().toISOString().slice(0, 10)}`;
      setExporting(format);
      try {
        if (format === "csv") {
          await exportCSV(headers, rows, filename);
        } else if (format === "excel") {
          await exportExcel(headers, rows, filename);
        } else if (format === "pdf") {
          await exportPDF(headers, rows, filename, "Grid Report");
        } else {
          await exportCSV(headers, rows, `${filename}-google-sheets`);
          window.open("https://sheets.google.com/create", "_blank", "noopener,noreferrer");
        }
      } finally {
        setExporting("");
      }
    },
    [selectedTable]
  );

  if (!isAdmin || tables.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Table2 size={14} />
          Grid Filters & Reports
        </div>
        <select
          title="Select grid"
          value={selectedTableId}
          onChange={(e) => setSelectedTableId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.rowCount} rows)
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <label className="relative">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <input
          type="text"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          placeholder="Client filter"
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="text"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          placeholder="Project filter"
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="date"
          title="From date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="date"
          title="To date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={clearFilters}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FilterX size={13} /> Clear
        </button>
        <button
          onClick={() => handleExport("csv")}
          disabled={Boolean(exporting)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Download size={13} /> {exporting === "csv" ? "Exporting..." : "CSV"}
        </button>
        <button
          onClick={() => handleExport("excel")}
          disabled={Boolean(exporting)}
          className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          <FileSpreadsheet size={13} /> {exporting === "excel" ? "Exporting..." : "Excel"}
        </button>
        <button
          onClick={() => handleExport("pdf")}
          disabled={Boolean(exporting)}
          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        >
          <FileText size={13} /> {exporting === "pdf" ? "Exporting..." : "PDF"}
        </button>
        <button
          onClick={() => handleExport("gsheets")}
          disabled={Boolean(exporting)}
          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          <ExternalLink size={13} /> {exporting === "gsheets" ? "Exporting..." : "Google Sheets"}
        </button>
      </div>
    </div>
  );
}
