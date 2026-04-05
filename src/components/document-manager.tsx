"use client";

import { useState } from "react";
import { Scale, FolderOpen, Package, Code, Receipt, FileEdit, BarChart3, CreditCard, Banknote, Paperclip } from "lucide-react";

interface Document {
  id: string;
  name: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  category: string;
  notes: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

interface DocumentManagerProps {
  projectId?: string;
  documents: Document[];
  onRefresh: () => void;
}

const CATEGORIES = [
  { key: "LEGAL", label: "Legal Documents", icon: <Scale size={18} />, color: "bg-purple-100 text-purple-800" },
  { key: "PROJECT", label: "Project Documents", icon: <FolderOpen size={18} />, color: "bg-blue-100 text-blue-800" },
  { key: "RESOURCE", label: "Resources", icon: <Package size={18} />, color: "bg-green-100 text-green-800" },
  { key: "CODE", label: "Code / GitHub", icon: <Code size={18} />, color: "bg-slate-100 text-slate-800" },
  { key: "INVOICE", label: "Invoices", icon: <Receipt size={18} />, color: "bg-yellow-100 text-yellow-800" },
  { key: "QUOTE", label: "Quotes", icon: <FileEdit size={18} />, color: "bg-teal-100 text-teal-800" },
  { key: "STATEMENT", label: "Statements", icon: <BarChart3 size={18} />, color: "bg-indigo-100 text-indigo-800" },
  { key: "CREDIT_NOTE", label: "Credit Notes", icon: <CreditCard size={18} />, color: "bg-pink-100 text-pink-800" },
  { key: "PAYMENT_NOTE", label: "Payment Notes", icon: <Banknote size={18} />, color: "bg-emerald-100 text-emerald-800" },
  { key: "OTHER", label: "Other", icon: <Paperclip size={18} />, color: "bg-gray-100 text-gray-800" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function DocumentManager({ projectId, documents, onRefresh }: DocumentManagerProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [form, setForm] = useState({ name: "", category: "PROJECT", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = filterCategory ? documents.filter((d) => d.category === filterCategory) : documents;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const ext = file.name.split(".").pop() || "";

      const url = projectId ? `/api/projects/${projectId}/documents` : "/api/documents";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || file.name,
          fileName: file.name,
          fileExt: ext,
          fileBase64: base64,
          fileSize: file.size,
          category: form.category,
          notes: form.notes || null,
          ...(projectId ? {} : { projectId: null }),
        }),
      });

      if (res.ok) {
        setShowUpload(false);
        setForm({ name: "", category: "PROJECT", notes: "" });
        setFile(null);
        onRefresh();
      }
      setSubmitting(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          {showUpload ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Document Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Document name (optional, uses filename if empty)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                title="Document category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">File *</label>
              <input
                type="file"
                title="Select file to upload"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes about this document"
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={submitting || !file} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm">
              {submitting ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterCategory("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            !filterCategory ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          All ({documents.length})
        </button>
        {CATEGORIES.filter((c) => documents.some((d) => d.category === c.key)).map((cat) => (
          <button
            key={cat.key}
            onClick={() => setFilterCategory(cat.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterCategory === cat.key ? "bg-blue-600 text-white border-blue-600" : `${cat.color} border-transparent hover:opacity-80`
            }`}
          >
            <span className="inline-flex items-center gap-1">{cat.icon} {cat.label} ({documents.filter((d) => d.category === cat.key).length})</span>
          </button>
        ))}
      </div>

      {/* Documents grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
          No documents{filterCategory ? ` in this category` : ""}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => {
            const cat = CATEGORIES.find((c) => c.key === doc.category);
            return (
              <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat?.icon || <Paperclip size={18} />}</span>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900">{doc.name}</h3>
                      <p className="text-xs text-slate-400">{doc.fileName}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cat?.color || "bg-gray-100 text-gray-800"}`}>
                    {cat?.label || doc.category}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
                {doc.notes && <p className="text-xs text-slate-500 mb-2">{doc.notes}</p>}
                <div className="flex gap-2">
                  <a
                    href={`/api/documents/${doc.id}/download`}
                    className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-xs px-3 py-1 text-red-600 hover:bg-red-50 rounded transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
