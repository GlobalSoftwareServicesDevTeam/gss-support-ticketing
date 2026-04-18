"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { FolderOpen, HardDrive } from "lucide-react";
import DocumentManager from "@/components/document-manager";
import GoogleDriveManager from "@/components/google-drive-manager";
import {
  exportRowsAsCSV,
  exportRowsAsExcel,
  exportRowsAsPDF,
  exportRowsToGoogleSheets,
} from "@/lib/reports-export";

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
  projectId: string | null;
  project: { id: string; projectName: string; customer?: { id: string; company: string } | null } | null;
}

interface CustomerOption {
  id: string;
  company: string;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"documents" | "drive">("documents");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const fetchDocuments = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (projectId) params.set("projectId", projectId);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (isAdmin && customerId) params.set("customerId", customerId);
    const url = `/api/documents${params.toString() ? `?${params.toString()}` : ""}`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setDocuments(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [search, projectId, fromDate, toDate, isAdmin, customerId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!isAdmin) return;

    fetch("/api/customers?limit=1000")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.customers || [];
        setCustomers(list.map((c: CustomerOption & Record<string, unknown>) => ({ id: c.id, company: c.company })));
      })
      .catch(() => setCustomers([]));
  }, [isAdmin]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list.map((p: ProjectOption & Record<string, unknown>) => ({ id: p.id, projectName: p.projectName })));
      })
      .catch(() => setProjects([]));
  }, []);

  async function exportDocuments(format: "csv" | "excel" | "pdf" | "gsheets") {
    const rows = documents.map((d) => ({
      Name: d.name,
      File: d.fileName,
      Category: d.category,
      Project: d.project?.projectName || "",
      Client: d.project?.customer?.company || "",
      SizeKB: Math.round((d.fileSize || 0) / 1024),
      UploadedAt: new Date(d.uploadedAt).toLocaleDateString("en-ZA"),
      Notes: d.notes || "",
    }));

    const filename = `documents-report-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") await exportRowsAsCSV(rows, filename);
    if (format === "excel") await exportRowsAsExcel(rows, filename);
    if (format === "pdf") await exportRowsAsPDF(rows, filename, "Documents Report");
    if (format === "gsheets") await exportRowsToGoogleSheets(rows, filename);
  }

  const tabs = [
    { key: "documents" as const, label: "Documents", icon: <FolderOpen size={16} /> },
    { key: "drive" as const, label: "Google Drive", icon: <HardDrive size={16} /> },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Document Portal</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Documents tab */}
      {activeTab === "documents" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />

            {isAdmin && (
              <select
                title="Client filter"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
              >
                <option value="">All Clients</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </select>
            )}

            <select
              title="Project filter"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectName}</option>
              ))}
            </select>

            <input
              type="date"
              title="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
            />
            <input
              type="date"
              title="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
            />

            <button onClick={() => exportDocuments("csv")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">CSV</button>
            <button onClick={() => exportDocuments("excel")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">Excel</button>
            <button onClick={() => exportDocuments("pdf")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">PDF</button>
            <button onClick={() => exportDocuments("gsheets")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">GSheets</button>
          </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading documents...</div>
        ) : (
          <DocumentManager documents={documents} onRefresh={fetchDocuments} />
        )}
        </div>
      )}

      {/* Google Drive tab */}
      {activeTab === "drive" && session?.user?.id && (
        <GoogleDriveManager isAdmin={isAdmin} currentUserId={session.user.id} />
      )}
    </div>
  );
}
