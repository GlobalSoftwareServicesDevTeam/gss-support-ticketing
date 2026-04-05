"use client";

import { useState } from "react";

export default function EmailSettingsPage() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleTestPoll() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/poll", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult(`Success! Processed ${data.processed} email(s).${data.errors?.length ? ` Errors: ${data.errors.join(", ")}` : ""}`);
      } else {
        setTestResult(`Error: ${data.error}`);
      }
    } catch {
      setTestResult("Failed to connect to email polling endpoint.");
    }
    setTesting(false);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Email Settings</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Email Ticketing Configuration</h2>
          <p className="text-sm text-slate-500 mb-4">
            Configure your email server settings in the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">.env</code> file.
            When users send emails to your support address, tickets will be automatically created and assigned.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-2">IMAP Settings (Receiving)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Host:</span>
                <span className="ml-2 text-slate-700">{process.env.NEXT_PUBLIC_IMAP_HOST || "Set IMAP_HOST in .env"}</span>
              </div>
              <div>
                <span className="text-slate-400">Port:</span>
                <span className="ml-2 text-slate-700">{process.env.NEXT_PUBLIC_IMAP_PORT || "993"}</span>
              </div>
              <div>
                <span className="text-slate-400">User:</span>
                <span className="ml-2 text-slate-700">{process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "Set IMAP_USER in .env"}</span>
              </div>
              <div>
                <span className="text-slate-400">TLS:</span>
                <span className="ml-2 text-slate-700">Enabled</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-2">SMTP Settings (Sending)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Host:</span>
                <span className="ml-2 text-slate-700">{process.env.NEXT_PUBLIC_SMTP_HOST || "Set SMTP_HOST in .env"}</span>
              </div>
              <div>
                <span className="text-slate-400">Port:</span>
                <span className="ml-2 text-slate-700">{process.env.NEXT_PUBLIC_SMTP_PORT || "587"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium text-slate-700 mb-2">How It Works</h3>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
            <li>A user sends an email to your support email address</li>
            <li>The system polls the inbox via IMAP and picks up unread emails</li>
            <li>If the sender&apos;s email matches a registered user, the ticket is linked to their account</li>
            <li>If the sender is new, a customer record is created automatically</li>
            <li>An auto-reply is sent confirming the ticket with a unique ID</li>
            <li>Replies containing the ticket ID <code className="bg-slate-100 px-1 rounded">[GSS-xxx]</code> are threaded as messages on the existing ticket</li>
          </ol>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Test Email Polling</h3>
          <button
            onClick={handleTestPoll}
            disabled={testing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {testing ? "Polling..." : "Poll Inbox Now"}
          </button>
          {testResult && (
            <p className={`mt-3 text-sm ${testResult.startsWith("Success") ? "text-green-600" : "text-red-600"}`}>
              {testResult}
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium text-slate-700 mb-2">Automated Polling (Cron)</h3>
          <p className="text-sm text-slate-500 mb-2">
            For automated email polling, set up a cron job to call:
          </p>
          <code className="block bg-slate-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto">
            GET /api/cron/email-poll<br />
            Authorization: Bearer YOUR_AUTH_SECRET
          </code>
          <p className="text-sm text-slate-400 mt-2">
            The Authorization header must contain your <code className="bg-slate-100 px-1 rounded text-slate-600">AUTH_SECRET</code> from the .env file.
          </p>
        </div>
      </div>
    </div>
  );
}
