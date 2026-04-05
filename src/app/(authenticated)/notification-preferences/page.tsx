"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

interface Pref {
  id: string;
  channel: string;
  category: string;
  enabled: boolean;
  userId: string;
}

const CATEGORIES = ["TICKETS", "INVOICES", "PAYMENTS", "PROJECTS", "HOSTING", "MAINTENANCE", "GENERAL"];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((data) => {
        setPrefs(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  function isEnabled(category: string) {
    const pref = prefs.find((p) => p.channel === "EMAIL" && p.category === category);
    return pref ? pref.enabled : true;
  }

  function toggle(category: string) {
    const current = isEnabled(category);
    setPrefs((prev) => {
      const existing = prev.find((p) => p.channel === "EMAIL" && p.category === category);
      if (existing) {
        return prev.map((p) => p.id === existing.id ? { ...p, enabled: !current } : p);
      }
      return [...prev, { id: `new-${category}`, channel: "EMAIL", category, enabled: !current, userId: "" }];
    });
  }

  async function handleSave() {
    setSaving(true);
    const preferences = CATEGORIES.map((cat) => ({
      channel: "EMAIL",
      category: cat,
      enabled: isEnabled(cat),
    }));
    const res = await fetch("/api/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setPrefs(data);
      setMsg("Preferences saved successfully");
    } else {
      setMsg("Failed to save preferences");
    }
    setTimeout(() => setMsg(""), 4000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Bell size={28} className="text-brand-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h1>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          msg.includes("failed") || msg.includes("Failed")
            ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
            : "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
        }`}>
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Choose which email notifications you want to receive. Changes apply immediately after saving.
        </p>

        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{cat.toLowerCase().replace(/_/g, " ")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {cat === "TICKETS" && "New tickets, replies, and status changes"}
                  {cat === "INVOICES" && "Invoice created, sent, and payment reminders"}
                  {cat === "PAYMENTS" && "Payment confirmations and receipts"}
                  {cat === "PROJECTS" && "Project updates and milestones"}
                  {cat === "HOSTING" && "Hosting provisioning and renewal notices"}
                  {cat === "MAINTENANCE" && "Scheduled maintenance and downtime alerts"}
                  {cat === "GENERAL" && "General announcements and communications"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(cat)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isEnabled(cat) ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isEnabled(cat) ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition disabled:opacity-50">
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
