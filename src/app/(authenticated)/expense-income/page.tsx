"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, RotateCcw, RefreshCw, Wallet, Upload } from "lucide-react";
import dynamic from "next/dynamic";



type Tab = "expenses" | "income";


const ExpenseImportModal = dynamic(() => import("@/components/expense-import-modal"), { ssr: false });

type TrackerMonth = {
  id: number;
  year: number;
  month: number;
  is_current: 0 | 1;
};

type ExpenseItem = {
  id: number;
  month_id: number;
  name: string;
  expected_amount: number;
  paid_amount: number;
  is_recurring: 0 | 1;
};

type IncomeItem = {
  id: number;
  month_id: number;
  source: string;
  expected_amount: number;
  received_amount: number;
  income_type: string;
};

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  recurring: "Recurring",
  invoice: "Invoice (Ninja)",
  quote: "Quote (Ninja)",
  recurring_invoice: "Recurring Inv (Ninja)",
};

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function NumInput({
  value,
  onBlur,
  label,
}: {
  value: number;
  onBlur: (next: number) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      step="0.01"
      defaultValue={value}
      title={label}
      aria-label={label}
      onBlur={(e) => onBlur(Number(e.target.value || 0))}
      className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
    />
  );
}

export default function ExpenseIncomePage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState<Tab>("expenses");
  const [months, setMonths] = useState<TrackerMonth[]>([]);
  const [currentMonth, setCurrentMonth] = useState<TrackerMonth | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [income, setIncome] = useState<IncomeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ninjaConfigured, setNinjaConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseExpected, setNewExpenseExpected] = useState("");
  const [newExpenseRecurring, setNewExpenseRecurring] = useState(true);

  const [newIncomeSource, setNewIncomeSource] = useState("");
  const [newIncomeExpected, setNewIncomeExpected] = useState("");
  const [newIncomeType, setNewIncomeType] = useState("manual");

  const loadMonths = useCallback(async () => {
    const res = await fetch("/api/expense-income/months");
    if (!res.ok) return;
    const data = await res.json();
    const monthList = (data.months || []) as TrackerMonth[];
    const current = (data.current || null) as TrackerMonth | null;

    setMonths(monthList);

    if (current) {
      setCurrentMonth(current);
      return;
    }

    if (monthList.length > 0) {
      setCurrentMonth(monthList[0]);
      return;
    }

    const now = new Date();
    const initRes = await fetch("/api/expense-income/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    });
    if (!initRes.ok) return;
    const initData = await initRes.json();
    setCurrentMonth(initData.month as TrackerMonth);
    const refreshed = await fetch("/api/expense-income/months");
    if (refreshed.ok) {
      const refreshedData = await refreshed.json();
      setMonths((refreshedData.months || []) as TrackerMonth[]);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!currentMonth) return;

    const [expRes, incRes] = await Promise.all([
      fetch(`/api/expense-income/expenses?monthId=${currentMonth.id}`),
      fetch(`/api/expense-income/income?monthId=${currentMonth.id}`),
    ]);

    if (expRes.ok) {
      const expData = await expRes.json();
      setExpenses((expData.expenses || []) as ExpenseItem[]);
    }

    if (incRes.ok) {
      const incData = await incRes.json();
      setIncome((incData.income || []) as IncomeItem[]);
    }
  }, [currentMonth]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        await loadMonths();
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, loadMonths]);

  useEffect(() => {
    if (!isAdmin || !currentMonth) return;
    void loadData();
  }, [isAdmin, currentMonth, loadData]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/expense-income/invoiceninja?action=status")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => setNinjaConfigured(Boolean(d.configured)))
      .catch(() => setNinjaConfigured(false));
  }, [isAdmin]);

  const totals = useMemo(() => {
    const totalExpected = expenses.reduce((sum, e) => sum + (e.expected_amount || 0), 0);
    const totalPaid = expenses.reduce((sum, e) => sum + (e.paid_amount || 0), 0);
    const totalExpectedIncome = income.reduce((sum, i) => sum + (i.expected_amount || 0), 0);
    const totalReceived = income.reduce((sum, i) => sum + (i.received_amount || 0), 0);

    return {
      totalExpected,
      totalPaid,
      totalExpectedIncome,
      totalReceived,
      owed: totalExpected - totalPaid,
      pendingIncome: totalExpectedIncome - totalReceived,
      netExpected: totalExpectedIncome - totalExpected,
      netActual: totalReceived - totalPaid,
    };
  }, [expenses, income]);

  async function switchMonth(monthId: number) {
    const selected = months.find((m) => m.id === monthId);
    if (!selected) return;

    await fetch("/api/expense-income/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: selected.year, month: selected.month }),
    });

    setCurrentMonth(selected);
  }

  async function rolloverNextMonth() {
    if (!currentMonth) return;

    let nextMonth = currentMonth.month + 1;
    let nextYear = currentMonth.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    const res = await fetch("/api/expense-income/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromMonthId: currentMonth.id,
        toYear: nextYear,
        toMonth: nextMonth,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    await loadMonths();
    setCurrentMonth({ id: data.monthId, year: nextYear, month: nextMonth, is_current: 1 });
  }

  async function syncInvoiceNinja() {
    if (!currentMonth) return;
    setSyncing(true);
    setSyncMsg("");

    try {
      const res = await fetch(
        `/api/expense-income/invoiceninja?monthId=${currentMonth.id}&year=${currentMonth.year}&month=${currentMonth.month}`
      );
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error || "Sync failed");
      } else {
        setSyncMsg(`Synced ${data.synced || 0} item(s) from Invoice Ninja.`);
        await loadData();
      }
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function addExpense() {
    if (!currentMonth || !newExpenseName.trim()) return;

    await fetch("/api/expense-income/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthId: currentMonth.id,
        name: newExpenseName.trim(),
        expected_amount: Number(newExpenseExpected || 0),
        is_recurring: newExpenseRecurring,
      }),
    });

    setNewExpenseName("");
    setNewExpenseExpected("");
    await loadData();
  }

  async function addIncome() {
    if (!currentMonth || !newIncomeSource.trim()) return;

    await fetch("/api/expense-income/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthId: currentMonth.id,
        source: newIncomeSource.trim(),
        expected_amount: Number(newIncomeExpected || 0),
        income_type: newIncomeType,
      }),
    });

    setNewIncomeSource("");
    setNewIncomeExpected("");
    setNewIncomeType("manual");
    await loadData();
  }

  async function updateExpenseField(id: number, payload: Record<string, unknown>) {
    await fetch("/api/expense-income/expenses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    });
    await loadData();
  }

  async function updateIncomeField(id: number, payload: Record<string, unknown>) {
    await fetch("/api/expense-income/income", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    });
    await loadData();
  }

  async function removeExpense(id: number) {
    await fetch(`/api/expense-income/expenses?id=${id}`, { method: "DELETE" });
    await loadData();
  }

  async function removeIncome(id: number) {
    await fetch(`/api/expense-income/income?id=${id}`, { method: "DELETE" });
    await loadData();
  }

  if (status === "loading" || loading) {
    return <div className="p-6 text-sm text-slate-500">Loading expense tracker...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle size={18} />
            Admin access required
          </div>
          <p className="mt-2 text-sm">This Expense/Income area is restricted to administrators only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Expense / Income</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Admin financial planning workspace</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentMonth?.id || ""}
            onChange={(e) => switchMonth(Number(e.target.value))}
            title="Select month"
            aria-label="Select month"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {months.map((m) => (
              <option key={m.id} value={m.id}>
                {MONTH_NAMES[m.month]} {m.year}
              </option>
            ))}
          </select>

          <button
            onClick={rolloverNextMonth}
            className="inline-flex items-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <RotateCcw size={14} />
            Start Next Month
          </button>

          {ninjaConfigured && (
            <button
              onClick={syncInvoiceNinja}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Sync Invoice Ninja"}
            </button>
          )}
        </div>
      </div>

      {syncMsg && (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {syncMsg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Expenses Expected</div>
          <div className="mt-1 text-xl font-semibold text-red-600">{fmtCurrency(totals.totalExpected)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Expenses Paid</div>
          <div className="mt-1 text-xl font-semibold text-amber-600">{fmtCurrency(totals.totalPaid)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Income Expected</div>
          <div className="mt-1 text-xl font-semibold text-emerald-600">{fmtCurrency(totals.totalExpectedIncome)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Income Received</div>
          <div className="mt-1 text-xl font-semibold text-emerald-500">{fmtCurrency(totals.totalReceived)}</div>
        </div>
      </div>


      {/* Side-by-side layout for Expenses and Income */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Expenses */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="text-lg font-semibold text-red-700 dark:text-red-300">Expenses</span>
            <button
              onClick={() => setShowImport(true)}
              className="ml-auto flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900"
              title="Import Expenses"
            >
              <Upload size={14} /> Import
            </button>
          </div>
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2 text-right">Expected</th>
                    <th className="px-2 py-2 text-right">Paid</th>
                    <th className="px-2 py-2 text-right">Difference</th>
                    <th className="px-2 py-2 text-center">Recurring</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => {
                    const diff = exp.expected_amount - exp.paid_amount;
                    return (
                      <tr key={exp.id} className="border-b border-slate-100 dark:border-slate-800/70">
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            defaultValue={exp.name}
                            title="Expense name"
                            aria-label="Expense name"
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              if (next && next !== exp.name) {
                                void updateExpenseField(exp.id, { name: next });
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <NumInput
                            value={exp.expected_amount}
                            label="Expense expected amount"
                            onBlur={(next) => void updateExpenseField(exp.id, { expected_amount: next })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <NumInput
                            value={exp.paid_amount}
                            label="Expense paid amount"
                            onBlur={(next) => void updateExpenseField(exp.id, { paid_amount: next })}
                          />
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold ${diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-slate-500"}`}> 
                          {fmtCurrency(diff)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(exp.is_recurring)}
                            title="Recurring expense"
                            aria-label="Recurring expense"
                            onChange={(e) => void updateExpenseField(exp.id, { is_recurring: e.target.checked ? 1 : 0 })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => void removeExpense(exp.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <input
                type="text"
                value={newExpenseName}
                onChange={(e) => setNewExpenseName(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-2"
                placeholder="Expense name"
              />
              <input
                type="number"
                step="0.01"
                value={newExpenseExpected}
                onChange={(e) => setNewExpenseExpected(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="Expected"
              />
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={newExpenseRecurring}
                    title="Mark as recurring expense"
                    aria-label="Mark as recurring expense"
                    onChange={(e) => setNewExpenseRecurring(e.target.checked)}
                  />
                  Recurring
                </label>
                <button
                  onClick={() => void addExpense()}
                  className="ml-auto rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Income */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">Income</span>
          </div>
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2 text-right">Expected</th>
                    <th className="px-2 py-2 text-right">Received</th>
                    <th className="px-2 py-2 text-right">Pending</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {income.map((item) => {
                    const diff = item.expected_amount - item.received_amount;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/70">
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            defaultValue={item.source}
                            title="Income source"
                            aria-label="Income source"
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              if (next && next !== item.source) {
                                void updateIncomeField(item.id, { source: next });
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <NumInput
                            value={item.expected_amount}
                            label="Income expected amount"
                            onBlur={(next) => void updateIncomeField(item.id, { expected_amount: next })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <NumInput
                            value={item.received_amount}
                            label="Income received amount"
                            onBlur={(next) => void updateIncomeField(item.id, { received_amount: next })}
                          />
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold ${diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-slate-500"}`}> 
                          {fmtCurrency(diff)}
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-500">
                          {TYPE_LABELS[item.income_type] || item.income_type}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => void removeIncome(item.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <input
                type="text"
                value={newIncomeSource}
                onChange={(e) => setNewIncomeSource(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-2"
                placeholder="Income source"
              />
              <input
                type="number"
                step="0.01"
                value={newIncomeExpected}
                onChange={(e) => setNewIncomeExpected(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="Expected"
              />
              <select
                value={newIncomeType}
                onChange={(e) => setNewIncomeType(e.target.value)}
                title="Income type"
                aria-label="Income type"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="manual">Manual</option>
                <option value="recurring">Recurring</option>
              </select>
              <button
                onClick={() => void addIncome()}
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && currentMonth && (
        <ExpenseImportModal
          monthId={currentMonth.id}
          onClose={() => setShowImport(false)}
          onImported={loadData}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="flex items-center gap-2 font-medium">
          <Wallet size={16} />
          Net Overview
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>Net Expected: <span className={totals.netExpected >= 0 ? "text-emerald-600" : "text-red-600"}>{fmtCurrency(totals.netExpected)}</span></div>
          <div>Net Actual: <span className={totals.netActual >= 0 ? "text-emerald-600" : "text-red-600"}>{fmtCurrency(totals.netActual)}</span></div>
          <div>Still Owed: <span className="text-red-600">{fmtCurrency(totals.owed)}</span></div>
          <div>Income Pending: <span className="text-amber-600">{fmtCurrency(totals.pendingIncome)}</span></div>
        </div>
      </div>
    </div>
  );
}
