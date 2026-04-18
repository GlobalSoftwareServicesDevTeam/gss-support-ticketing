"use client";

import { useState, useEffect } from "react";
import { Wallet } from "lucide-react";
import { PayFastLogo, OzowLogo, EftIcon } from "@/components/payment-logos";

interface InvoicePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  invoiceAmount: number;
  invoiceBalance: number;
  clientName: string;
  depositMode?: boolean; // 40% deposit
}

interface Gateways {
  payfast: boolean;
  ozow: boolean;
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
  nickname: string | null;
  isDefault: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

export default function InvoicePaymentModal({
  isOpen,
  onClose,
  invoiceNumber,
  invoiceAmount,
  invoiceBalance,
  clientName,
  depositMode = false,
}: InvoicePaymentModalProps) {
  const [gateway, setGateway] = useState("PAYFAST");
  const [gateways, setGateways] = useState<Gateways>({ payfast: false, ozow: false });
  const [eftDetails, setEftDetails] = useState<EftDetail[]>([]);
  const [paying, setPaying] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "deposit" | "custom">(
    depositMode ? "deposit" : "full"
  );
  const [saveCard, setSaveCard] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [payWithCard, setPayWithCard] = useState(false);
  const [eftConfirmed, setEftConfirmed] = useState(false);

  const depositAmount = Math.round(invoiceAmount * 0.4 * 100) / 100;
  const payableAmount =
    paymentType === "deposit"
      ? depositAmount
      : paymentType === "custom"
      ? parseFloat(customAmount) || 0
      : invoiceBalance;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setGateways(data.gateways || { payfast: false, ozow: false });
        }
      });
    fetch("/api/payments/eft")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEftDetails(Array.isArray(data) ? data : []);
      });
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
  }, [isOpen]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (payableAmount <= 0) return;
    setPaying(true);

    const description =
      paymentType === "deposit"
        ? `40% Deposit for Invoice ${invoiceNumber}`
        : paymentType === "custom"
        ? `Advance Payment for Invoice ${invoiceNumber}`
        : `Full Payment for Invoice ${invoiceNumber}`;

    // Pay with saved card
    if (payWithCard && selectedCardId) {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCardId,
          amount: payableAmount,
          description,
          invoiceNumber,
        }),
      });
      const data = await res.json();
      setPaying(false);
      if (!res.ok) {
        alert(data.error || "Failed to charge saved card");
        return;
      }
      alert("Payment processed successfully!");
      onClose();
      return;
    }

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway,
        amount: payableAmount,
        description,
        invoiceNumber,
        paymentType: paymentType === "deposit" ? "DEPOSIT_40" : paymentType === "custom" ? "ADVANCE" : "FULL",
        saveCard: gateway === "PAYFAST" && saveCard ? true : undefined,
      }),
    });

    const data = await res.json();
    setPaying(false);

    if (!res.ok) {
      alert(data.error || "Failed to initiate payment");
      return;
    }

    if (data.redirect) {
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

    // EFT — show confirmation screen
    setEftConfirmed(true);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* EFT Confirmation Screen */}
          {eftConfirmed ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">EFT Payment Recorded</h2>
              <p className="text-sm text-slate-600 mb-4">
                Your payment of <strong>{formatCurrency(payableAmount)}</strong> for invoice <strong>{invoiceNumber}</strong> has been recorded.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">What happens next?</h3>
                <ol className="text-sm text-amber-800 space-y-1.5 list-decimal list-inside">
                  <li>Transfer the funds to the bank account shown on the payment form</li>
                  <li>Use <strong>{invoiceNumber}</strong> as your payment reference</li>
                  <li>Our admin team has been notified and will verify receipt</li>
                  <li>Once verified, the payment will be allocated to your invoice</li>
                </ol>
              </div>
              <button
                onClick={() => { setEftConfirmed(false); onClose(); }}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
              >
                Done
              </button>
            </div>
          ) : (
          <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">
              {depositMode ? "Pay 40% Deposit" : "Pay Invoice"}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* Invoice summary */}
          <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">Invoice:</span>
                <span className="ml-2 font-mono font-medium text-slate-900">{invoiceNumber}</span>
              </div>
              <div>
                <span className="text-slate-500">Client:</span>
                <span className="ml-2 font-medium text-slate-900">{clientName || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Total Amount:</span>
                <span className="ml-2 font-medium text-slate-900">{formatCurrency(invoiceAmount)}</span>
              </div>
              <div>
                <span className="text-slate-500">Balance Due:</span>
                <span className="ml-2 font-medium text-slate-900">{formatCurrency(invoiceBalance)}</span>
              </div>
            </div>
          </div>

          {/* Payment type selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Payment Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentType("full")}
                className={`p-3 rounded-lg border-2 text-center transition text-sm ${
                  paymentType === "full"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <span className="block font-medium text-slate-900">Full Balance</span>
                <span className="text-xs text-slate-500">{formatCurrency(invoiceBalance)}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("deposit")}
                className={`p-3 rounded-lg border-2 text-center transition text-sm ${
                  paymentType === "deposit"
                    ? "border-green-500 bg-green-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <span className="block font-medium text-slate-900">40% Deposit</span>
                <span className="text-xs text-slate-500">{formatCurrency(depositAmount)}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("custom")}
                className={`p-3 rounded-lg border-2 text-center transition text-sm ${
                  paymentType === "custom"
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <span className="block font-medium text-slate-900">Custom</span>
                <span className="text-xs text-slate-500">Advance Payment</span>
              </button>
            </div>
          </div>

          {/* Custom amount input */}
          {paymentType === "custom" && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZAR)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={invoiceBalance}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>
          )}

          {/* Amount to pay display */}
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <span className="text-sm text-blue-700">Amount to pay:</span>
            <span className="ml-2 text-lg font-bold text-blue-900">{formatCurrency(payableAmount)}</span>
          </div>

          {/* Gateway selection */}
          <form onSubmit={handlePay}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "PAYFAST", label: "PayFast", icon: <PayFastLogo size={36} />, enabled: gateways.payfast },
                  { key: "OZOW", label: "Ozow", icon: <OzowLogo size={36} />, enabled: gateways.ozow },
                  { key: "EFT", label: "EFT / Bank", icon: <EftIcon size={36} />, enabled: true },
                ].map((gw) => (
                  <button
                    key={gw.key}
                    type="button"
                    onClick={() => setGateway(gw.key)}
                    disabled={!gw.enabled && gw.key !== "EFT"}
                    className={`p-3 rounded-lg border-2 text-center transition ${
                      gateway === gw.key
                        ? "border-blue-500 bg-blue-50"
                        : gw.enabled || gw.key === "EFT"
                        ? "border-slate-200 hover:border-slate-300 bg-white"
                        : "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <span className="flex justify-center items-center mb-1 h-9">{gw.icon}</span>
                    <span className="text-xs font-medium text-slate-700">{gw.label}</span>
                    {!gw.enabled && gw.key !== "EFT" && (
                      <span className="block text-xs text-slate-400 mt-0.5">Not configured</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* EFT bank details inline */}
            {gateway === "EFT" && eftDetails.length > 0 && (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h3 className="text-sm font-medium text-orange-900 mb-2">Bank Transfer Details</h3>
                {eftDetails.map((d) => (
                  <div key={d.id} className="text-sm text-orange-800 space-y-1">
                    <div><strong>Bank:</strong> {d.bankName} | <strong>Account:</strong> {d.accountName}</div>
                    <div><strong>Acc No:</strong> <span className="font-mono">{d.accountNumber}</span> | <strong>Branch:</strong> <span className="font-mono">{d.branchCode}</span></div>
                    {d.reference && <div className="text-xs text-orange-700 mt-1"><strong>Ref:</strong> {d.reference}</div>}
                  </div>
                ))}
                <p className="text-xs text-orange-600 mt-2">
                  Use <strong>{invoiceNumber}</strong> as your payment reference.
                </p>
              </div>
            )}

            {/* Pay with saved card */}
            {savedCards.length > 0 && (
              <div className="mb-4 border border-slate-200 rounded-lg p-3 bg-slate-50">
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
                  <select
                    title="Select a saved card"
                    value={selectedCardId || ""}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                  >
                    {savedCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cardBrand || "Card"} •••• {c.last4 || "????"}{" "}
                        {c.nickname ? `(${c.nickname})` : ""}{" "}
                        {c.isDefault ? "★ Default" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Save card checkbox */}
            {gateway === "PAYFAST" && !payWithCard && (
              <label className="flex items-center gap-2 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <span className="text-sm text-slate-600">Save card for future payments</span>
              </label>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paying || payableAmount <= 0}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium text-sm"
              >
                {paying
                  ? "Processing..."
                  : payWithCard
                  ? `Pay ${formatCurrency(payableAmount)} with Saved Card`
                  : gateway === "PAYFAST"
                  ? `Pay ${formatCurrency(payableAmount)} with PayFast`
                  : gateway === "OZOW"
                  ? `Pay ${formatCurrency(payableAmount)} with Ozow`
                  : `Record EFT Payment`}
              </button>
            </div>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
