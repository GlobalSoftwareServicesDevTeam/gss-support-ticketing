"use client";

import { useEffect, useState } from "react";
import { CreditCard, Trash2, Star, Edit3, Check, X, Plus } from "lucide-react";

interface SavedCard {
  id: string;
  gateway: string;
  cardBrand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  nickname: string | null;
  isDefault: boolean;
  createdAt: string;
}

const brandColors: Record<string, string> = {
  VISA: "from-blue-600 to-blue-800",
  MASTERCARD: "from-red-500 to-orange-600",
  AMEX: "from-green-600 to-teal-700",
  DISCOVER: "from-orange-500 to-yellow-600",
  DEFAULT: "from-slate-600 to-slate-800",
};

const brandIcons: Record<string, string> = {
  VISA: "VISA",
  MASTERCARD: "MC",
  AMEX: "AMEX",
};

export default function CardsPage() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");

  const fetchCards = () => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((data) => {
        setCards(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCards();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Remove this card? You won't be able to use it for future payments.")) return;
    const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
    if (res.ok) fetchCards();
  }

  async function handleSetDefault(id: string) {
    const res = await fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) fetchCards();
  }

  async function handleSaveNickname(id: string) {
    const res = await fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: editNickname }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchCards();
    }
  }

  function getGradient(brand: string | null) {
    const key = (brand || "").toUpperCase();
    return brandColors[key] || brandColors.DEFAULT;
  }

  function getBrandLabel(brand: string | null) {
    const key = (brand || "").toUpperCase();
    return brandIcons[key] || "CARD";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved Cards</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your saved payment cards for quick checkout
          </p>
        </div>
        <a
          href="/payments"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          <Plus size={16} />
          Add Card via Payment
        </a>
      </div>

      {/* Info banner */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <strong>How it works:</strong> When making a PayFast payment, check &quot;Save card for future
        payments&quot; to securely store your card. Your card details are tokenized by PayFast — we
        never store your full card number.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <CreditCard size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No saved cards</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            You don&apos;t have any saved cards yet. When making a payment via PayFast, you can
            choose to save your card for faster future payments.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className="relative rounded-xl overflow-hidden shadow-sm border border-slate-200"
            >
              {/* Card visual */}
              <div
                className={`bg-gradient-to-br ${getGradient(card.cardBrand)} p-5 text-white min-h-[160px] flex flex-col justify-between`}
              >
                <div className="flex items-start justify-between">
                  <div className="text-xs font-medium uppercase tracking-wider opacity-80">
                    {card.gateway}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tracking-wider">
                      {getBrandLabel(card.cardBrand)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-lg font-mono tracking-[0.25em] mb-2">
                    •••• •••• •••• {card.last4 || "????"}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider opacity-60">
                        {card.nickname || "Saved Card"}
                      </div>
                    </div>
                    {card.expiryMonth && card.expiryYear ? (
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider opacity-60">
                          Expires
                        </div>
                        <div className="text-sm font-mono">
                          {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {card.isDefault && (
                  <span className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Default
                  </span>
                )}
              </div>

              {/* Card actions */}
              <div className="bg-white p-3">
                {editingId === card.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      placeholder="Card nickname"
                      className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded text-slate-900"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveNickname(card.id)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Save"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-slate-400 hover:bg-slate-50 rounded"
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {!card.isDefault && (
                      <button
                        onClick={() => handleSetDefault(card.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded transition"
                        title="Set as default"
                      >
                        <Star size={14} /> Default
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingId(card.id);
                        setEditNickname(card.nickname || "");
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition"
                      title="Edit nickname"
                    >
                      <Edit3 size={14} /> Rename
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleDelete(card.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                      title="Remove card"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
