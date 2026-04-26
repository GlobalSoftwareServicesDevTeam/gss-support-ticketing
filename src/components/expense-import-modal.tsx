
"use client";
import * as React from "react";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Loader2, Check, AlertTriangle, Download } from "lucide-react";

interface ImportResult {
  imported: number;
  errors: number;
  total: number;
  details?: { row: number; name: string; error: string }[];
}

interface PreviewData {
  headers: string[];
  preview: Record<string, string>[];
  autoMapping: Record<string, string>;
  totalRows: number;
}

const EXPENSE_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "expected_amount", label: "Expected Amount" },
  { key: "paid_amount", label: "Paid Amount" },
  { key: "is_recurring", label: "Recurring" },
];

export default function ExpenseImportModal({
  monthId,
  onClose,
  onImported,
}: {
  monthId: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "importing" | "done">("upload");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleFileSelect(f: File) {
    setFile(f);
    setError("");
    setLoading(true);
    const formData = new FormData();
    formData.append("file", f);
    try {
      const res = await fetch(`/api/expense-income/expenses/import?monthId=${monthId}`, {
        method: "PUT",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to parse file");
        setLoading(false);
        return;
      }
      setPreview(data);
      setMapping(data.autoMapping || {});
      setStep("mapping");
    } catch {
      setError("Failed to parse file");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!file) return;
    setStep("importing");
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("monthId", String(monthId));
    formData.append("columnMapping", JSON.stringify(mapping));
    try {
      const res = await fetch(`/api/expense-income/expenses/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        setStep("mapping");
      } else {
        setResult(data);
        setStep("done");
        if (data.imported > 0) onImported();
      }
    } catch {
      setError("Import failed");
      setStep("mapping");
    }
    setLoading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  function downloadTemplate() {
    const csv = "Name,Expected Amount,Paid Amount,Recurring\nExample Expense,1000,500,1\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expense-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Import Expenses</h2>
          </div>
          <button title="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition">
            <X size={20} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-gray-400">
                Import expenses from a CSV, Excel (.xlsx), or Google Sheets export file.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-blue-400 dark:hover:border-blue-500 transition cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {loading ? (
                  <Loader2 size={32} className="mx-auto mb-2 text-blue-500 animate-spin" />
                ) : (
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                )}
                <p className="text-sm font-medium text-slate-700 dark:text-gray-300">
                  {file ? file.name : "Drop file here or click to browse"}
                </p>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                  Supports .csv, .tsv, .xlsx, .xls
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  title="Upload spreadsheet file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>
              <button
                onClick={downloadTemplate}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"
              >
                <Download size={14} /> Download CSV template
              </button>
              <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-slate-500 dark:text-gray-400 space-y-1">
                <p className="font-medium text-slate-700 dark:text-gray-300">Tips for Google Sheets:</p>
                <p>1. Open your Google Sheet</p>
                <p>2. Go to File → Download → Comma-separated values (.csv)</p>
                <p>3. Upload the downloaded .csv file here</p>
              </div>
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}
          {/* Step: Column Mapping */}
          {step === "mapping" && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  Map your spreadsheet columns to expense fields.
                </p>
                <span className="text-xs text-slate-400 bg-slate-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {file?.name}
                </span>
              </div>
              {/* Column mapping */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                  Column Mapping
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EXPENSE_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-gray-400 w-24 shrink-0">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                      </span>
                      <select
                        title={`Map ${field.label}`}
                        value={mapping[field.key] || ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                        className="flex-1 text-xs border border-slate-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                      >
                        <option value="">— Skip —</option>
                        {preview.headers.map((h) => (
                          <option key={h} value={h.trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, "")}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              {/* Preview table */}
              {preview.preview.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                    Preview (first {preview.preview.length} rows)
                  </label>
                  <div className="overflow-x-auto border border-slate-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-gray-800">
                          {preview.headers.map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                            {preview.headers.map((h) => (
                              <td key={h} className="px-2 py-1.5 text-slate-600 dark:text-gray-400 whitespace-nowrap max-w-[150px] truncate">
                                {row[h] || ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}
          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={40} className="text-blue-500 animate-spin mb-3" />
              <p className="text-sm text-slate-600 dark:text-gray-400">Importing expenses...</p>
            </div>
          )}
          {/* Step: Done */}
          {step === "done" && result && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center text-center">
                {result.errors === 0 ? (
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                    <Check size={24} className="text-green-600" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-3">
                    <AlertTriangle size={24} className="text-yellow-600" />
                  </div>
                )}
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {result.imported} expense{result.imported !== 1 ? "s" : ""} imported
                </p>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  {result.total} total rows processed
                  {result.errors > 0 && ` · ${result.errors} error${result.errors !== 1 ? "s" : ""}`}
                </p>
              </div>
              {result.details && result.details.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-2">Errors:</p>
                  <ul className="space-y-1 text-xs text-yellow-700 dark:text-yellow-500">
                    {result.details.map((d, i) => (
                      <li key={i}>Row {d.row}: "{d.name}" — {d.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          {step === "mapping" && (
            <button
              onClick={() => { setStep("upload"); setFile(null); setPreview(null); setError(""); }}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-gray-400"
            >
              ← Back
            </button>
          )}
          {step !== "mapping" && <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition"
            >
              {step === "done" ? "Close" : "Cancel"}
            </button>
            {step === "mapping" && (
              <button
                onClick={handleImport}
                disabled={!mapping.name || loading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import Expenses
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
