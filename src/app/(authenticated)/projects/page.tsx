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
  _count: { issues: number; tasks: number; documents: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ projectName: "", proposalDate: "", estimatedCompleteDate: "", dateStarted: "" });
  const [submitting, setSubmitting] = useState(false);

  function fetchProjects() {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ projectName: "", proposalDate: "", estimatedCompleteDate: "", dateStarted: "" });
      fetchProjects();
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
              {submitting ? "Creating..." : "Create Project"}
            </button>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No projects.</td></tr>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
