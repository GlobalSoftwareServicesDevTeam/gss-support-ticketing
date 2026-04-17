"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Project {
  id: string;
  projectName: string;
  dateCreated: string;
  proposalDate: string | null;
  estimatedCompleteDate: string | null;
  onMaintenance: boolean;
  maintAmount: number | null;
  dateStarted: string | null;
  status: string;
  customerId?: string;
  _count: { issues: number; tasks: number; documents: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ projectName: "", proposalDate: "", estimatedCompleteDate: "", dateStarted: "", customerId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; company: string }[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function fetchCustomers() {
    setCustomersLoading(true);
    fetch("/api/customers?limit=1000")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to fetch customers");
        return r.json();
      })
      .then((data) => {
        setCustomers(Array.isArray(data.customers) ? data.customers : []);
        setCustomersLoading(false);
      })
      .catch(() => {
        setCustomers([]);
        setCustomersLoading(false);
      });
  }

  function fetchProjects() {
    fetch("/api/projects")
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          throw new Error(text || `Error: ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setProjects([]);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchProjects();
    fetchCustomers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/projects/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error: ${res.status}`);
      }
      setShowForm(false);
      setForm({ projectName: "", proposalDate: "", estimatedCompleteDate: "", dateStarted: "", customerId: "" });
      setEditingId(null);
      fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to ${editingId ? "update" : "create"} project: ${msg}`);
    }
    setSubmitting(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
            <input
              type="text"
              value={form.projectName}
              onChange={(e) => setForm({ ...form, projectName: e.target.value })}
              placeholder="Enter project name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
            <select
              title="Select client"
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              required
              disabled={customersLoading}
            >
              <option value="">{customersLoading ? "Loading clients..." : "Select client"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Proposal Date</label>
            <input type="date" value={form.proposalDate} onChange={(e) => setForm({ ...form, proposalDate: e.target.value })} title="Proposal Date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Est. Complete Date</label>
            <input type="date" value={form.estimatedCompleteDate} onChange={(e) => setForm({ ...form, estimatedCompleteDate: e.target.value })} title="Estimated Complete Date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input type="date" value={form.dateStarted} onChange={(e) => setForm({ ...form, dateStarted: e.target.value })} title="Start Date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              {submitting ? (editingId ? "Saving..." : "Creating...") : (editingId ? "Save Changes" : "Create Project")}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm({ projectName: "", proposalDate: "", estimatedCompleteDate: "", dateStarted: "", customerId: "" }); setShowForm(false); }} className="ml-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
            )}
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Project</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Created</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tasks</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Docs</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tickets</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">No projects.</td></tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <Link href={`/projects/${p.id}`} className="text-sm font-medium text-blue-600 hover:underline">{p.projectName}</Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                      p.status === "ON_HOLD" ? "bg-yellow-100 text-yellow-800" :
                      p.status === "COMPLETED" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>{p.status?.replace("_", " ") || "ACTIVE"}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(p.dateCreated).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{p._count.tasks}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{p._count.documents}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{p._count.issues}</td>
                  <td className="px-6 py-4">
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => {
                      setEditingId(p.id);
                      setForm({
                        projectName: p.projectName || "",
                        proposalDate: p.proposalDate ? p.proposalDate.slice(0, 10) : "",
                        estimatedCompleteDate: p.estimatedCompleteDate ? p.estimatedCompleteDate.slice(0, 10) : "",
                        dateStarted: p.dateStarted ? p.dateStarted.slice(0, 10) : "",
                        customerId: (p.customerId || ""),
                      });
                      setShowForm(true);
                    }}>Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
