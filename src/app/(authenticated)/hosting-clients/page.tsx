"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Server,
  Search,
  Loader2,
  Globe,
  LogIn,
  Building2,
  Mail,
  User,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  HardDrive,
  Power,
  PowerOff,
  Link,
  X,
} from "lucide-react";

interface PleskDomain {
  id: number;
  name: string;
  hosting_type: string;
  status: string;
  disk_usage: number | null;
  disk_limit: number | null;
}

interface ClientHosting {
  customerId: string;
  company: string;
  contactPerson: string;
  email: string;
  found: boolean;
  pleskCustomer: {
    id: number;
    login: string;
    name: string;
  } | null;
  domains: PleskDomain[];
  sessionUrl: string | null;
}

interface UnassignedPleskClient {
  id: number;
  login: string;
  name: string;
  email: string;
  domains: { id: number; name: string; status: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  disabled: "bg-red-100 text-red-700",
  suspended: "bg-yellow-100 text-yellow-700",
};

export default function HostingClientsPage() {
  const { data: session } = useSession();
  const [clients, setClients] = useState<ClientHosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "hosted" | "not-hosted">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [togglingDomains, setTogglingDomains] = useState<Set<number>>(new Set());
  const [unassignedClients, setUnassignedClients] = useState<UnassignedPleskClient[]>([]);
  const [assignModalFor, setAssignModalFor] = useState<ClientHosting | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);

