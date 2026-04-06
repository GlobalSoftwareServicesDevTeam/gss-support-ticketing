"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

export default function TwoFactorPage() {
  useSession();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Setup flow
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify" | "backup" | "disable">("idle");
  const [qrCode, setQrCode] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableToken, setDisableToken] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/auth/2fa/status");
        const data = await res.json();
        setEnabled(data.enabled);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const startSetup = async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start setup");
        return;
      }
      setQrCode(data.qrCode);
      setManualSecret(data.secret);
      setSetupStep("qr");
    } finally {
      setActionLoading(false);
    }
  };

  const verifyAndEnable = async () => {
    if (verifyToken.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      setBackupCodes(data.backupCodes);
      setSetupStep("backup");
      setEnabled(true);
    } finally {
      setActionLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    if (disableToken.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: disableToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disable 2FA");
        return;
      }
      setEnabled(false);
      setSetupStep("idle");
      setDisableToken("");
    } finally {
      setActionLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Shield size={28} />
          Two-Factor Authentication
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Add an extra layer of security to your account using Google Authenticator or any TOTP app
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-slate-100 dark:bg-slate-700"}`}>
            {enabled ? (
              <ShieldCheck size={24} className="text-green-600 dark:text-green-400" />
            ) : (
              <ShieldOff size={24} className="text-slate-400" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {enabled ? "Two-Factor Authentication is enabled" : "Two-Factor Authentication is disabled"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {enabled
                ? "Your account is protected with an authenticator app. You will need to enter a code when signing in."
                : "Enable 2FA to add an extra layer of security. You will be asked for a code from your authenticator app each time you sign in."}
            </p>
            {setupStep === "idle" && (
              <div className="mt-4">
                {enabled ? (
                  <button
                    onClick={() => setSetupStep("disable")}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                  >
                    Disable 2FA
                  </button>
                ) : (
                  <button
                    onClick={startSetup}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
                    Set Up 2FA
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Setup Step 1: QR Code */}
      {setupStep === "qr" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Step 1: Scan QR Code
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Open Google Authenticator (or any TOTP app) and scan the QR code below.
          </p>

          <div className="flex flex-col items-center gap-4 mb-6">
            {qrCode && (
              <div className="bg-white p-4 rounded-xl shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="2FA QR Code" width={200} height={200} />
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">Or enter this code manually:</p>
              <code className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white tracking-wider select-all">
                {manualSecret}
              </code>
            </div>
          </div>

          <button
            onClick={() => setSetupStep("verify")}
            className="w-full px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* Setup Step 2: Verify Code */}
      {setupStep === "verify" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Step 2: Verify Code
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Enter the 6-digit code currently shown in your authenticator app to confirm setup.
          </p>

          <div className="max-w-xs mx-auto space-y-4">
            <input
              type="text"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-center text-2xl tracking-[0.5em] font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSetupStep("qr");
                  setVerifyToken("");
                  setError("");
                }}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm"
              >
                Back
              </button>
              <button
                onClick={verifyAndEnable}
                disabled={actionLoading || verifyToken.length !== 6}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm disabled:opacity-50"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                Verify & Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Step 3: Backup Codes */}
      {setupStep === "backup" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Step 3: Save Backup Codes
          </h3>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Save these backup codes in a safe place. Each code can only be used once. If you lose access to your authenticator app, these are the only way to recover your account.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto mb-4">
            {backupCodes.map((code, i) => (
              <div
                key={i}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-center font-mono text-sm text-slate-900 dark:text-white tracking-wider"
              >
                {code}
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={copyBackupCodes}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm"
            >
              {copiedBackup ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedBackup ? "Copied!" : "Copy Codes"}
            </button>
            <button
              onClick={() => {
                setSetupStep("idle");
                setBackupCodes([]);
                setVerifyToken("");
                setQrCode("");
                setManualSecret("");
              }}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Disable 2FA */}
      {setupStep === "disable" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            Disable Two-Factor Authentication
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Enter the current 6-digit code from your authenticator app to confirm disabling 2FA.
          </p>

          <div className="max-w-xs mx-auto space-y-4">
            <input
              type="text"
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-center text-2xl tracking-[0.5em] font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSetupStep("idle");
                  setDisableToken("");
                  setError("");
                }}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={disableTwoFactor}
                disabled={actionLoading || disableToken.length !== 6}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm disabled:opacity-50"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                Disable 2FA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
