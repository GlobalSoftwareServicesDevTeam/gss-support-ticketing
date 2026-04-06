"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, Check, ArrowLeft, ArrowRight } from "lucide-react";

interface InviteInfo {
  email: string;
  firstName: string;
  lastName: string;
}

const LEGAL_DOCUMENT = `
TERMS AND CONDITIONS OF SERVICE

Global Software Services (Pty) Ltd — Terms of Use

Last updated: April 2026

1. ACCEPTANCE OF TERMS
By accessing and using the GSS Support Portal, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, do not use this service.

2. ACCOUNT RESPONSIBILITY
You are responsible for maintaining the confidentiality of your account credentials. You agree to notify GSS immediately of any unauthorized use of your account.

3. SERVICE DESCRIPTION
The GSS Support Portal provides project management, support ticketing, document sharing, invoicing, and payment services. GSS reserves the right to modify or discontinue any feature of the service at any time.

4. ACCEPTABLE USE
You agree not to:
- Use the service for any unlawful purpose
- Upload malicious code or content
- Attempt to gain unauthorized access to any part of the service
- Share your account credentials with third parties

5. INTELLECTUAL PROPERTY
All content, features, and functionality of the GSS Support Portal are owned by Global Software Services (Pty) Ltd and are protected by copyright, trademark, and other intellectual property laws.

6. CONFIDENTIALITY
All project information, documents, and communications shared through the portal are confidential. You agree not to disclose any such information to third parties without prior written consent.

7. DATA PROTECTION
GSS collects and processes personal data in accordance with the Protection of Personal Information Act (POPIA). By using this service, you consent to the collection and processing of your personal information as described in our Privacy Policy.

8. PAYMENT TERMS
Where applicable, payments for services are due as specified in the relevant invoice. Late payments may incur interest at the prescribed rate.

9. LIMITATION OF LIABILITY
GSS shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.

10. TERMINATION
GSS reserves the right to suspend or terminate your account at any time for violation of these terms or for any other reason deemed necessary.

11. GOVERNING LAW
These terms shall be governed by and construed in accordance with the laws of the Republic of South Africa.

12. CONTACT
For any questions regarding these terms, please contact: support@globalsoftwareservices.co.za
`.trim();

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1); // 1: loading, 2: account setup, 3: company info, 4: legal
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Form state
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    company: "",
    companyRegNo: "",
    companyVatNo: "",
    companyAddress: "",
    position: "",
    legalAccepted: false,
  });

  const tokenError = useMemo(() => {
    if (!token) return "No invitation token provided.";
    return "";
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/users/invite/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setInviteInfo(data);
          setStep(2);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to validate invitation");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (form.password !== form.confirmPassword) {
      setSubmitError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setSubmitError("Password must be at least 6 characters");
      return;
    }
    if (!form.legalAccepted) {
      setSubmitError("You must accept the terms and conditions");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/users/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        username: form.username,
        password: form.password,
        phoneNumber: form.phoneNumber || undefined,
        company: form.company || undefined,
        companyRegNo: form.companyRegNo || undefined,
        companyVatNo: form.companyVatNo || undefined,
        companyAddress: form.companyAddress || undefined,
        position: form.position || undefined,
        legalAccepted: form.legalAccepted,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(data.error || "Failed to complete setup");
      return;
    }

    router.push("/login?verified=true");
  }

  if (loading && !tokenError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (error || tokenError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg text-center">
          <AlertTriangle size={40} className="mx-auto mb-4 text-amber-500" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invitation Error</h1>
          <p className="text-slate-600 mb-6">{error || tokenError}</p>
          <a href="/login" className="text-blue-600 hover:underline">Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-8 py-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Global Software Services" className="h-10 w-auto brightness-0 invert" />
            <h1 className="text-xl font-bold">Support Portal</h1>
          </div>
          <p className="text-blue-200 text-sm mt-1">
            {inviteInfo?.firstName} {inviteInfo?.lastName} — {inviteInfo?.email}
          </p>
        </div>

        {/* Progress steps */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            {["Account Setup", "Company Info", "Terms & Sign"].map((label, i) => {
              const stepNum = i + 2;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isDone ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {isDone ? <Check size={14} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? "text-blue-700" : isDone ? "text-green-700" : "text-slate-400"}`}>{label}</span>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 ${isDone ? "bg-green-400" : "bg-slate-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          {submitError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {submitError}
            </div>
          )}

          {/* Step 2: Account Setup */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Create Your Account</h2>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Choose a username"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Repeat password"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  placeholder="e.g. +27 82 123 4567"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!form.username || !form.password || !form.confirmPassword) {
                      setSubmitError("Username and password are required");
                      return;
                    }
                    if (form.password !== form.confirmPassword) {
                      setSubmitError("Passwords do not match");
                      return;
                    }
                    setSubmitError("");
                    setStep(3);
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Next: Company Info <ArrowRight size={14} className="inline" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Company Information */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Company Information</h2>
              <p className="text-sm text-slate-500 mb-4">Tell us about your company. Fields marked with * are optional but recommended.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Company name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your Position / Title</label>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    placeholder="e.g. Project Manager"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Registration Number</label>
                  <input
                    type="text"
                    value={form.companyRegNo}
                    onChange={(e) => setForm({ ...form, companyRegNo: e.target.value })}
                    placeholder="e.g. 2024/123456/07"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">VAT Number</label>
                  <input
                    type="text"
                    value={form.companyVatNo}
                    onChange={(e) => setForm({ ...form, companyVatNo: e.target.value })}
                    placeholder="e.g. 4123456789"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Address</label>
                <textarea
                  value={form.companyAddress}
                  onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
                  placeholder="Full physical or postal address"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div className="pt-2 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium"
                >
                  <ArrowLeft size={14} className="inline" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Next: Review & Sign <ArrowRight size={14} className="inline" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Legal Document */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Terms & Conditions</h2>
              <p className="text-sm text-slate-500">Please read the following terms carefully before proceeding.</p>

              <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 max-h-72 overflow-y-auto">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {LEGAL_DOCUMENT}
                </pre>
              </div>

              <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg bg-white cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={form.legalAccepted}
                  onChange={(e) => setForm({ ...form, legalAccepted: e.target.checked })}
                  className="mt-0.5 h-5 w-5 text-blue-600 rounded border-slate-300"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">
                    I have read and agree to the Terms and Conditions of Service
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    By checking this box, you are electronically signing this agreement as{" "}
                    <strong>{inviteInfo?.firstName} {inviteInfo?.lastName}</strong> on{" "}
                    <strong>{new Date().toLocaleDateString("en-ZA")}</strong>.
                  </p>
                </div>
              </label>

              <div className="pt-2 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium"
                >
                  <ArrowLeft size={14} className="inline" /> Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.legalAccepted}
                  className="px-8 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
                >
                  {submitting ? "Setting up account..." : "Complete Setup & Sign"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
