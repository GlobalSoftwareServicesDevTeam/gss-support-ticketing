"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import TaskBoard from "@/components/task-board";
import DocumentManager from "@/components/document-manager";

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
  dueDate: string | null;
  order: number;
  assignments: Assignment[];
}

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

interface Issue {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
}

interface Project {
  id: string;
  projectName: string;
  dateCreated: string;
  proposalDate: string | null;
  estimatedCompleteDate: string | null;
  onMaintenance: boolean;
  maintAmount: number | null;
  dateStarted: string | null;
  githubRepo: string | null;
  description: string | null;
  status: string;
  tasks: Task[];
  documents: Document[];
  issues: Issue[];
  _count: { issues: number; tasks: number; documents: number };
}

type TabType = "overview" | "tasks" | "documents" | "tickets";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("overview");

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading project...</div>;
  }

  if (!project) {
    return <div className="text-center py-12 text-slate-400">Project not found</div>;
  }

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks", count: project._count.tasks },
    { key: "documents", label: "Documents", count: project._count.documents },
    { key: "tickets", label: "Tickets", count: project._count.issues },
  ];

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    ON_HOLD: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-blue-100 text-blue-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Link href="/projects" className="text-blue-600 hover:underline text-sm">&larr; Projects</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.projectName}</h1>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${statusColors[project.status] || "bg-gray-100 text-gray-800"}`}>
            {project.status?.replace("_", " ")}
          </span>
        </div>
        {project.githubRepo && (
          <a
            href={project.githubRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
          >
            GitHub Repo &rarr;
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Project Details</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Created</dt>
                <dd className="text-sm text-slate-900">{new Date(project.dateCreated).toLocaleDateString()}</dd>
              </div>
              {project.dateStarted && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Started</dt>
                  <dd className="text-sm text-slate-900">{new Date(project.dateStarted).toLocaleDateString()}</dd>
                </div>
              )}
              {project.estimatedCompleteDate && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Est. Completion</dt>
                  <dd className="text-sm text-slate-900">{new Date(project.estimatedCompleteDate).toLocaleDateString()}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Maintenance</dt>
                <dd className="text-sm text-slate-900">
                  {project.onMaintenance ? (
                    <span className="text-green-600">Active {project.maintAmount ? `(R${project.maintAmount})` : ""}</span>
                  ) : "No"}
                </dd>
              </div>
              {project.githubRepo && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">GitHub</dt>
                  <dd className="text-sm">
                    <a href={project.githubRepo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                      {project.githubRepo}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{project._count.tasks}</p>
                <p className="text-sm text-slate-500">Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{project._count.documents}</p>
                <p className="text-sm text-slate-500">Documents</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{project._count.issues}</p>
                <p className="text-sm text-slate-500">Tickets</p>
              </div>
            </div>
          </div>

          {project.description && (
            <div className="col-span-1 md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Description</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <TaskBoard projectId={project.id} tasks={project.tasks} isAdmin={isAdmin} onRefresh={fetchProject} />
      )}

      {tab === "documents" && (
        <DocumentManager projectId={project.id} documents={project.documents} onRefresh={fetchProject} />
      )}

      {tab === "tickets" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Subject</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {project.issues.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No tickets for this project.</td></tr>
              ) : (
                project.issues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link href={`/issues/${issue.id}`} className="text-sm font-medium text-blue-600 hover:underline">{issue.subject}</Link>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={issue.status} /></td>
                    <td className="px-6 py-4"><PriorityBadge priority={issue.priority} /></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(issue.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
