"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  company: string | null;
  role: string;
  staffRoleId: string | null;
  staffRole: { id: string; name: string } | null;
  emailConfirmed: boolean;
  inviteToken: string | null;
  totpEnabled: boolean;
  createdAt: string;
  _count: { issues: number };
}

interface Project {
  id: string;
  projectName: string;
  status: string;
}

interface StaffRoleOption {
  id: string;
  name: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffRoles, setStaffRoles] = useState<StaffRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [form, setForm] = useState({
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    phoneNumber: "",
    company: "",
    role: "USER",
    staffRoleId: "",
  });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "USER",
    staffRoleId: "",
    projectIds: [] as string[],
    invoiceNinjaClientId: "",
  });
  const [formError, setFormError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [billingClients, setBillingClients] = useState<{ id: string; name: string; display_name: string }[]>([]);

  function fetchUsers() {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchUsers();
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setProjects(Array.isArray(data) ? data : []));
    fetch("/api/billing?action=list-clients")
      .then((r) => r.ok ? r.json() : { clients: [] })
      .then((data) => setBillingClients(data.clients || []));
    fetch("/api/staff-roles")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setStaffRoles(Array.isArray(data) ? data.map((r: StaffRoleOption & Record<string, unknown>) => ({ id: r.id, name: r.name })) : []));
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data.error || "Failed to create user.");
    } else {
      setShowForm(false);
      setForm({ username: "", email: "", firstName: "", lastName: "", password: "", phoneNumber: "", company: "", role: "USER", staffRoleId: "" });
      fetchUsers();
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviting(true);

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });

    const data = await res.json();
    setInviting(false);

    if (!res.ok) {
      setInviteError(data.error || "Failed to send invitation.");
    } else {
      setShowInviteForm(false);
      setInviteForm({ email: "", firstName: "", lastName: "", role: "USER", staffRoleId: "", projectIds: [], invoiceNinjaClientId: "" });
      setActionMsg("Invitation sent successfully!");
      fetchUsers();
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`Are you sure you want to delete ${userName}? This action will disable their account.`)) return;

    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    const data = await res.json();

    if (res.ok) {
      setActionMsg("User deleted successfully");
      fetchUsers();
    } else {
      setActionMsg(data.error || "Failed to delete user");
    }
    setTimeout(() => setActionMsg(""), 4000);
  }

  async function handleResetPassword(userId: string, userName: string) {
    if (!confirm(`Reset password for ${userName}? A temporary password will be emailed to them.`)) return;

    const res = await fetch(`/api/users/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-password" }),
    });
    const data = await res.json();

    setActionMsg(data.message || data.error || "Done");
    setTimeout(() => setActionMsg(""), 4000);
  }

  async function handleReset2FA(userId: string, userName: string) {
    if (!confirm(`Reset two-factor authentication for ${userName}? They will need to set up 2FA again.`)) return;

    const res = await fetch(`/api/users/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-2fa" }),
    });
    const data = await res.json();

    setActionMsg(data.message || data.error || "Done");
    fetchUsers();
    setTimeout(() => setActionMsg(""), 4000);
  }

  async function handleResendInvite(userId: string) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend-invite" }),
    });
    const data = await res.json();

    setActionMsg(data.message || data.error || "Done");
    setTimeout(() => setActionMsg(""), 4000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowInviteForm(!showInviteForm); setShowForm(false); }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            {showInviteForm ? "Cancel" : "Invite User"}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowInviteForm(false); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {showForm ? "Cancel" : "+ Add User"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          actionMsg.toLowerCase().includes("error") || actionMsg.toLowerCase().includes("failed")
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Invite User Form */}
      {showInviteForm && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Invite User by Email</h2>
          <p className="text-sm text-slate-500 mb-4">The user will receive an email to set up their account, enter company info, and sign terms.</p>
          {inviteError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {inviteError}
            </div>
          )}
          <form onSubmit={handleInvite} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                value={inviteForm.firstName}
                onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                placeholder="First name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                value={inviteForm.lastName}
                onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                placeholder="Last name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select
                title="Role"
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value, staffRoleId: "" })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              >
                <option value="USER">User</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {inviteForm.role === "EMPLOYEE" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Staff Role *</label>
                <select
                  title="Staff role"
                  value={inviteForm.staffRoleId}
                  onChange={(e) => setInviteForm({ ...inviteForm, staffRoleId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
                  required
                >
                  <option value="">Select a staff role...</option>
                  {staffRoles.map((sr) => (
                    <option key={sr.id} value={sr.id}>{sr.name}</option>
                  ))}
                </select>
                {staffRoles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No staff roles defined. Create one in Staff Roles first.</p>
                )}
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Projects</label>
              <div className="border border-slate-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 bg-white">
                {projects.length === 0 ? (
                  <p className="text-sm text-slate-400">No projects available.</p>
                ) : (
                  projects.filter((p) => p.status === "ACTIVE").map((project) => (
                    <label key={project.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inviteForm.projectIds.includes(project.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...inviteForm.projectIds, project.id]
                            : inviteForm.projectIds.filter((id) => id !== project.id);
                          setInviteForm({ ...inviteForm, projectIds: ids });
                        }}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-slate-700">{project.projectName}</span>
                    </label>
                  ))
                )}
              </div>
              {inviteForm.projectIds.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {inviteForm.projectIds.length} project{inviteForm.projectIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            {billingClients.length > 0 && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Link Billing Account (Invoice Ninja)</label>
                <select
                  title="Billing account"
                  value={inviteForm.invoiceNinjaClientId}
                  onChange={(e) => setInviteForm({ ...inviteForm, invoiceNinjaClientId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
                >
                  <option value="">None — create later</option>
                  {billingClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.name} (ID: {c.id})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Link this user to an existing Invoice Ninja client for recurring billing.</p>
              </div>
            )}
            <div className="col-span-2">
              <button
                type="submit"
                disabled={inviting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {inviting ? "Sending Invitation..." : "Send Invitation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add User Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Create New User</h2>
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="First name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Last name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Username"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email address"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select
                title="Role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, staffRoleId: "" })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
              >
                <option value="USER">User</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {form.role === "EMPLOYEE" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Staff Role *</label>
                <select
                  title="Staff role"
                  value={form.staffRoleId}
                  onChange={(e) => setForm({ ...form, staffRoleId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
                  required
                >
                  <option value="">Select a staff role...</option>
                  {staffRoles.map((sr) => (
                    <option key={sr.id} value={sr.id}>{sr.name}</option>
                  ))}
                </select>
                {staffRoles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No staff roles defined. Create one in Staff Roles first.</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="Phone number"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Company name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div className="col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Email</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Company</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Role</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tickets</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-400">Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-400">No users found.</td>
              </tr>
            ) : (
              users.map((user) => {
                const isPending = !user.emailConfirmed && !!user.inviteToken;
                return (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">
                    <Link href={`/users/${user.id}`} className="text-brand-600 hover:underline font-medium">
                      {user.firstName} {user.lastName}
                    </Link>
                    <p className="text-xs text-slate-400">@{user.username}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.company || "—"}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      user.role === "ADMIN"
                        ? "bg-red-100 text-red-700"
                        : user.role === "EMPLOYEE"
                        ? "bg-purple-100 text-purple-700"
                        : user.role === "EDITOR"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {user.role}
                    </span>
                    {user.staffRole && (
                      <span className="ml-1 text-xs text-slate-500">({user.staffRole.name})</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user._count.issues}</td>
                  <td className="px-6 py-4 text-sm">
                    {isPending ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">Invited</span>
                    ) : user.emailConfirmed ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700">Active</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">Unverified</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {isPending ? (
                        <button
                          onClick={() => handleResendInvite(user.id)}
                          className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100 transition"
                        >
                          Resend
                        </button>
                      ) : user.emailConfirmed && (
                        <>
                          <button
                            onClick={() => handleResetPassword(user.id, `${user.firstName} ${user.lastName}`)}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition"
                          >
                            Reset Pwd
                          </button>
                          {user.totpEnabled && (
                            <button
                              onClick={() => handleReset2FA(user.id, `${user.firstName} ${user.lastName}`)}
                              className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition"
                            >
                              Reset 2FA
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(user.id, `${user.firstName} ${user.lastName}`)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