  useEffect(() => {
    if (session?.user?.role === "ADMIN") {
      fetch("/api/hosting/clients")
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setClients(data.clients || []);
          }
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load hosting data");
          setLoading(false);
        });
    }
  }, [session]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  async function toggleDomainStatus(domainId: number, currentStatus: string) {
    const action = currentStatus === "active" ? "suspend" : "activate";
    const label = action === "suspend" ? "Suspend" : "Activate";
    if (!confirm(`Are you sure you want to ${label.toLowerCase()} this domain?`)) return;

    setTogglingDomains((prev) => new Set(prev).add(domainId));
    try {
      const res = await fetch("/api/hosting/clients/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            domains: c.domains.map((d) =>
              d.id === domainId ? { ...d, status: data.newStatus } : d
            ),
          }))
        );
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch {
      alert("Failed to update subscription status");
    } finally {
      setTogglingDomains((prev) => {
        const next = new Set(prev);
        next.delete(domainId);
        return next;
      });
    }
  }

  async function openAssignModal(client: ClientHosting) {
    setAssignModalFor(client);
    setLoadingUnassigned(true);
    try {
      const res = await fetch("/api/hosting/clients/unassigned");
      const data = await res.json();
      setUnassignedClients(data.clients || []);
    } catch {
      setUnassignedClients([]);
    } finally {
      setLoadingUnassigned(false);
    }
  }

  async function assignPleskClient(pleskClientId: number) {
    if (!assignModalFor) return;
    if (!confirm(`Assign this Plesk account to ${assignModalFor.company}? This will update the Plesk client's email to match the customer.`)) return;

    setAssigning(true);
    try {
      const res = await fetch("/api/hosting/clients/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: assignModalFor.customerId,
          pleskClientId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAssignModalFor(null);
        // Reload the page data
        setLoading(true);
        try {
          const r = await fetch("/api/hosting/clients");
          const d = await r.json();
          if (!d.error) setClients(d.clients || []);
        } finally {
          setLoading(false);
        }
      } else {
        alert(data.error || "Failed to assign hosting");
      }
    } catch {
      alert("Failed to assign hosting");
    } finally {
      setAssigning(false);
    }
  }

  const filtered = clients.filter((c) => {
    if (filterMode === "hosted" && !c.found) return false;
    if (filterMode === "not-hosted" && c.found) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.company?.toLowerCase().includes(q) ||
        c.contactPerson?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.pleskCustomer?.login?.toLowerCase().includes(q) ||
        c.domains.some((d) => d.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const hostedCount = clients.filter((c) => c.found).length;
  const totalDomains = clients.reduce((sum, c) => sum + c.domains.length, 0);

  if (!session || session.user?.role !== "ADMIN") return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Server className="text-blue-600" size={28} />
          Client Hosting
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Plesk hosting information for all clients
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <Building2 size={14} />
            Total Clients
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{clients.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
            <Server size={14} />
            With Hosting
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{hostedCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-1">
            <AlertCircle size={14} />
            No Hosting
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{clients.length - hostedCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
            <Globe size={14} />
            Total Domains
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalDomains}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by company, contact, email, or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as "all" | "hosted" | "not-hosted")}
          title="Filter by hosting status"
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        >
          <option value="all">All Clients</option>
          <option value="hosted">With Hosting</option>
          <option value="not-hosted">No Hosting</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <span className="ml-3 text-gray-500">Loading hosting data for all clients...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Server size={48} className="mx-auto mb-3 opacity-40" />
          <p>No clients found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => (
            <div
              key={client.customerId}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Client header row */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => client.found && toggleExpand(client.customerId)}
              >
                <div className="flex-shrink-0">
                  {client.found ? (
                    expandedIds.has(client.customerId) ? (
                      <ChevronDown size={18} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={18} className="text-gray-400" />
                    )
                  ) : (
                    <div className="w-[18px]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {client.company}
                    </span>
                    {client.found ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Hosted
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                        No Plesk Account
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <User size={11} /> {client.contactPerson}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail size={11} /> {client.email}
                    </span>
                  </div>
                </div>

                {client.found && client.pleskCustomer && (
                  <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      <span className="text-gray-400">Login:</span>{" "}
                      <span className="text-gray-700 dark:text-gray-300">{client.pleskCustomer.login}</span>
                    </span>
                    <span>
                      <span className="text-gray-400">ID:</span>{" "}
                      <span className="text-gray-700 dark:text-gray-300">#{client.pleskCustomer.id}</span>
                    </span>
                    <span className="text-blue-600 font-medium">
                      {client.domains.length} domain{client.domains.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {client.found && client.sessionUrl && (
                  <a
                    href={client.sessionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition text-xs font-medium flex-shrink-0"
                  >
                    <LogIn size={13} />
                    Login to Plesk
                  </a>
                )}

                {!client.found && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAssignModal(client);
                    }}
                    className="flex items-center gap-1.5 bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition text-xs font-medium flex-shrink-0"
                  >
                    <Link size={13} />
                    Assign Hosting
                  </button>
                )}
              </div>

              {/* Expanded domains */}
              {client.found && expandedIds.has(client.customerId) && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {/* Plesk account info bar */}
                  {client.pleskCustomer && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-2 flex items-center gap-6 text-xs">
                      <span>
                        <span className="text-gray-400 uppercase font-semibold">Plesk Account</span>{" "}
                        <span className="text-gray-800 dark:text-gray-200 font-medium ml-1">{client.pleskCustomer.name}</span>
                      </span>
                      <span>
                        <span className="text-gray-400 uppercase font-semibold">Login</span>{" "}
                        <span className="text-gray-800 dark:text-gray-200 font-medium ml-1">{client.pleskCustomer.login}</span>
                      </span>
                      <span>
                        <span className="text-gray-400 uppercase font-semibold">ID</span>{" "}
                        <span className="text-gray-800 dark:text-gray-200 font-medium ml-1">#{client.pleskCustomer.id}</span>
                      </span>
                    </div>
                  )}

                  {client.domains.length === 0 ? (
                    <div className="px-6 py-4 text-sm text-gray-400 text-center">
                      No domains found for this account
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                          <th className="px-6 py-2">Domain</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2">Disk Usage</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.domains.map((d) => {
                          const usagePct = d.disk_usage != null && d.disk_limit != null && d.disk_limit > 0
                            ? Math.min(100, Math.round((d.disk_usage / d.disk_limit) * 100))
                            : null;
                          return (
                            <tr
                              key={d.id}
                              className="border-b border-gray-100 dark:border-gray-700/50"
                            >
                              <td className="px-6 py-2.5 text-gray-900 dark:text-white flex items-center gap-2">
                                <Globe size={14} className="text-blue-500 flex-shrink-0" />
                                {d.name}
                              </td>
                              <td className="px-4 py-2.5 capitalize text-gray-600 dark:text-gray-300">
                                {d.hosting_type || "Virtual"}
                              </td>
                              <td className="px-4 py-2.5">
                                {d.disk_usage != null ? (
                                  <div className="min-w-[120px]">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
                                      <HardDrive size={12} className="text-gray-400" />
                                      <span>{formatBytes(d.disk_usage)}</span>
                                      {d.disk_limit != null && d.disk_limit > 0 && (
                                        <span className="text-gray-400">/ {formatBytes(d.disk_limit)}</span>
                                      )}
                                    </div>
                                    {usagePct != null && (
                                      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all ${
                                            usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-yellow-500" : "bg-green-500"
                                          }`}
                                          style={{ width: `${usagePct}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[d.status?.toLowerCase()] || "bg-gray-100 text-gray-700"}`}
                                >
                                  {d.status || "Active"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`http://${d.name}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                                  >
                                    Visit <ExternalLink size={11} />
                                  </a>
                                  {d.status?.toLowerCase() === "active" ? (
                                    <button
                                      title="Suspend subscription"
                                      onClick={() => toggleDomainStatus(d.id, "active")}
                                      disabled={togglingDomains.has(d.id)}
                                      className="text-red-600 hover:text-red-800 text-xs flex items-center gap-1 disabled:opacity-50"
                                    >
                                      {togglingDomains.has(d.id) ? (
                                        <Loader2 size={11} className="animate-spin" />
                                      ) : (
                                        <PowerOff size={11} />
                                      )}
                                      Suspend
                                    </button>
                                  ) : (
                                    <button
                                      title="Activate subscription"
                                      onClick={() => toggleDomainStatus(d.id, "disabled")}
                                      disabled={togglingDomains.has(d.id)}
                                      className="text-green-600 hover:text-green-800 text-xs flex items-center gap-1 disabled:opacity-50"
                                    >
                                      {togglingDomains.has(d.id) ? (
                                        <Loader2 size={11} className="animate-spin" />
                                      ) : (
                                        <Power size={11} />
                                      )}
                                      Activate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign Modal */}
      {assignModalFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Assign Plesk Hosting
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Assign an unassigned Plesk account to{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {assignModalFor.company}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setAssignModalFor(null)}
                title="Close"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingUnassigned ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                  <span className="ml-2 text-gray-500 text-sm">Loading unassigned Plesk accounts...</span>
                </div>
              ) : unassignedClients.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Server size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No unassigned Plesk accounts found</p>
                  <p className="text-xs mt-1">All Plesk clients are already matched to a customer</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-3">
                    Select a Plesk account to assign. This will update the Plesk client&apos;s email to{" "}
                    <span className="font-medium">{assignModalFor.email}</span> so it matches this customer.
                  </p>
                  {unassignedClients.map((pc) => (
                    <div
                      key={pc.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {pc.name || pc.login}
                            </span>
                            <span className="text-xs text-gray-400">#{pc.id}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <User size={11} /> {pc.login}
                            </span>
                            <span className="flex items-center gap-1">
                              <Mail size={11} /> {pc.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Globe size={11} /> {pc.domains.length} domain{pc.domains.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {pc.domains.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {pc.domains.map((d) => (
                                <span
                                  key={d.id}
                                  className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                  {d.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => assignPleskClient(pc.id)}
                          disabled={assigning}
                          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50 flex-shrink-0 ml-4"
                        >
                          {assigning ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Link size={14} />
                          )}
                          Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
