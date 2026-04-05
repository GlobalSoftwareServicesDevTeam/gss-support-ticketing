"use client";

import { useEffect, useState, useCallback } from "react";
import { PenLine, Clock, CheckCircle2, Eye, Send, FileText, XCircle } from "lucide-react";

interface SigningRequest {
  id: string;
  documentId: string;
  documentName: string;
  status: string;
  signerName: string;
  signerEmail: string;
  signerSignedAt: string | null;
  witnessName: string | null;
  witnessEmail: string | null;
  witnessSignedAt: string | null;
  adminSignedAt: string | null;
  createdAt: string;
}

interface DocumentOption {
  id: string;
  name: string;
  fileName: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING_SIGNER: { label: "Awaiting Signer", color: "bg-yellow-100 text-yellow-700", icon: <Clock size={14} /> },
  PENDING_WITNESS: { label: "Awaiting Witness", color: "bg-purple-100 text-purple-700", icon: <Eye size={14} /> },
  PENDING_ADMIN: { label: "Awaiting Your Signature", color: "bg-blue-100 text-blue-700", icon: <PenLine size={14} /> },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-700", icon: <CheckCircle2 size={14} /> },
  CANCELLED: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: <XCircle size={14} /> },
};

export default function SigningPage() {
  const [requests, setRequests] = useState<SigningRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    documentId: "",
    signerName: "",
    signerEmail: "",
    witnessName: "",
    witnessEmail: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [sigRes, docRes] = await Promise.all([
        fetch("/api/signing"),
        fetch("/api/documents"),
      ]);
      if (sigRes.ok) {
        const data = await sigRes.json();
        setRequests(data);
      }
      if (docRes.ok) {
        const data = await docRes.json();
        setDocuments(data.map((d: DocumentOption) => ({ id: d.id, name: d.name, fileName: d.fileName })));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");

    const doc = documents.find((d) => d.id === form.documentId);
    if (!doc) {
      setMsg("Please select a document");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/signing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          documentName: doc.name || doc.fileName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Failed to create signing request");
      } else {
        setMsg("Signing request created! Email sent to the signer.");
        setForm({ documentId: "", signerName: "", signerEmail: "", witnessName: "", witnessEmail: "" });
        setShowForm(false);
        fetchData();
      }
    } catch {
      setMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Document Signing</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "New Signing Request"}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed")
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {msg}
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Signing Request</h2>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
            Select a document and enter the signer and witness details. The signer will receive an email to sign first,
            then the witness, and finally you will countersign.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Document *</label>
                <select
                  title="Select document to sign"
                  value={form.documentId}
                  onChange={(e) => setForm({ ...form, documentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                >
                  <option value="">Select a document...</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} ({doc.fileName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Signer Name *</label>
                <input
                  type="text"
                  value={form.signerName}
                  onChange={(e) => setForm({ ...form, signerName: e.target.value })}
                  placeholder="Full name of the signer"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Signer Email *</label>
                <input
                  type="email"
                  value={form.signerEmail}
                  onChange={(e) => setForm({ ...form, signerEmail: e.target.value })}
                  placeholder="signer@example.com"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Witness Name *</label>
                <input
                  type="text"
                  value={form.witnessName}
                  onChange={(e) => setForm({ ...form, witnessName: e.target.value })}
                  placeholder="Full name of the witness"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Witness Email *</label>
                <input
                  type="email"
                  value={form.witnessEmail}
                  onChange={(e) => setForm({ ...form, witnessEmail: e.target.value })}
                  placeholder="witness@example.com"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  <Send size={16} /> {submitting ? "Sending..." : "Send for Signing"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Signing Requests List */}
      {requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-gray-400">No signing requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const st = STATUS_MAP[req.status] || { label: req.status, color: "bg-gray-100 text-gray-700", icon: null };
            return (
              <div
                key={req.id}
                className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{req.documentName}</h3>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                      Created {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${st.color}`}>
                    {st.icon} {st.label}
                  </span>
                </div>

                {/* Step indicators */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className={`p-3 rounded-lg border text-center ${
                    req.signerSignedAt
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                      : req.status === "PENDING_SIGNER"
                      ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
                      : "border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800"
                  }`}>
                    <p className="text-xs font-medium text-slate-600 dark:text-gray-300">1. Signer</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">{req.signerName}</p>
                    {req.signerSignedAt ? (
                      <p className="text-xs text-green-600 mt-1">Signed {new Date(req.signerSignedAt).toLocaleDateString()}</p>
                    ) : req.status === "PENDING_SIGNER" ? (
                      <p className="text-xs text-yellow-600 mt-1">Awaiting...</p>
                    ) : null}
                  </div>
                  <div className={`p-3 rounded-lg border text-center ${
                    req.witnessSignedAt
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                      : req.status === "PENDING_WITNESS"
                      ? "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20"
                      : "border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800"
                  }`}>
                    <p className="text-xs font-medium text-slate-600 dark:text-gray-300">2. Witness</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">{req.witnessName || "-"}</p>
                    {req.witnessSignedAt ? (
                      <p className="text-xs text-green-600 mt-1">Signed {new Date(req.witnessSignedAt).toLocaleDateString()}</p>
                    ) : req.status === "PENDING_WITNESS" ? (
                      <p className="text-xs text-purple-600 mt-1">Awaiting...</p>
                    ) : null}
                  </div>
                  <div className={`p-3 rounded-lg border text-center ${
                    req.adminSignedAt
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                      : req.status === "PENDING_ADMIN"
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800"
                  }`}>
                    <p className="text-xs font-medium text-slate-600 dark:text-gray-300">3. Admin</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">You</p>
                    {req.adminSignedAt ? (
                      <p className="text-xs text-green-600 mt-1">Signed {new Date(req.adminSignedAt).toLocaleDateString()}</p>
                    ) : req.status === "PENDING_ADMIN" ? (
                      <p className="text-xs text-blue-600 mt-1">Your turn!</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
