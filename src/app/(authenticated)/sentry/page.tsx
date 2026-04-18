"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  Save,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Bug,
  FolderKanban,
  User,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";

interface Project {
  id: string;
  projectName: string;
  status: string;
}

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  metadata: string | null;
  createdAt: string;
}

export default function SentryIntegrationPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [webhookSecret, setWebhookSecret] = useState("");
  const [defaultProjectId, setDefaultProjectId] = useState("");
  const [defaultAssigneeId, setDefaultAssigneeId] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/sentry`
      : "https://support.globalsoftwareservices.co.za/api/webhooks/sentry";

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/settings?keys=SENTRY_WEBHOOK_SECRET,SENTRY_DEFAULT_PROJECT_ID,SENTRY_DEFAULT_ASSIGNEE_ID"
      );
      if (res.ok) {
        const data = await res.json();
        setWebhookSecret(data.SENTRY_WEBHOOK_SECRET || "");
        setDefaultProjectId(data.SENTRY_DEFAULT_PROJECT_ID || "");
        setDefaultAssigneeId(data.SENTRY_DEFAULT_ASSIGNEE_ID || "");
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.projects || [];
        setProjects(list.filter((p: Project) => p.status === "ACTIVE"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.users || [];
        setUsers(list);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchRecentLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/audit-logs?entity=ISSUE&search=sentry&limit=20");
      if (res.ok) {
        const data = await res.json();
        setRecentLogs(Array.isArray(data) ? data : data.data || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const load = async () => {
        await fetchSettings();
        await fetchProjects();
        await fetchUsers();
        await fetchRecentLogs();
      };
      load();
    }
  }, [isAdmin, fetchSettings, fetchProjects, fetchUsers, fetchRecentLogs]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const body: Record<string, string> = {
        SENTRY_DEFAULT_PROJECT_ID: defaultProjectId,
        SENTRY_DEFAULT_ASSIGNEE_ID: defaultAssigneeId,
      };
      // Only send secret if it's not the masked placeholder
      if (webhookSecret && webhookSecret !== "••••••••") {
        body.SENTRY_WEBHOOK_SECRET = webhookSecret;
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg("Settings saved successfully");
        fetchSettings();
      } else {
        setSaveMsg("Failed to save settings");
      }
    } catch {
      setSaveMsg("Failed to save settings");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setWebhookSecret(hex);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Bug size={24} className="text-purple-600 dark:text-purple-400" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Sentry Integration</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Automatically create tickets and tasks when Sentry detects errors in client systems
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Setup Instructions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <ExternalLink size={18} className="text-blue-500" />
              Setup Instructions
            </h2>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>
                <strong>1.</strong> In your Sentry project, go to{" "}
                <strong>Settings → Integrations → Internal Integrations</strong> (or use Webhooks).
              </p>
              <p>
                <strong>2.</strong> Create a new integration or webhook. Set the <strong>Webhook URL</strong> to:
              </p>
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-gray-700/50 rounded-lg border border-slate-200 dark:border-slate-600 font-mono text-xs break-all">
                <span className="flex-1">{webhookUrl}</span>
                <button
                  onClick={copyWebhookUrl}
                  className="flex-shrink-0 p-1.5 rounded-md bg-white dark:bg-gray-600 border border-slate-200 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-gray-500 transition"
                  title="Copy webhook URL"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <p>
                <strong>3.</strong> Enable <strong>issue</strong> alerts (and optionally event/metric alerts).
              </p>
              <p>
                <strong>4.</strong> Copy the <strong>Client Secret</strong> from Sentry and paste it below as the
                Webhook Secret for signature verification.
              </p>
              <p>
                <strong>5.</strong> Select a default project and assignee for created tickets/tasks below.
              </p>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Shield size={18} className="text-emerald-500" />
              Configuration
            </h2>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <RefreshCw size={14} className="animate-spin" /> Loading settings...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Webhook Secret */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Webhook Secret (for signature verification)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showSecret ? "text" : "password"}
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        placeholder="Paste Sentry client secret here"
                        className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title={showSecret ? "Hide" : "Show"}
                      >
                        {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      onClick={generateSecret}
                      className="px-3 py-2 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-gray-600 transition text-xs font-medium whitespace-nowrap"
                      title="Generate a random secret"
                    >
                      Generate
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Optional — if set, webhook payloads are verified using HMAC-SHA256. Leave empty to accept all requests (not recommended for production).
                  </p>
                </div>

                {/* Default Project */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    <FolderKanban size={12} className="inline mr-1" />
                    Default Project for Sentry Tickets
                  </label>
                  <select
                    value={defaultProjectId}
                    onChange={(e) => setDefaultProjectId(e.target.value)}
                    title="Select default project"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— Auto-match by Sentry project name —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    If not set, the system will try to match the Sentry project name to an active project. Tasks are only created when a project is matched.
                  </p>
                </div>

                {/* Default Assignee */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    <User size={12} className="inline mr-1" />
                    Default Task Assignee
                  </label>
                  <select
                    value={defaultAssigneeId}
                    onChange={(e) => setDefaultAssigneeId(e.target.value)}
                    title="Select default assignee"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— No auto-assignment —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    When a Sentry error creates a task, it will be automatically assigned to this user.
                  </p>
                </div>

                {/* Save */}
                <div className="flex items-center gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                  {saveMsg && (
                    <span
                      className={`text-sm font-medium ${
                        saveMsg.includes("success")
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {saveMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Sentry Tickets */}
        <div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <AlertCircle size={18} className="text-orange-500" />
                Recent Sentry Tickets
              </h2>
              <button
                onClick={fetchRecentLogs}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-gray-700 transition"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <div className="text-center py-8">
                <Bug size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  No Sentry tickets yet
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Tickets will appear here once Sentry sends a webhook
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentLogs.map((log) => {
                  const meta = log.metadata ? JSON.parse(log.metadata) : {};
                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-gray-700/30 transition"
                    >
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 line-clamp-2">
                        {log.description.replace("Sentry webhook created ticket: ", "")}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        {meta.sentryProject && (
                          <span className="inline-flex items-center gap-1">
                            <FolderKanban size={10} />
                            {meta.sentryProject}
                          </span>
                        )}
                        <span>
                          {new Date(log.createdAt).toLocaleDateString("en-ZA")}{" "}
                          {new Date(log.createdAt).toLocaleTimeString("en-ZA", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {meta.sentryLink && (
                        <a
                          href={meta.sentryLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-xs text-blue-500 hover:text-blue-700 transition"
                        >
                          <ExternalLink size={10} /> View in Sentry
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="mt-6 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 p-5">
            <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">
              How it works
            </h3>
            <ul className="space-y-2 text-xs text-purple-700 dark:text-purple-300">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                Sentry detects an error and sends a webhook to your portal
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                A support ticket is created with the error details, Sentry link, and priority
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                A task is created in the matched project and assigned to you
              </li>
              <li className="flex gap-2">
                <span className="font-bold">4.</span>
                Duplicate errors are automatically detected and skipped
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
