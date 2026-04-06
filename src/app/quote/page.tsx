"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignaturePad from "@/components/signature-pad";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Loader2,
  Clock,
} from "lucide-react";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface QuoteData {
  id: string;
  quoteNo: string;
  title: string;
  description: string | null;
  lineItems: string | null;
  amount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  validUntil: string | null;
  notes: string | null;
  quoteStatus: string;
  clientName: string | null;
  clientEmail: string | null;
  clientCompany: string | null;
  clientSignature: string | null;
  clientSignedAt: string | null;
  clientSignedName: string | null;
  declineReason: string | null;
  createdAt: string;
  customer: { company: string } | null;
  project: { projectName: string } | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ACCEPTED: { label: "Accepted", color: "text-green-600", icon: <CheckCircle2 size={20} /> },
  DECLINED: { label: "Declined", color: "text-red-600", icon: <XCircle size={20} /> },
  EXPIRED: { label: "Expired", color: "text-orange-600", icon: <Clock size={20} /> },
};

function QuotePageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing quote token. Please use the link from your email.");
      setLoading(false);
      return;
    }
    fetch(`/api/quotes/respond?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Invalid or expired quote link");
        }
        return res.json();
      })
      .then((d) => {
        setQuote(d);
        setSignedName(d.clientName || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!signature || !token || !signedName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/quotes/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "accept", signature, signedName: signedName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to accept quote");
      }
      setResult("accepted");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!token) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/quotes/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "decline", declineReason: declineReason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to decline quote");
      }
      setResult("declined");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function formatCurrency(val: number | null) {
    if (val == null) return "R0.00";
    return `R${Number(val).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const parsedItems: LineItem[] = quote?.lineItems ? JSON.parse(quote.lineItems) : [];
  const isRespondable = quote && ["SENT", "VIEWED"].includes(quote.quoteStatus);
  const hasResponded = quote && (quote.quoteStatus === "ACCEPTED" || quote.quoteStatus === "DECLINED");
  const isExpired = quote?.validUntil && new Date(quote.validUntil) < new Date() && !hasResponded;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-slate-500">Loading quote...</p>
        </div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-md mx-4">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Quote Not Found</h2>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-md mx-4">
          {result === "accepted" ? (
            <>
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <h2 className="text-xl font-bold text-slate-900 mb-2">Quote Accepted</h2>
              <p className="text-slate-500">Thank you! Your acceptance and signature have been recorded. We will be in touch shortly.</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-16 w-16 text-red-400 mb-4" />
              <h2 className="text-xl font-bold text-slate-900 mb-2">Quote Declined</h2>
              <p className="text-slate-500">Your response has been recorded. If you change your mind, please contact us.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!quote) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="bg-blue-600 text-white px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Quote</p>
                <h1 className="text-2xl font-bold">{quote.quoteNo}</h1>
              </div>
              <FileText size={36} className="text-blue-200" />
            </div>
          </div>
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{quote.title}</h2>
            {quote.description && (
              <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{quote.description}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
              {quote.customer && <span>Company: <strong className="text-slate-700">{quote.customer.company}</strong></span>}
              {quote.project && <span>Project: <strong className="text-slate-700">{quote.project.projectName}</strong></span>}
              <span>Date: <strong className="text-slate-700">{new Date(quote.createdAt).toLocaleDateString("en-ZA")}</strong></span>
              {quote.validUntil && (
                <span>Valid Until: <strong className={`${isExpired ? "text-red-600" : "text-slate-700"}`}>
                  {new Date(quote.validUntil).toLocaleDateString("en-ZA")}
                </strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Status banner if already responded */}
        {hasResponded && (
          <div className={`rounded-xl border p-4 mb-6 flex items-center gap-3 ${
            quote.quoteStatus === "ACCEPTED"
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}>
            <span className={STATUS_INFO[quote.quoteStatus]?.color}>{STATUS_INFO[quote.quoteStatus]?.icon}</span>
            <div>
              <p className={`font-semibold ${STATUS_INFO[quote.quoteStatus]?.color}`}>
                This quote has been {STATUS_INFO[quote.quoteStatus]?.label.toLowerCase()}
              </p>
              {quote.clientSignedName && <p className="text-sm text-slate-500">By {quote.clientSignedName} on {new Date(quote.clientSignedAt!).toLocaleString("en-ZA")}</p>}
              {quote.declineReason && <p className="text-sm text-slate-500 mt-1">Reason: {quote.declineReason}</p>}
            </div>
          </div>
        )}

        {isExpired && !hasResponded && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 mb-6 flex items-center gap-3">
            <Clock className="text-orange-600" size={20} />
            <p className="font-semibold text-orange-700">This quote has expired and can no longer be accepted.</p>
          </div>
        )}

        {/* Line Items */}
        {parsedItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-20">Qty</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-28">Unit Price</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedItems.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-slate-700">{item.description}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{item.qty}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatCurrency(item.qty * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-4 py-2 text-right text-slate-500">Subtotal</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-700">{formatCurrency(Number(quote.amount))}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-slate-500">VAT ({quote.taxRate ?? 15}%)</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-700">{formatCurrency(Number(quote.taxAmount))}</td>
                </tr>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={3} className="px-4 py-3 text-right text-slate-900 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-blue-600">{formatCurrency(Number(quote.totalAmount))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* No line items — show total */}
        {parsedItems.length === 0 && quote.totalAmount && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 text-center">
            <p className="text-sm text-slate-500">Total Amount</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{formatCurrency(Number(quote.totalAmount))}</p>
          </div>
        )}

        {/* Notes */}
        {quote.notes && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Already signed — show signature */}
        {quote.clientSignature && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Client Signature</h3>
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={quote.clientSignature} alt="Client signature" className="max-w-xs mx-auto" />
              <p className="text-sm text-slate-500 mt-2">Signed by {quote.clientSignedName}</p>
            </div>
          </div>
        )}

        {/* Accept/Decline Section */}
        {isRespondable && !isExpired && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Response</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
            )}

            {!showDeclineForm ? (
              <>
                {/* Signature Section */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Your Full Name *</label>
                  <input
                    type="text"
                    value={signedName}
                    onChange={(e) => setSignedName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Your Signature *</label>
                  <p className="text-xs text-slate-400 mb-2">Draw your signature below using your mouse or finger</p>
                  <SignaturePad onSignature={setSignature} width={500} height={200} />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAccept}
                    disabled={submitting || !signature || !signedName.trim()}
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    Accept Quote
                  </button>
                  <button
                    onClick={() => setShowDeclineForm(true)}
                    className="px-6 py-3 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition"
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Reason for declining (optional)</label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={3}
                    placeholder="Let us know why you are declining this quote..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-red-500/40 focus:border-red-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDecline}
                    disabled={submitting}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                    Confirm Decline
                  </button>
                  <button
                    onClick={() => setShowDeclineForm(false)}
                    className="px-6 py-3 border border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-8">
          This quote was generated by GSS Support. &copy; {new Date().getFullYear()} Global Software Services.
        </p>
      </div>
    </div>
  );
}

export default function QuotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    }>
      <QuotePageContent />
    </Suspense>
  );
}
