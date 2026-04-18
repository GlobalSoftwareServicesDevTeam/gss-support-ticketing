"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Wallet, Building2, ArrowRightLeft, X, Check, ShieldCheck, ShieldX } from "lucide-react";
import { PayFastLogo, OzowLogo, EftIcon } from "@/components/payment-logos";

interface Payment {
  id: string;
  gateway: string;
  gatewayRef: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  metadata: string | null;
  createdAt: string;
}

interface EftDetail {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string | null;
  swiftCode: string | null;
  reference: string | null;
}

interface SavedCard {
  id: string;
  cardBrand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  nickname: string | null;
  isDefault: boolean;
}

interface Gateways {
  payfast: boolean;
  ozow: boolean;
}

interface UnpaidInvoice {
  id: string;
  number: string;
  amount: number;
  balance: number;
  due_date: string | null;
  line_items: LineItem[];
}

interface LineItem {
  product_key: string;
  notes: string;
  cost: number;
  quantity: number;
  line_total: number;
}

type Tab = "pay" | "history" | "eft-settings";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETE: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  REFUNDED: "bg-purple-100 text-purple-800",
};

const gatewayColors: Record<string, string> = {
  PAYFAST: "bg-blue-50 text-blue-700",
  OZOW: "bg-teal-50 text-teal-700",
  EFT: "bg-orange-50 text-orange-700",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

export default function PaymentsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = session?.user?.role === "ADMIN";

  const [tab, setTab] = useState<Tab>("pay");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [eftDetails, setEftDetails] = useState<EftDetail[]>([]);
  const [gateways, setGateways] = useState<Gateways>({ payfast: false, ozow: false });
  const [loading, setLoading] = useState(true);
  const resultMessage = useMemo(() => {
    const result = searchParams.get("result");
    if (result === "success") return "Payment completed successfully!";
    if (result === "cancelled") return "Payment was cancelled.";
    if (result === "error") return "There was an error processing your payment.";
    return "";
  }, [searchParams]);
  const [dismissed, setDismissed] = useState(false);

  // Payment form state
  const [payForm, setPayForm] = useState({
    gateway: "PAYFAST",
    amount: "",
    description: "",
    invoiceNumber: "",
  });
  const [paying, setPaying] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [payWithCard, setPayWithCard] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedLineItems, setSelectedLineItems] = useState<number[]>([]);

  // EFT form state (admin)
  const [showEftForm, setShowEftForm] = useState(false);
  const [eftForm, setEftForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    branchCode: "",
    accountType: "CHEQUE",
    swiftCode: "",
    reference: "",
  });
  const [savingEft, setSavingEft] = useState(false);

  // Allocation modal state (admin)
  interface NinjaInvoice { id: string; number: string; amount: number; balance: number; status_id: string; date: string; client?: { display_name?: string; name?: string }; }
  const [allocatePayment, setAllocatePayment] = useState<Payment | null>(null);
  const [ninjaInvoices, setNinjaInvoices] = useState<NinjaInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [allocating, setAllocating] = useState(false);
  const [allocateLoading, setAllocateLoading] = useState(false);
  const [allocateError, setAllocateError] = useState("");

  const allocTotal = useMemo(() => Object.values(allocations).reduce((s, v) => s + (v || 0), 0), [allocations]);

  const openAllocateModal = useCallback(async (payment: Payment) => {
    setAllocatePayment(payment);
    setAllocations({});
    setAllocateError("");
    setAllocateLoading(true);
    try {
      const res = await fetch("/api/invoices?type=invoices");
      const data = await res.json();
      const all = ((data.data || []) as NinjaInvoice[]).filter((inv) => Number(inv.balance) > 0);
      setNinjaInvoices(all);
    } catch {
      setAllocateError("Failed to load invoices");
    }
    setAllocateLoading(false);
  }, []);

  async function handleAllocate() {
    if (!allocatePayment) return;
    const entries = Object.entries(allocations).filter(([, amt]) => amt > 0);
    if (entries.length === 0) { setAllocateError("Select at least one invoice to allocate to"); return; }
    if (allocTotal > Number(allocatePayment.amount)) { setAllocateError("Total allocation exceeds payment amount"); return; }

    setAllocating(true);
    setAllocateError("");
    try {
      const res = await fetch("/api/payments/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: allocatePayment.id,
          invoices: entries.map(([invoiceId, amount]) => ({
            invoiceId,
            amount,
            invoiceNumber: ninjaInvoices.find((i) => i.id === invoiceId)?.number,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAllocateError(data.error || "Allocation failed"); setAllocating(false); return; }
      setAllocatePayment(null);
      refreshPayments();
    } catch (err) {
      setAllocateError(String(err));
    }
    setAllocating(false);
  }

  // EFT verify/reject state
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  async function handleVerifyReject(paymentId: string, action: "verify" | "reject") {
    const label = action === "verify" ? "verify" : "reject";
    if (!confirm(`Are you sure you want to ${label} this EFT payment?`)) return;
    setVerifyingId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || `Failed to ${label} payment`); setVerifyingId(null); return; }
      refreshPayments();
    } catch (err) {
      alert(String(err));
    }
    setVerifyingId(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPayments(data.payments || []);
        setGateways(data.gateways || { payfast: false, ozow: false });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/eft")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEftDetails(Array.isArray(data) ? data : []);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cards")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          const cards = Array.isArray(data) ? data : [];
          setSavedCards(cards);
          const defaultCard = cards.find((c: SavedCard) => c.isDefault);
          if (defaultCard) setSelectedCardId(defaultCard.id);
          else if (cards.length > 0) setSelectedCardId(cards[0].id);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/invoices?type=invoices")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const all = (data.data || []) as UnpaidInvoice[];
        setUnpaidInvoices(all.filter((inv) => Number(inv.balance) > 0));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function refreshPayments() {
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => {
        setPayments(data.payments || []);
        setGateways(data.gateways || { payfast: false, ozow: false });
      });
  }

  function refreshEft() {
    fetch("/api/payments/eft")
      .then((r) => r.json())
      .then((data) => setEftDetails(Array.isArray(data) ? data : []));
  }

  function buildDescriptionFromLineItems(inv: UnpaidInvoice, indices: number[]): string {
    if (indices.length === 0) return "";
    return indices
      .map((i) => {
        const li = inv.line_items[i];
        const name = li.product_key || li.notes || "Item";
        return `${name} (${formatCurrency(Number(li.line_total))})`;
      })
      .join(", ");
  }

  function handleLineItemToggle(inv: UnpaidInvoice, index: number, checked: boolean) {
    const next = checked
      ? [...selectedLineItems, index]
      : selectedLineItems.filter((i) => i !== index);
    setSelectedLineItems(next);
    const desc = buildDescriptionFromLineItems(inv, next);
    const total = next.reduce((sum, i) => sum + Number(inv.line_items[i].line_total), 0);
    setPayForm((f) => ({
      ...f,
      description: desc,
      amount: next.length > 0 ? Math.min(total, Number(inv.balance)).toFixed(2) : Number(inv.balance).toFixed(2),
    }));
  }

  function handleSelectAllLineItems(inv: UnpaidInvoice, selectAll: boolean) {
    const indices = selectAll ? inv.line_items.map((_, i) => i) : [];
    setSelectedLineItems(indices);
    const desc = buildDescriptionFromLineItems(inv, indices);
    setPayForm((f) => ({
      ...f,
      description: desc,
      amount: Number(inv.balance).toFixed(2),
    }));
  }

  function handleInvoiceSelect(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setSelectedLineItems([]);
    if (!invoiceId) {
      setPayForm((f) => ({ ...f, invoiceNumber: "", amount: "", description: "" }));
      return;
    }
    const inv = unpaidInvoices.find((i) => i.id === invoiceId);
    if (inv) {
      setPayForm((f) => ({ ...f, invoiceNumber: inv.number, amount: Number(inv.balance).toFixed(2), description: "" }));
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);

    // Pay with saved card
    if (payWithCard && selectedCardId) {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCardId,
          amount: parseFloat(payForm.amount),
          description: payForm.description || undefined,
          invoiceNumber: payForm.invoiceNumber || undefined,
        }),
      });
      const data = await res.json();
      setPaying(false);
      if (!res.ok) {
        alert(data.error || "Failed to charge saved card");
        return;
      }
      alert("Payment processed successfully!");
      setPayForm({ gateway: "PAYFAST", amount: "", description: "", invoiceNumber: "" });
      setPayWithCard(false);
      refreshPayments();
      setTab("history");
      return;
    }

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway: payForm.gateway,
        amount: parseFloat(payForm.amount),
        description: payForm.description || undefined,
        invoiceNumber: payForm.invoiceNumber || undefined,
        saveCard: payForm.gateway === "PAYFAST" && saveCard ? true : undefined,
      }),
    });

    const data = await res.json();
    setPaying(false);

    if (!res.ok) {
      alert(data.error || "Failed to initiate payment");
      return;
    }

    if (data.redirect) {
      // Build and submit a form for PayFast / Ozow
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.redirect.url;
      for (const [key, value] of Object.entries(data.redirect.params)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      return;
    }

    // EFT — just show confirmation and switch to history
    alert("EFT payment recorded. Please transfer the funds using the bank details shown.");
    setPayForm({ gateway: "PAYFAST", amount: "", description: "", invoiceNumber: "" });
    refreshPayments();
    setTab("history");
  }

  async function handleSaveEft(e: React.FormEvent) {
    e.preventDefault();
    setSavingEft(true);
    const res = await fetch("/api/payments/eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eftForm),
    });
    setSavingEft(false);

    if (res.ok) {
      setShowEftForm(false);
      setEftForm({ bankName: "", accountName: "", accountNumber: "", branchCode: "", accountType: "CHEQUE", swiftCode: "", reference: "" });
      refreshEft();
    }
  }

  async function handleDeleteEft(id: string) {
    if (!confirm("Delete this bank account?")) return;
    await fetch(`/api/payments/eft/${id}`, { method: "DELETE" });
    refreshEft();
  }

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: "pay", label: "Make Payment" },
    { key: "history", label: "Payment History" },
    { key: "eft-settings", label: "EFT Bank Details", adminOnly: true },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Payments</h1>

      {resultMessage && !dismissed && (
        <div className={`mb-6 p-4 rounded-lg border text-sm ${
          resultMessage.includes("success") ? "bg-green-50 border-green-200 text-green-800" :
          resultMessage.includes("cancel") ? "bg-yellow-50 border-yellow-200 text-yellow-800" :
          "bg-red-50 border-red-200 text-red-800"
        }`}>
          {resultMessage}
          <button onClick={() => setDismissed(true)} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Make Payment Tab */}
      {tab === "pay" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment form */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Make a Payment</h2>
            <form onSubmit={handlePay}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Gateway *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "PAYFAST", label: "PayFast", icon: <PayFastLogo size={40} />, enabled: gateways.payfast },
                      { key: "OZOW", label: "Ozow", icon: <OzowLogo size={40} />, enabled: gateways.ozow },
                      { key: "EFT", label: "EFT / Bank", icon: <EftIcon size={40} />, enabled: true },
                    ].map((gw) => (
                      <button
                        key={gw.key}
                        type="button"
                        onClick={() => setPayForm({ ...payForm, gateway: gw.key })}
                        disabled={!gw.enabled && gw.key !== "EFT"}
                        className={`p-3 rounded-lg border-2 text-center transition ${
                          payForm.gateway === gw.key
                            ? "border-blue-500 bg-blue-50"
                            : gw.enabled || gw.key === "EFT"
                            ? "border-slate-200 hover:border-slate-300 bg-white"
                            : "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <span className="flex justify-center items-center mb-1 h-10">{gw.icon}</span>
                        <span className="text-xs font-medium text-slate-700">{gw.label}</span>
                        {!gw.enabled && gw.key !== "EFT" && (
                          <span className="block text-xs text-slate-400 mt-0.5">Not configured</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {unpaidInvoices.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select Invoice <span className="text-slate-400 font-normal">(optional)</span></label>
                    <select
                      title="Select invoice"
                      value={selectedInvoiceId}
                      onChange={(e) => handleInvoiceSelect(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                    >
                      <option value="">— None / Ad-hoc payment —</option>
                      {unpaidInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.number} — Balance: {formatCurrency(Number(inv.balance))}
                          {inv.due_date ? ` · Due ${new Date(inv.due_date).toLocaleDateString("en-ZA")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Line items for selected invoice */}
                {(() => {
                  const inv = unpaidInvoices.find((i) => i.id === selectedInvoiceId);
                  if (!inv || !inv.line_items || inv.line_items.length === 0) return null;
                  return (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                        <span className="text-sm font-medium text-slate-700">Invoice Line Items</span>
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => handleSelectAllLineItems(inv, selectedLineItems.length !== inv.line_items.length)}
                        >
                          {selectedLineItems.length === inv.line_items.length ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {inv.line_items.map((li, idx) => (
                          <label
                            key={idx}
                            className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition ${
                              selectedLineItems.includes(idx) ? "bg-blue-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedLineItems.includes(idx)}
                              onChange={(e) => handleLineItemToggle(inv, idx, e.target.checked)}
                              className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-900 block truncate">
                                {li.product_key || li.notes || "Item"}
                              </span>
                              {li.notes && li.product_key && (
                                <span className="text-xs text-slate-500 block truncate">{li.notes}</span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm font-medium text-slate-900">{formatCurrency(Number(li.line_total))}</span>
                              {Number(li.quantity) !== 1 && (
                                <span className="text-xs text-slate-400 block">{li.quantity} × {formatCurrency(Number(li.cost))}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                      {selectedLineItems.length > 0 && (
                        <div className="bg-blue-50 border-t border-blue-200 px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-blue-700">
                            {selectedLineItems.length} item{selectedLineItems.length !== 1 ? "s" : ""} selected
                          </span>
                          <span className="text-sm font-semibold text-blue-800">
                            {formatCurrency(selectedLineItems.reduce((sum, i) => sum + Number(inv.line_items[i].line_total), 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      required
                    />
                  </div>
                  {(() => {
                    const inv = unpaidInvoices.find((i) => i.id === selectedInvoiceId);
                    if (!inv) return null;
                    const isPartial = payForm.amount !== "" && Number(payForm.amount) < Number(inv.balance);
                    return (
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-slate-500">
                          Balance due: <strong>{formatCurrency(Number(inv.balance))}</strong>
                          {isPartial && Number(payForm.amount) > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">(partial payment)</span>
                          )}
                        </span>
                        {isPartial && (
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                            onClick={() => setPayForm((f) => ({ ...f, amount: Number(inv.balance).toFixed(2) }))}
                          >
                            Use full balance
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={payForm.invoiceNumber}
                    onChange={(e) => setPayForm({ ...payForm, invoiceNumber: e.target.value })}
                    placeholder="e.g. INV-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={payForm.description}
                    onChange={(e) => setPayForm({ ...payForm, description: e.target.value })}
                    placeholder="What is this payment for?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                {/* Saved card quick-pay */}
                {savedCards.length > 0 && (
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={payWithCard}
                        onChange={(e) => setPayWithCard(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300"
                      />
                      <Wallet size={16} className="text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">Pay with saved card</span>
                    </label>
                    {payWithCard && (
                      <div className="mt-2">
                        <select
                          title="Select a saved card"
                          value={selectedCardId || ""}
                          onChange={(e) => setSelectedCardId(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                        >
                          {savedCards.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.cardBrand || "Card"} •••• {c.last4 || "????"}{" "}
                              {c.nickname ? `(${c.nickname})` : ""}{" "}
                              {c.isDefault ? "★ Default" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Save card for future use */}
                {payForm.gateway === "PAYFAST" && !payWithCard && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-600">Save card for future payments</span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={paying || !payForm.amount}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                >
                  {paying ? "Processing..." :
                    payWithCard ? "Pay with Saved Card" :
                    payForm.gateway === "PAYFAST" ? "Pay with PayFast" :
                    payForm.gateway === "OZOW" ? "Pay with Ozow" :
                    "Record EFT Payment"}
                </button>
              </div>
            </form>
          </div>

          {/* EFT Bank Details (always visible when EFT selected or when details exist) */}
          <div>
            {eftDetails.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">EFT / Bank Transfer Details</h2>
                <p className="text-sm text-slate-500 mb-4">Use the following bank details to make a direct transfer:</p>
                <div className="space-y-4">
                  {eftDetails.map((detail) => (
                    <div key={detail.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500">Bank:</span>
                          <span className="ml-2 font-medium text-slate-900">{detail.bankName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Account Name:</span>
                          <span className="ml-2 font-medium text-slate-900">{detail.accountName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Account Number:</span>
                          <span className="ml-2 font-mono font-medium text-slate-900">{detail.accountNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Branch Code:</span>
                          <span className="ml-2 font-mono font-medium text-slate-900">{detail.branchCode}</span>
                        </div>
                        {detail.accountType && (
                          <div>
                            <span className="text-slate-500">Account Type:</span>
                            <span className="ml-2 font-medium text-slate-900">{detail.accountType}</span>
                          </div>
                        )}
                        {detail.swiftCode && (
                          <div>
                            <span className="text-slate-500">SWIFT:</span>
                            <span className="ml-2 font-mono font-medium text-slate-900">{detail.swiftCode}</span>
                          </div>
                        )}
                      </div>
                      {detail.reference && (
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                          <strong>Reference:</strong> {detail.reference}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eftDetails.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
                <span className="text-4xl block mb-2"><Building2 size={40} className="mx-auto text-slate-400" /></span>
                No bank details configured yet.
                {isAdmin && <p className="text-sm mt-1">Go to the EFT Bank Details tab to add bank accounts.</p>}
              </div>
            )}

            {/* Gateway info cards */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-4 ${gateways.payfast ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                <h3 className="text-sm font-medium text-slate-900"><span className="inline-flex items-center gap-1.5"><PayFastLogo size={20} /> PayFast</span></h3>
                <p className="text-xs mt-1 text-slate-500">Credit/Debit cards, Instant EFT, SnapScan</p>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${gateways.payfast ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {gateways.payfast ? "Connected" : "Not configured"}
                </span>
              </div>
              <div className={`rounded-lg border p-4 ${gateways.ozow ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50"}`}>
                <h3 className="text-sm font-medium text-slate-900"><span className="inline-flex items-center gap-1.5"><OzowLogo size={20} /> Ozow</span></h3>
                <p className="text-xs mt-1 text-slate-500">Instant EFT via all major SA banks</p>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${gateways.ozow ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {gateways.ozow ? "Connected" : "Not configured"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {tab === "history" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Gateway</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Invoice</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                {isAdmin && <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>}
                {isAdmin && <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={isAdmin ? 8 : 6} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={isAdmin ? 8 : 6} className="px-6 py-8 text-center text-slate-400">No payments yet.</td></tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${gatewayColors[p.gateway] || "bg-gray-100 text-gray-700"}`}>
                        {p.gateway === "PAYFAST" && <PayFastLogo size={14} />}
                        {p.gateway === "OZOW" && <OzowLogo size={14} />}
                        {p.gateway === "EFT" && <EftIcon size={14} />}
                        {p.gateway}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{p.description || "—"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">{p.invoiceNumber || "—"}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(Number(p.amount))}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || "bg-gray-100 text-gray-700"}`}>
                        {p.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-sm text-slate-600">{p.customerName || p.customerEmail || "—"}</td>
                    )}
                    {isAdmin && (
                      <td className="px-6 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {/* Pending EFT: show Verify + Reject */}
                          {p.status === "PENDING" && p.gateway === "EFT" && (
                            <>
                              <button
                                onClick={() => handleVerifyReject(p.id, "verify")}
                                disabled={verifyingId === p.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-xs font-medium disabled:opacity-50"
                              >
                                <ShieldCheck size={12} />
                                {verifyingId === p.id ? "..." : "Verify"}
                              </button>
                              <button
                                onClick={() => handleVerifyReject(p.id, "reject")}
                                disabled={verifyingId === p.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition text-xs font-medium disabled:opacity-50"
                              >
                                <ShieldX size={12} />
                                Reject
                              </button>
                            </>
                          )}
                          {/* Complete + not yet allocated: show Allocate */}
                          {p.status === "COMPLETE" && !p.metadata?.includes("ninjaPaymentId") && (
                            <button
                              onClick={() => openAllocateModal(p)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition text-xs font-medium"
                            >
                              <ArrowRightLeft size={12} />
                              Allocate
                            </button>
                          )}
                          {/* Already allocated */}
                          {p.metadata?.includes("ninjaPaymentId") && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Allocated</span>
                          )}
                          {/* Other pending (non-EFT), processing, etc. */}
                          {p.status === "PENDING" && p.gateway !== "EFT" && (
                            <span className="text-xs text-yellow-600">Awaiting gateway</span>
                          )}
                          {["FAILED", "CANCELLED", "REFUNDED"].includes(p.status) && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {p.status === "PROCESSING" && (
                            <span className="text-xs text-blue-600">Processing</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* EFT Settings Tab (admin) */}
      {tab === "eft-settings" && isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Manage EFT Bank Details</h2>
            <button
              onClick={() => setShowEftForm(!showEftForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              {showEftForm ? "Cancel" : "+ Add Bank Account"}
            </button>
          </div>

          {showEftForm && (
            <form onSubmit={handleSaveEft} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name *</label>
                  <input
                    type="text"
                    value={eftForm.bankName}
                    onChange={(e) => setEftForm({ ...eftForm, bankName: e.target.value })}
                    placeholder="e.g. FNB, Standard Bank, Nedbank"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Name *</label>
                  <input
                    type="text"
                    value={eftForm.accountName}
                    onChange={(e) => setEftForm({ ...eftForm, accountName: e.target.value })}
                    placeholder="Account holder name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Number *</label>
                  <input
                    type="text"
                    value={eftForm.accountNumber}
                    onChange={(e) => setEftForm({ ...eftForm, accountNumber: e.target.value })}
                    placeholder="Account number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Branch Code *</label>
                  <input
                    type="text"
                    value={eftForm.branchCode}
                    onChange={(e) => setEftForm({ ...eftForm, branchCode: e.target.value })}
                    placeholder="Branch/universal code"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
                  <select
                    title="Account type"
                    value={eftForm.accountType}
                    onChange={(e) => setEftForm({ ...eftForm, accountType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700"
                  >
                    <option value="CHEQUE">Cheque/Current</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="CURRENT">Current</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SWIFT Code</label>
                  <input
                    type="text"
                    value={eftForm.swiftCode}
                    onChange={(e) => setEftForm({ ...eftForm, swiftCode: e.target.value })}
                    placeholder="e.g. FIRNZAJJ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Reference Instructions</label>
                  <input
                    type="text"
                    value={eftForm.reference}
                    onChange={(e) => setEftForm({ ...eftForm, reference: e.target.value })}
                    placeholder="e.g. Use your invoice number as reference"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              <div className="mt-4">
                <button type="submit" disabled={savingEft} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm">
                  {savingEft ? "Saving..." : "Save Bank Details"}
                </button>
              </div>
            </form>
          )}

          {/* Existing bank details */}
          {eftDetails.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
              No bank accounts configured. Click the button above to add one.
            </div>
          ) : (
            <div className="space-y-4">
              {eftDetails.map((detail) => (
                <div key={detail.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-start justify-between">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm flex-1">
                      <div>
                        <span className="text-slate-500 block">Bank</span>
                        <span className="font-medium text-slate-900">{detail.bankName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Account Name</span>
                        <span className="font-medium text-slate-900">{detail.accountName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Account Number</span>
                        <span className="font-mono font-medium text-slate-900">{detail.accountNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Branch Code</span>
                        <span className="font-mono font-medium text-slate-900">{detail.branchCode}</span>
                      </div>
                      {detail.accountType && (
                        <div>
                          <span className="text-slate-500 block">Account Type</span>
                          <span className="font-medium text-slate-900">{detail.accountType}</span>
                        </div>
                      )}
                      {detail.swiftCode && (
                        <div>
                          <span className="text-slate-500 block">SWIFT Code</span>
                          <span className="font-mono font-medium text-slate-900">{detail.swiftCode}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteEft(detail.id)}
                      className="text-sm px-3 py-1 text-red-600 hover:bg-red-50 rounded transition ml-4"
                    >
                      Delete
                    </button>
                  </div>
                  {detail.reference && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      <strong>Reference:</strong> {detail.reference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Allocation Modal */}
      {allocatePayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Allocate Payment to Invoices</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Payment of {formatCurrency(Number(allocatePayment.amount))} from {allocatePayment.customerName || allocatePayment.customerEmail || "Unknown"}
                </p>
              </div>
              <button title="Close" onClick={() => setAllocatePayment(null)} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {allocateError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{allocateError}</div>
              )}
              {allocateLoading ? (
                <div className="text-center text-slate-400 py-8">Loading invoices...</div>
              ) : ninjaInvoices.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No unpaid invoices found in Invoice Ninja.</div>
              ) : (
                <div className="space-y-3">
                  {ninjaInvoices.map((inv) => {
                    const alloc = allocations[inv.id] || 0;
                    const isSelected = alloc > 0;
                    return (
                      <div key={inv.id} className={`rounded-lg border p-4 transition ${isSelected ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-slate-900">{inv.number}</span>
                              {inv.client?.display_name && (
                                <span className="text-xs text-slate-500 truncate">— {inv.client.display_name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              <span>Total: {formatCurrency(inv.amount)}</span>
                              <span className="font-semibold text-slate-700">Balance: {formatCurrency(inv.balance)}</span>
                              {inv.date && <span>{new Date(inv.date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (alloc > 0) {
                                  setAllocations((a) => { const n = { ...a }; delete n[inv.id]; return n; });
                                } else {
                                  const remaining = Number(allocatePayment.amount) - allocTotal;
                                  const autoAmount = Math.min(inv.balance, remaining > 0 ? remaining : inv.balance);
                                  setAllocations((a) => ({ ...a, [inv.id]: Math.round(autoAmount * 100) / 100 }));
                                }
                              }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${isSelected ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"}`}
                            >
                              {isSelected ? "Remove" : "Select"}
                            </button>
                            {isSelected && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">R</span>
                                <input
                                  type="number"
                                  title="Allocation amount"
                                  value={alloc || ""}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(Number(e.target.value), inv.balance));
                                    setAllocations((a) => ({ ...a, [inv.id]: val }));
                                  }}
                                  min={0}
                                  max={inv.balance}
                                  step="0.01"
                                  className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-slate-900"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Allocating: <span className={`font-semibold ${allocTotal > Number(allocatePayment.amount) ? "text-red-600" : "text-slate-900"}`}>{formatCurrency(allocTotal)}</span>
                {" "}of {formatCurrency(Number(allocatePayment.amount))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAllocatePayment(null)} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                <button
                  onClick={handleAllocate}
                  disabled={allocating || allocTotal === 0 || allocTotal > Number(allocatePayment.amount)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50"
                >
                  {allocating ? "Allocating..." : "Allocate Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
