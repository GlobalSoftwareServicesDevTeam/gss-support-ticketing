"use client";

import { useEffect, useState } from "react";
import { permissionLabels, type StaffPermission } from "@/lib/permissions";

interface StaffRole {
  id: string;
  name: string;
  description: string | null;
  canManageTickets: boolean;
  canManageProjects: boolean;
  canManageBilling: boolean;
  canManageHosting: boolean;
  canManageUsers: boolean;
  canManageDocuments: boolean;
  canManageCode: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
  canManageCustomers: boolean;
  canManageTasks: boolean;
  canManageSentry: boolean;
  canBulkEmail: boolean;
  createdAt: string;
  _count: { users: number };
}

const permissionDbKeyMap: Record<StaffPermission, string> = {
  manageTickets: "canManageTickets",
  manageProjects: "canManageProjects",
  manageBilling: "canManageBilling",
  manageHosting: "canManageHosting",
  manageUsers: "canManageUsers",
  manageDocuments: "canManageDocuments",
  manageCode: "canManageCode",
  viewAuditLogs: "canViewAuditLogs",
  manageSettings: "canManageSettings",
  manageCustomers: "canManageCustomers",
  manageTasks: "canManageTasks",
  manageSentry: "canManageSentry",
  bulkEmail: "canBulkEmail",
};

const allPermissions = Object.keys(permissionLabels) as StaffPermission[];

function getEmptyPermissions(): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  for (const key of allPermissions) {
    perms[permissionDbKeyMap[key]] = false;
  }
  return perms;
}

export default function StaffRolesPage() {
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<StaffRole | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>(getEmptyPermissions());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  function fetchRoles() {
    fetch("/api/staff-roles")
      .then((r) => r.json())
      .then((data) => {
        setRoles(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchRoles();
  }, []);

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormPermissions(getEmptyPermissions());
    setFormError("");
    setEditingRole(null);
    setShowForm(false);
  }

  function startEdit(role: StaffRole) {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description || "");
    const perms: Record<string, boolean> = {};
    for (const key of allPermissions) {
      const dbKey = permissionDbKeyMap[key];
      perms[dbKey] = (role as unknown as Record<string, boolean>)[dbKey] || false;
    }
    setFormPermissions(perms);
    setShowForm(true);
  }

  function toggleAll(checked: boolean) {
    const perms: Record<string, boolean> = {};
    for (const key of allPermissions) {
      perms[permissionDbKeyMap[key]] = checked;
    }
    setFormPermissions(perms);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const payload = {
      name: formName,
      description: formDescription,
      ...formPermissions,
    };

    const url = editingRole ? `/api/staff-roles/${editingRole.id}` : "/api/staff-roles";
    const method = editingRole ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data.error || "Failed to save role");
    } else {
      resetForm();
      fetchRoles();
      setActionMsg(editingRole ? "Role updated successfully" : "Role created successfully");
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  async function handleDelete(role: StaffRole) {
    if (!confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return;

    const res = await fetch(`/api/staff-roles/${role.id}`, { method: "DELETE" });
    const data = await res.json();

    if (res.ok) {
      setActionMsg("Role deleted successfully");
      fetchRoles();
    } else {
      setActionMsg(data.error || "Failed to delete role");
    }
    setTimeout(() => setActionMsg(""), 4000);
  }

  const enabledCount = (role: StaffRole) => {
    let count = 0;
    for (const key of allPermissions) {
      if ((role as unknown as Record<string, boolean>)[permissionDbKeyMap[key]]) count++;
    }
    return count;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Roles</h1>
          <p className="text-sm text-slate-500 mt-1">Define roles with specific permissions for your employees</p>
        </div>
        <button
          onClick={() => { if (showForm) { resetForm(); } else { setShowForm(true); } }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? "Cancel" : "+ Create Role"}
        </button>
      </div>

      {actionMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          actionMsg.toLowerCase().includes("error") || actionMsg.toLowerCase().includes("failed") || actionMsg.toLowerCase().includes("cannot")
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {actionMsg}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {editingRole ? `Edit Role: ${editingRole.name}` : "Create New Role"}
          </h2>
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Support Agent, Project Manager"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this role"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-700">Permissions</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="text-xs px-2 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {allPermissions.map((perm) => {
                  const dbKey = permissionDbKeyMap[perm];
                  const { label, description } = permissionLabels[perm];
                  return (
                    <label
                      key={perm}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        formPermissions[dbKey]
                          ? "bg-blue-50 border-blue-200"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formPermissions[dbKey] || false}
                        onChange={(e) =>
                          setFormPermissions({ ...formPermissions, [dbKey]: e.target.checked })
                        }
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-900">{label}</span>
                        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? "Saving..." : editingRole ? "Update Role" : "Create Role"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Role Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Permissions</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Users</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading...</td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  No staff roles defined yet. Create one to assign to employees.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-900">{role.name}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {role.description || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      {enabledCount(role)} of {allPermissions.length}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {role._count.users}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(role)}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition"
                      >
                        Delete
                      </button>
                    </div>
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
