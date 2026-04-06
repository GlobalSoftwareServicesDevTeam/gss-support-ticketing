"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, LogIn, Eye, EyeOff, Shield } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpToken, setTotpToken] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  const verified = searchParams.get("verified");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // First check if 2FA is required
      if (!needs2FA) {
        const checkRes = await fetch("/api/auth/2fa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const checkData = await checkRes.json();

        if (!checkRes.ok) {
          setError(checkData.error || "Invalid credentials or email not verified.");
          setLoading(false);
          return;
        }

        if (checkData.requires2FA) {
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
      } else {
        // Verify 2FA token before signing in
        const verifyRes = await fetch("/api/auth/2fa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            totpToken: useBackupCode ? undefined : totpToken,
            backupCode: useBackupCode ? backupCode : undefined,
          }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          setError(verifyData.error || "Invalid authentication code.");
          setLoading(false);
          return;
        }
      }

      // Proceed with NextAuth sign-in
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid credentials or email not verified.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    }

    setLoading(false);
  }

  function handleBack() {
    setNeeds2FA(false);
    setTotpToken("");
    setBackupCode("");
    setUseBackupCode(false);
    setError("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-700/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] bg-brand-400/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Brand Header */}
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Global Software Services" width={160} height={80} className="mx-auto h-20 w-auto mb-4" priority />
          <h1 className="text-2xl font-bold text-white">Support Portal</h1>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/20 border border-gray-200 dark:border-gray-800 p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to your account to continue</p>

          {verified === "true" && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
              Email verified successfully! You can now sign in.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!needs2FA ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username or email"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-4 py-2.5 pr-11 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <div className="mx-auto w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center mb-3">
                    <Shield size={24} className="text-brand-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {useBackupCode
                      ? "Enter one of your backup codes"
                      : "Enter the 6-digit code from your authenticator app"}
                  </p>
                </div>

                {!useBackupCode ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Authentication Code
                    </label>
                    <input
                      type="text"
                      value={totpToken}
                      onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition text-gray-900 dark:text-white text-center text-lg tracking-[0.5em] font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Backup Code
                    </label>
                    <input
                      type="text"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                      placeholder="XXXXXXXX"
                      maxLength={8}
                      autoFocus
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition text-gray-900 dark:text-white text-center text-lg tracking-[0.3em] font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      required
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
                  >
                    &larr; Back to login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(!useBackupCode);
                      setTotpToken("");
                      setBackupCode("");
                      setError("");
                    }}
                    className="text-xs text-brand-500 hover:text-brand-600 transition"
                  >
                    {useBackupCode ? "Use authenticator app" : "Use a backup code"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 text-white py-2.5 rounded-lg font-medium hover:bg-brand-600 focus:ring-4 focus:ring-brand-500/20 transition shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            {/* Social Login Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-gray-900 px-3 text-gray-500 dark:text-gray-400">or continue with</span>
              </div>
            </div>

            {/* Social Login Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => signIn("facebook", { callbackUrl: "/dashboard" })}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </button>
              <button
                type="button"
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-brand-500 hover:text-brand-600 hover:underline font-medium transition">
                Register
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          &copy; {new Date().getFullYear()} Global Software Services. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
