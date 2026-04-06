"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Settings, Server, Mail, Inbox, TestTube, Loader2, CheckCircle2, XCircle, Save, RefreshCw, Eye, EyeOff, ShieldCheck } from "lucide-react";

type Tab = "plesk" | "smtp" | "imap" | "digicert";

interface PleskPlan {
  id: number;
  name: string;
  diskSpace: string;
  bandwidth: string;
  databases: string;
  emailAccounts: string;
  emailStorage: string;
  ftpAccounts: string;
  subdomains: string;
  sslSupport: boolean;
  phpSupport: boolean;
}

export default function SystemSettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("plesk");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [pleskPlans, setPleskPlans] = useState<PleskPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Settings state
  const [settings, setSettings] = useState<Record<string, string>>({
    PLESK_API_URL: "",
    PLESK_API_LOGIN: "",
    PLESK_API_PASSWORD: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_SECURE: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    SMTP_FROM_EMAIL: "",
    SMTP_FROM_NAME: "",
    IMAP_HOST: "",
    IMAP_PORT: "",
    IMAP_TLS: "",
    IMAP_USER: "",
    IMAP_PASSWORD: "",
    DIGICERT_API_KEY: "",
    DIGICERT_ORG_ID: "",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const load = async () => { await loadSettings(); };
      load();
    }
  }, [isAdmin, loadSettings]);

  async function handleSave(section: Tab) {
    setSaving(true);
    setTestResult(null);
    const keysBySection: Record<Tab, string[]> = {
      plesk: ["PLESK_API_URL", "PLESK_API_LOGIN", "PLESK_API_PASSWORD"],
      smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME"],
      imap: ["IMAP_HOST", "IMAP_PORT", "IMAP_TLS", "IMAP_USER", "IMAP_PASSWORD"],
      digicert: ["DIGICERT_API_KEY", "DIGICERT_ORG_ID"],
    };

    const payload: Record<string, string> = {};
    for (const key of keysBySection[section]) {
      if (settings[key]) payload[key] = settings[key];
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: `Settings saved: ${data.updated.join(", ")}` });
      } else {
        setTestResult({ success: false, message: data.error || "Failed to save" });
      }
    } catch {
      setTestResult({ success: false, message: "Failed to save settings" });
    }
    setSaving(false);
  }

  async function handleTestPlesk() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/plesk/plans", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    }
    setTesting(false);
  }

  async function handleTestSmtp() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const data = await res.json();
      setTestResult({ success: res.ok, message: data.message || data.error || "Test complete" });
    } catch {
      setTestResult({ success: false, message: "SMTP test failed" });
    }
    setTesting(false);
  }

  async function handleTestImap() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/poll", { method: "POST" });
      const data = await res.json();
      setTestResult({
        success: res.ok,
        message: res.ok ? `Success! Processed ${data.processed} email(s).` : (data.error || "Test failed"),
      });
    } catch {
      setTestResult({ success: false, message: "IMAP test failed" });
    }
    setTesting(false);
  }

  async function handleFetchPlans() {
    setLoadingPlans(true);
    try {
      const res = await fetch("/api/plesk/plans");
      if (res.ok) {
        const data = await res.json();
        setPleskPlans(data);
      }
    } catch { /* ignore */ }
    setLoadingPlans(false);
  }

  async function handleSyncPlans() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/hosting/products/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${data.total} plans: ${data.created} new, ${data.updated} updated. Go to Hosting Admin to set prices.`);
      } else {
        setSyncResult(`Sync failed: ${data.error}`);
      }
    } catch {
      setSyncResult("Sync failed");
    }
    setSyncing(false);
  }

  function updateSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function togglePassword(key: string) {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 dark:text-slate-400">Admin access required.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "plesk", label: "Plesk API", icon: <Server size={16} /> },
    { key: "smtp", label: "SMTP (Outgoing)", icon: <Mail size={16} /> },
    { key: "imap", label: "IMAP (Incoming)", icon: <Inbox size={16} /> },
    { key: "digicert", label: "DigiCert SSL", icon: <ShieldCheck size={16} /> },
  ];

  function renderInput(key: string, label: string, opts?: { type?: string; placeholder?: string; help?: string }) {
    const isSensitive = key.includes("PASSWORD") || key.includes("SECRET");
    const inputType = isSensitive ? (showPasswords[key] ? "text" : "password") : (opts?.type || "text");
    return (
      <div key={key}>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
        <div className="relative">
          <input
            type={inputType}
            value={settings[key] || ""}
            onChange={(e) => updateSetting(key, e.target.value)}
            placeholder={opts?.placeholder}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm pr-10"
            title={label}
          />
          {isSensitive && (
            <button
              type="button"
              onClick={() => togglePassword(key)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title={showPasswords[key] ? "Hide" : "Show"}
            >
              {showPasswords[key] ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {opts?.help && <p className="text-xs text-slate-400 mt-1">{opts.help}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setTestResult(null); }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-blue-500" size={24} />
        </div>
      ) : (
        <>
          {/* Test Result Banner */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${
              testResult.success
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}>
              {testResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {testResult.message}
            </div>
          )}

          {/* Plesk Tab */}
          {activeTab === "plesk" && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Plesk API Configuration</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Connect to your Plesk server to fetch hosting plans and auto-provision subscriptions.
                </p>
              </div>

              <div className="space-y-4">
                {renderInput("PLESK_API_URL", "Plesk API URL", { placeholder: "https://your-plesk-server:8443", help: "Base URL of your Plesk server with port" })}
                {renderInput("PLESK_API_LOGIN", "Admin Login", { placeholder: "admin" })}
                {renderInput("PLESK_API_PASSWORD", "Admin Password", { placeholder: "Enter password" })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSave("plesk")}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
                <button
                  onClick={handleTestPlesk}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
                  Test Connection
                </button>
              </div>

              {/* Plesk Plans Section */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-md font-semibold text-slate-900 dark:text-white">Service Plans from Plesk</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Fetch available plans and sync them as hosting products.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleFetchPlans}
                      disabled={loadingPlans}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                    >
                      {loadingPlans ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Fetch Plans
                    </button>
                    {pleskPlans.length > 0 && (
                      <button
                        onClick={handleSyncPlans}
                        disabled={syncing}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
                      >
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Sync to Products
                      </button>
                    )}
                  </div>
                </div>

                {syncResult && (
                  <div className="p-3 mb-4 rounded-lg text-sm bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                    {syncResult}
                  </div>
                )}

                {pleskPlans.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-gray-800">
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Plan Name</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Disk</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Bandwidth</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Databases</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Email</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Subdomains</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">SSL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pleskPlans.map((plan) => (
                          <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{plan.name}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{plan.diskSpace}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{plan.bandwidth}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{plan.databases}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{plan.emailAccounts}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{plan.subdomains}</td>
                            <td className="px-3 py-2">{plan.sslSupport ? <CheckCircle2 size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-400" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SMTP Tab */}
          {activeTab === "smtp" && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">SMTP Configuration (Outgoing Email)</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Configure the SMTP server used to send emails (ticket replies, notifications, quotes, etc.).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderInput("SMTP_HOST", "SMTP Host", { placeholder: "mail.example.com" })}
                {renderInput("SMTP_PORT", "SMTP Port", { placeholder: "587", help: "Common: 587 (TLS), 465 (SSL), 25 (unencrypted)" })}
                {renderInput("SMTP_SECURE", "SSL/TLS", { placeholder: "false", help: "Set to 'true' for port 465 (implicit TLS)" })}
                {renderInput("SMTP_USER", "Username", { placeholder: "support@example.com" })}
                {renderInput("SMTP_PASSWORD", "Password", { placeholder: "Enter password" })}
                {renderInput("SMTP_FROM_EMAIL", "From Email", { placeholder: "support@example.com" })}
                {renderInput("SMTP_FROM_NAME", "From Name", { placeholder: "GSS Support" })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSave("smtp")}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
                <button
                  onClick={handleTestSmtp}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
                  Test Connection
                </button>
              </div>
            </div>
          )}

          {/* IMAP Tab */}
          {activeTab === "imap" && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">IMAP Configuration (Incoming Email)</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Configure the IMAP server used to receive support emails and create tickets automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderInput("IMAP_HOST", "IMAP Host", { placeholder: "imap.example.com" })}
                {renderInput("IMAP_PORT", "IMAP Port", { placeholder: "993", help: "Default: 993 (SSL)" })}
                {renderInput("IMAP_TLS", "Use TLS", { placeholder: "true", help: "'true' or 'false'" })}
                {renderInput("IMAP_USER", "Username / Email", { placeholder: "support@example.com" })}
                {renderInput("IMAP_PASSWORD", "Password", { placeholder: "Enter password" })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSave("imap")}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
                <button
                  onClick={handleTestImap}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
                  Test Polling
                </button>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">How Email Ticketing Works</h3>
                <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Users send emails to your support email address</li>
                  <li>The system polls the inbox via IMAP and picks up unread emails</li>
                  <li>If the sender matches a registered user, the ticket is linked to their account</li>
                  <li>An auto-reply confirms the ticket with a unique ID like <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">[GSS-xxx]</code></li>
                  <li>Replies with the ticket ID are threaded as messages on the existing ticket</li>
                </ol>
              </div>
            </div>
          )}

          {/* DigiCert Tab */}
          {activeTab === "digicert" && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">DigiCert SSL Configuration</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Configure DigiCert API credentials to issue SSL certificates. Get your API key from{" "}
                  <a href="https://www.digicert.com/account/api-keys/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    DigiCert CertCentral
                  </a>.
                </p>
              </div>

              <div className="space-y-4">
                {renderInput("DIGICERT_API_KEY", "API Key", { placeholder: "Enter DigiCert API key" })}
                {renderInput("DIGICERT_ORG_ID", "Organization ID", { placeholder: "123456", help: "Required for OV/EV certificates. Find it in CertCentral > Organizations." })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSave("digicert")}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">How SSL Certificate Issuing Works</h3>
                <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Admin creates an SSL certificate order for a customer domain</li>
                  <li>Customer pays via PayFast, Ozow, or EFT</li>
                  <li>After payment, the certificate is automatically submitted to DigiCert</li>
                  <li>Domain validation (DNS or Email) must be completed</li>
                  <li>Once validated, DigiCert issues the certificate</li>
                  <li>Admin or customer can download the certificate files</li>
                </ol>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
