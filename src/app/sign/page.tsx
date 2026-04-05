"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignaturePad from "@/components/signature-pad";
import { CheckCircle2, AlertCircle, FileText, PenLine, Loader2 } from "lucide-react";

interface SigningData {
  id: string;
  documentName: string;
  status: string;
  role: "signer" | "witness" | "admin";
  signerName: string;
  witnessName: string | null;
  signerSignature: string | null;
  signerSignedAt: string | null;
  witnessSignature: string | null;
  witnessSignedAt: string | null;
  adminSignature: string | null;
  adminSignedAt: string | null;
  documentPreview: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  signer: "Signer",
  witness: "Witness",
  admin: "Admin / Countersigner",
};

function SignPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<SigningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing signing token. Please use the link from your email.");
      setLoading(false);
      return;
    }
    fetch(`/api/signing/sign?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Invalid or expired signing link");
        }
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    if (!signature || !token) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/signing/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signature }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to submit signature");
      }
      setSuccess(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Check if the current role has already signed
  function hasAlreadySigned(): boolean {
    if (!data) return false;
    if (data.role === "signer" && data.signerSignedAt) return true;
    if (data.role === "witness" && data.witnessSignedAt) return true;
    if (data.role === "admin" && data.adminSignedAt) return true;
    return false;
  }

  // Check if it's this role's turn
  function isMyTurn(): boolean {
    if (!data) return false;
    if (data.role === "signer" && data.status === "PENDING_SIGNER") return true;
    if (data.role === "witness" && data.status === "PENDING_WITNESS") return true;
    if (data.role === "admin" && data.status === "PENDING_ADMIN") return true;
    return false;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-slate-500">Loading signing request...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-3 text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Signature Submitted!</h2>
          <p className="mt-2 text-sm text-slate-500">
            {data?.role === "signer"
              ? "Thank you for signing. The witness will be notified to add their signature next."
              : data?.role === "witness"
              ? "Thank you for witnessing. The admin will be notified to countersign."
              : "All signatures have been collected. The document is now fully signed."}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const alreadySigned = hasAlreadySigned();
  const myTurn = isMyTurn();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{data.documentName}</h1>
              <p className="text-xs text-slate-500">
                You are signing as: <span className="font-medium text-slate-700">{ROLE_LABELS[data.role]}</span>
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 text-xs">
            <div className={`flex-1 h-2 rounded-full ${data.signerSignedAt ? "bg-green-400" : data.status === "PENDING_SIGNER" ? "bg-yellow-300" : "bg-slate-200"}`} />
            <div className={`flex-1 h-2 rounded-full ${data.witnessSignedAt ? "bg-green-400" : data.status === "PENDING_WITNESS" ? "bg-purple-300" : "bg-slate-200"}`} />
            <div className={`flex-1 h-2 rounded-full ${data.adminSignedAt ? "bg-green-400" : data.status === "PENDING_ADMIN" ? "bg-blue-300" : "bg-slate-200"}`} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Signer</span>
            <span>Witness</span>
            <span>Admin</span>
          </div>
        </div>

        {/* Already collected signatures */}
        {data.signerSignedAt && data.role !== "signer" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Signer: {data.signerName} — Signed {new Date(data.signerSignedAt).toLocaleDateString()}
            </p>
            {data.signerSignature && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={data.signerSignature} alt="Signer signature" className="max-h-20 border border-slate-100 rounded" />
            )}
          </div>
        )}
        {data.witnessSignedAt && data.role === "admin" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Witness: {data.witnessName} — Signed {new Date(data.witnessSignedAt).toLocaleDateString()}
            </p>
            {data.witnessSignature && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={data.witnessSignature} alt="Witness signature" className="max-h-20 border border-slate-100 rounded" />
            )}
          </div>
        )}

        {/* Sign section */}
        {alreadySigned ? (
          <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
            <p className="mt-2 text-sm font-medium text-green-700">You have already signed this document.</p>
          </div>
        ) : !myTurn ? (
          <div className="bg-white rounded-xl shadow-sm border border-yellow-200 p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-yellow-500" />
            <p className="mt-2 text-sm font-medium text-yellow-700">It&apos;s not your turn to sign yet.</p>
            <p className="text-xs text-slate-500 mt-1">You&apos;ll receive an email when it&apos;s time.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <PenLine size={16} /> Sign Below
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Draw your signature in the box below. Click &quot;Clear&quot; to start over.
            </p>

            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{error}</div>
            )}

            <div className="flex justify-center">
              <SignaturePad
                onSignature={(dataUrl) => setSignature(dataUrl)}
                width={500}
                height={200}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!signature || submitting}
                className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit Signature"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SignPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <SignPageContent />
    </Suspense>
  );
}
