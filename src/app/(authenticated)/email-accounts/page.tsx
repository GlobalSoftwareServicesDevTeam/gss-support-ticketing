"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Mail,
  Plus,
  Trash2,
  Key,
  Loader2,
  Search,
  ExternalLink,
  Globe,
  Eye,
  EyeOff,
  HardDrive,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Shield,
  Inbox,
  X,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";

interface Domain {
  id: number;
  name: string;
  status: string;
}

interface MailAccount {
  name: string;
  domain: string;
  email: string;
  mailbox: boolean;
  enabled: boolean;
  aliases: string[];
  autoresponder: boolean;
  mailboxQuota: number;
  mailboxUsage: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export default function EmailAccountsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [webmailUrl, setWebmailUrl] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createQuota, setCreateQuota] = useState("");
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [creating, setCreating] = useState(false);

  // Password reset modal
  const [resetTarget, setResetTarget] = useState<MailAccount | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<MailAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle state
  const [togglingAccounts, setTogglingAccounts] = useState<Set<string>>(new Set());

  // Copied state
  const [copiedEmail, setCopiedEmail] = useState("");

  // Plesk login (for non-admin webmail session)
  const [pleskLogin, setPleskLogin] = useState("");

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/hosting/mail/domains");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load domains");
        return;
      }
      const data = await res.json();
      setDomains(data.domains || []);
      if (data.pleskLogin) setPleskLogin(data.pleskLogin);
      if (data.domains?.length > 0 && !selectedDomain) {
        setSelectedDomain(data.domains[0].name);
      }
    } catch {
      setError("Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, [selectedDomain]);

  const fetchAccounts = useCallback(async (domain: string) => {
    if (!domain) return;
    setLoadingAccounts(true);
    setError("");
    try {
      const res = await fetch(`/api/hosting/mail?domain=${encodeURIComponent(domain)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load email accounts");
        setAccounts([]);
        return;
      }
      const data = await res.json();
      setAccounts(data.accounts || []);
      setWebmailUrl(data.webmailUrl || "");
    } catch {
      setError("Failed to load email accounts");
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (selectedDomain) {
      fetchAccounts(selectedDomain);
    }
  }, [selectedDomain, fetchAccounts]);

  const handleCreate = async () => {
    if (!createName || !createPassword) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/hosting/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedDomain,
          name: createName,
          password: createPassword,
          quota: createQuota || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create email account");
        return;
      }
      setShowCreate(false);
      setCreateName("");
      setCreatePassword("");
      setCreateQuota("");
      fetchAccounts(selectedDomain);
    } catch {
      setError("Failed to create email account");
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword) return;
    setResetting(true);
    setError("");
    try {
      const res = await fetch("/api/hosting/mail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: resetTarget.domain,
          name: resetTarget.name,
          password: resetPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to reset password");
        return;
      }
      setResetTarget(null);
      setResetPassword("");
    } catch {
      setError("Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/hosting/mail?domain=${encodeURIComponent(deleteTarget.domain)}&name=${encodeURIComponent(deleteTarget.name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete email account");
        return;
      }
      setDeleteTarget(null);
      fetchAccounts(selectedDomain);
    } catch {
      setError("Failed to delete email account");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (account: MailAccount) => {
    setTogglingAccounts((prev) => new Set(prev).add(account.email));
    try {
      const res = await fetch("/api/hosting/mail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: account.domain,
          name: account.name,
          enabled: !account.enabled,
        }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) => (a.email === account.email ? { ...a, enabled: !a.enabled } : a))
        );
      }
    } finally {
      setTogglingAccounts((prev) => {
        const next = new Set(prev);
        next.delete(account.email);
        return next;
      });
    }
  };

  const handleOpenWebmail = (domain: string) => {
    window.open(`https://webmail.${domain}`, "_blank");
  };

  const handleOpenPleskMail = async () => {
    if (!pleskLogin) return;
    try {
      const res = await fetch("/api/hosting/mail/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pleskLogin }),
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, "_blank");
      }
    } catch {
      // fallback to webmail
      if (selectedDomain) handleOpenWebmail(selectedDomain);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(""), 2000);
  };

  const filteredAccounts = accounts.filter(
    (a) =>
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="w-7 h-7" />
            Email Accounts
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage email accounts, passwords, and access webmail
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDomain && (
            <>
              <button
                onClick={() => handleOpenWebmail(selectedDomain)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Inbox className="w-4 h-4" />
                Open Webmail
                <ExternalLink className="w-3 h-3" />
              </button>
              {pleskLogin && (
                <button
                  onClick={handleOpenPleskMail}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                >
                  <Shield className="w-4 h-4" />
                  Plesk Mail
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      {/* Domain Selector */}
      {domains.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Globe className="w-4 h-4" />
              Domain:
            </div>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} {d.status !== "active" ? `(${d.status})` : ""}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => fetchAccounts(selectedDomain)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  New Account
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Globe className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">No Domains Found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin
              ? "No hosting domains configured in Plesk. Set up hosting first."
              : "Your account doesn't have any hosted domains with email services."}
          </p>
        </div>
      )}

      {/* Search & Account count */}
      {selectedDomain && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search email accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Accounts List */}
      {loadingAccounts ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-500 dark:text-gray-400">Loading email accounts...</span>
        </div>
      ) : selectedDomain && filteredAccounts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Mail className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">
            {search ? "No matching accounts" : "No Email Accounts"}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {search
              ? "Try a different search term."
              : `No email accounts found for ${selectedDomain}. Create one to get started.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAccounts.map((account) => (
            <div
              key={account.email}
              className={`bg-white dark:bg-gray-800 rounded-xl border ${
                account.enabled
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-red-200 dark:border-red-900 opacity-70"
              } p-4 hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      account.enabled
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                    }`}
                  >
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white truncate">
                        {account.email}
                      </span>
                      <button
                        onClick={() => handleCopyEmail(account.email)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Copy email"
                      >
                        {copiedEmail === account.email ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {!account.enabled && (
                        <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded font-medium">
                          Disabled
                        </span>
                      )}
                      {account.mailbox && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatBytes(account.mailboxUsage)}
                          {account.mailboxQuota > 0 && ` / ${formatBytes(account.mailboxQuota)}`}
                        </span>
                      )}
                      {account.autoresponder && (
                        <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 rounded">
                          Auto-reply
                        </span>
                      )}
                      {account.aliases.length > 0 && (
                        <span className="text-gray-400">
                          +{account.aliases.length} alias{account.aliases.length > 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Webmail link */}
                  <button
                    onClick={() => handleOpenWebmail(account.domain)}
                    className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400"
                    title={`Open webmail for ${account.domain}`}
                  >
                    <Inbox className="w-4 h-4" />
                  </button>

                  {isAdmin && (
                    <>
                      {/* Toggle enable/disable */}
                      <button
                        onClick={() => handleToggle(account)}
                        disabled={togglingAccounts.has(account.email)}
                        className={`p-2 rounded-lg ${
                          account.enabled
                            ? "hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
                            : "hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400"
                        } disabled:opacity-50`}
                        title={account.enabled ? "Disable account" : "Enable account"}
                      >
                        {togglingAccounts.has(account.email) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : account.enabled ? (
                          <ToggleRight className="w-4 h-4" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                      </button>

                      {/* Reset password */}
                      <button
                        onClick={() => setResetTarget(account)}
                        className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400"
                        title="Reset password"
                      >
                        <Key className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteTarget(account)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-500 dark:text-red-400"
                        title="Delete account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Storage bar */}
              {account.mailbox && account.mailboxQuota > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Storage Used</span>
                    <span>
                      {formatBytes(account.mailboxUsage)} / {formatBytes(account.mailboxQuota)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        account.mailboxUsage / account.mailboxQuota > 0.9
                          ? "bg-red-500"
                          : account.mailboxUsage / account.mailboxQuota > 0.7
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      }`}
                      style={{
                        width: `${Math.min(100, (account.mailboxUsage / account.mailboxQuota) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- Create Modal ---- */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create Email Account
              </h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    placeholder="username"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    @{selectedDomain}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showCreatePw ? "text" : "password"}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="At least 5 characters"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePw(!showCreatePw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCreatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Mailbox Quota (MB) <span className="text-gray-400 font-normal">- optional, 0 = unlimited</span>
                </label>
                <input
                  type="number"
                  value={createQuota}
                  onChange={(e) => setCreateQuota(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createName || !createPassword || createPassword.length < 5}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create {createName ? `${createName}@${selectedDomain}` : "Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Reset Password Modal ---- */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Reset Password
              </h2>
              <button onClick={() => setResetTarget(null)}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Reset password for <strong>{resetTarget.email}</strong>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showResetPw ? "text" : "password"}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="At least 5 characters"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPw(!showResetPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting || !resetPassword || resetPassword.length < 5}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50"
              >
                {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Delete Confirm Modal ---- */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Delete Email Account
              </h2>
              <button onClick={() => setDeleteTarget(null)}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to permanently delete{" "}
                <strong className="text-red-600 dark:text-red-400">{deleteTarget.email}</strong>?
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                This will delete all emails in the mailbox. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webmail & Settings Info */}
      {selectedDomain && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            Email Client Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                Incoming Mail (IMAP)
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Server:</span>
                  <span className="font-mono text-gray-900 dark:text-white">mail.{selectedDomain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Port:</span>
                  <span className="font-mono text-gray-900 dark:text-white">993 (SSL/TLS)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Username:</span>
                  <span className="font-mono text-gray-900 dark:text-white">your@{selectedDomain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Security:</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">SSL/TLS</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                Outgoing Mail (SMTP)
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Server:</span>
                  <span className="font-mono text-gray-900 dark:text-white">mail.{selectedDomain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Port:</span>
                  <span className="font-mono text-gray-900 dark:text-white">465 (SSL/TLS)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Username:</span>
                  <span className="font-mono text-gray-900 dark:text-white">your@{selectedDomain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Security:</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">SSL/TLS</span>
                </div>
              </div>
            </div>
          </div>
          {webmailUrl && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Webmail URL: </span>
                  <a
                    href={webmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {webmailUrl} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
