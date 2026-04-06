"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { ArrowLeft, Paperclip, X, ListTodo, Loader2, Check } from "lucide-react";
import Link from "next/link";

interface Message {
  id: string;
  content: string;
  dateCreated: string;
  isFromEmail: boolean;
  user?: { firstName: string; lastName: string };
}

interface FileUpload {
  id: string;
  fileName: string;
  fileExt: string;
  dateAdded: string;
  publicDoc: boolean;
}

interface IssueDetail {
  id: string;
  subject: string;
  initialNotes: string | null;
  status: string;
  priority: string;
  kind: string | null;
  company: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { firstName: string; lastName: string; email: string };
  customer?: { contactPerson: string; emailAddress: string; company: string };
  messages: Message[];
  fileUploads: FileUpload[];
  project?: { projectName: string } | null;
  convertedTaskId?: string | null;
}

export default function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.role === "ADMIN";

  // Convert to task state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [projects, setProjects] = useState<{ id: string; projectName: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [convertProjectId, setConvertProjectId] = useState("");
  const [convertAssignees, setConvertAssignees] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState("");

  function fetchIssue() {
    fetch(`/api/issues/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setIssue(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchIssue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);

    const res = await fetch(`/api/issues/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newMessage }),
    });

    if (res.ok) {
      setNewMessage("");
      fetchIssue();
    }
    setSending(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("isPublic", "false");

    await fetch(`/api/issues/${id}/files`, {
      method: "POST",
      body: formData,
    });

    e.target.value = "";
    fetchIssue();
    setUploading(false);
  }

  async function handleStatusChange(newStatus: string) {
    setStatusUpdating(true);
    await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchIssue();
    setStatusUpdating(false);
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/issues/${id}/files/${fileId}`, { method: "DELETE" });
    fetchIssue();
  }

  async function handleDeleteIssue() {
    if (!confirm("Are you sure you want to delete this ticket? This cannot be undone.")) return;
    await fetch(`/api/issues/${id}`, { method: "DELETE" });
    router.push("/issues");
  }

  async function openConvertModal() {
    setConvertMsg("");
    setConvertProjectId(issue?.project?.projectName ? "" : "");
    setConvertAssignees([]);
    setShowConvertModal(true);

    // Load projects and users in parallel
    const [projRes, usersRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/users"),
    ]);
    if (projRes.ok) {
      const data = await projRes.json();
      const list = Array.isArray(data) ? data : data.projects || [];
      setProjects(list.map((p: { id: string; projectName: string }) => ({ id: p.id, projectName: p.projectName })));
    }
    if (usersRes.ok) {
      const data = await usersRes.json();
      const list = Array.isArray(data) ? data : data.users || [];
      setUsers(list.map((u: { id: string; firstName: string; lastName: string }) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName })));
    }
  }

  async function handleConvert() {
    if (!convertProjectId) {
      setConvertMsg("Please select a project");
      return;
    }
    setConverting(true);
    setConvertMsg("");

    const res = await fetch(`/api/issues/${id}/convert-to-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: convertProjectId,
        assigneeIds: convertAssignees,
      }),
    });

    const data = await res.json();
    setConverting(false);

    if (res.ok) {
      setShowConvertModal(false);
      fetchIssue();
    } else {
      setConvertMsg(data.error || "Failed to convert");
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading...</div>;
  }

  if (!issue) {
    return <div className="text-center py-12 text-slate-400">Ticket not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/issues")}
            className="text-sm text-blue-600 hover:underline mb-2 inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Back to Tickets
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{issue.subject}</h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            {issue.kind && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{issue.kind}</span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {issue.convertedTaskId ? (
              <Link
                href="/task-schedule"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition"
              >
                <Check size={14} /> Converted to Task
              </Link>
            ) : (
              <button
                onClick={openConvertModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg text-sm font-medium hover:bg-brand-100 transition"
              >
                <ListTodo size={14} /> Convert to Task
              </button>
            )}
            <button
              onClick={handleDeleteIssue}
              className="text-sm text-red-600 hover:text-red-800 transition"
            >
              Delete Ticket
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Initial Notes */}
          {issue.initialNotes && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-medium text-slate-500 mb-2">Description</h3>
              <p className="text-slate-700 whitespace-pre-wrap">{issue.initialNotes}</p>
            </div>
          )}

          {/* Messages */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-sm font-medium text-slate-500">
                Messages ({issue.messages.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {issue.messages.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">
                  No messages yet.
                </div>
              ) : (
                issue.messages.map((msg) => (
                  <div key={msg.id} className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900">
                        {msg.user
                          ? `${msg.user.firstName} ${msg.user.lastName}`
                          : msg.isFromEmail
                          ? "Email Reply"
                          : "System"}
                      </span>
                      {msg.isFromEmail && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                          via Email
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(msg.dateCreated).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add Message */}
            <form onSubmit={handleSendMessage} className="px-6 py-4 border-t border-slate-200">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px] text-slate-900"
                placeholder="Type your message..."
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-blue-600 hover:underline cursor-pointer inline-flex items-center gap-1">
                    <Paperclip size={14} /> Attach File
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
                </div>
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-medium text-slate-500 mb-4">Details</h3>
            <div className="space-y-3 text-sm">
              <Detail label="Created" value={new Date(issue.createdAt).toLocaleString()} />
              <Detail label="Updated" value={new Date(issue.updatedAt).toLocaleString()} />
              {issue.user && (
                <Detail
                  label="Submitted by"
                  value={`${issue.user.firstName} ${issue.user.lastName}`}
                />
              )}
              {issue.customer && (
                <>
                  <Detail label="Customer" value={issue.customer.contactPerson} />
                  <Detail label="Email" value={issue.customer.emailAddress} />
                  <Detail label="Company" value={issue.customer.company} />
                </>
              )}
              {issue.project && (
                <Detail label="Project" value={issue.project.projectName} />
              )}
            </div>
          </div>

          {/* Status Change (Admin) */}
          {isAdmin && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Update Status</h3>
              <select
                title="Update status"
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={statusUpdating}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING">Waiting</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          )}

          {/* Attachments */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-medium text-slate-500 mb-3">
              Attachments ({issue.fileUploads.length})
            </h3>
            {issue.fileUploads.length === 0 ? (
              <p className="text-sm text-slate-400">No files attached.</p>
            ) : (
              <div className="space-y-2">
                {issue.fileUploads.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <a
                      href={`/api/issues/${id}/files/${file.id}`}
                      className="text-blue-600 hover:underline truncate flex-1"
                      download
                    >
                      {file.fileName}
                    </a>
                    <button
                      onClick={() => handleDeleteFile(file.id)}
                      className="text-red-400 hover:text-red-600 ml-2"
                      title="Delete file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert to Task Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ListTodo size={18} className="text-brand-500" /> Convert to Task
              </h3>
              <button onClick={() => setShowConvertModal(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {convertMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {convertMsg}
                </div>
              )}
              <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{issue.subject}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Priority: {issue.priority} &middot; Status: {issue.status}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project *
                </label>
                <select
                  title="Select a project"
                  value={convertProjectId}
                  onChange={(e) => setConvertProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Assign to <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={convertAssignees.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConvertAssignees([...convertAssignees, u.id]);
                          } else {
                            setConvertAssignees(convertAssignees.filter((a) => a !== u.id));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{u.firstName} {u.lastName}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowConvertModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvert}
                  disabled={converting || !convertProjectId}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50"
                >
                  {converting ? <Loader2 size={14} className="animate-spin" /> : <ListTodo size={14} />}
                  {converting ? "Converting..." : "Convert"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-slate-700">{value}</p>
    </div>
  );
}
