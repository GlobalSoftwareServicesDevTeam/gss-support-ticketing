"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  FileText,
  Receipt,
  FileBarChart,
  ClipboardList,
  Plus,
  Trash2,
  Send,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  Clock,
  Search,
  X,
} from "lucide-react";

type DocType = "INVOICE" | "QUOTE" | "STATEMENT" | "REPORT";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface Transaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface ReportSection {
  heading: string;
  content: string;
}

interface Customer {
  id: string;
  company: string;
  contactPerson: string;
  emailAddress: string;
  address: string | null;
  vatNumber: string | null;
}

interface SentDoc {
  id: string;
  documentType: string;
  documentNo: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientCompany: string | null;
  totalAmount: number | null;
  sentByName: string | null;
  sentAt: string;
}

const DOC_TYPES: { value: DocType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "INVOICE", label: "Invoice", icon: <Receipt size={18} />, color: "blue" },
  { value: "QUOTE", label: "Quote", icon: <FileText size={18} />, color: "indigo" },
  { value: "STATEMENT", label: "Statement", icon: <ClipboardList size={18} />, color: "emerald" },
  { value: "REPORT", label: "Report", icon: <FileBarChart size={18} />, color: "amber" },
];

const TYPE_COLORS: Record<string, string> = {
  INVOICE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  QUOTE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  STATEMENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REPORT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};


export default function SendDocumentsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  // Tab
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");

  // Document type
  const [docType, setDocType] = useState<DocType>("INVOICE");

  // Document details
  const [documentNo, setDocumentNo] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [validUntil, setValidUntil] = useState("");

  // Client
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Invoice / Quote
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", qty: 1, unitPrice: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(15);
  const [amountPaid, setAmountPaid] = useState(0);

  // Statement
  const [statementPeriod, setStatementPeriod] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([
    { date: "", description: "", debit: 0, credit: 0, balance: 0 },
  ]);

  // Report
  const [reportSections, setReportSections] = useState<ReportSection[]>([
    { heading: "", content: "" },
  ]);

  // Notes
  const [notes, setNotes] = useState("");

  // Email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [showEmailOptions, setShowEmailOptions] = useState(false);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sentDocs, setSentDocs] = useState<SentDoc[]>([]);
  const [historySearch, setHistorySearch] = useState("");

  // UI
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Computed totals
  const subtotal = useMemo(() => {
    if (docType !== "INVOICE" && docType !== "QUOTE") return 0;
    return lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  }, [lineItems, docType]);

  const taxAmount = useMemo(() => {
    return Math.round(subtotal * (taxRate / 100) * 100) / 100;
  }, [subtotal, taxRate]);

  const totalAmount = useMemo(() => {
    return Math.round((subtotal + taxAmount) * 100) / 100;
  }, [subtotal, taxAmount]);

  const balanceDue = useMemo(() => {
    return Math.round((totalAmount - amountPaid) * 100) / 100;
  }, [totalAmount, amountPaid]);

  const closingBalance = useMemo(() => {
    if (docType !== "STATEMENT" || !transactions.length) return openingBalance;
    const last = transactions[transactions.length - 1];
    return last.balance || openingBalance;
  }, [transactions, openingBalance, docType]);

  // Fetch customers and history
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/send-documents?type=customers");
      if (res.ok) setCustomers(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/send-documents");
      if (res.ok) setSentDocs(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchNextNumber = useCallback(async (type: DocType) => {
    try {
      const res = await fetch(`/api/send-documents?type=next-number&docType=${type}`);
      if (res.ok) {
        const data = await res.json();
        setDocumentNo(data.nextNo);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchCustomers();
      fetchHistory();
    }
  }, [isAdmin, fetchCustomers, fetchHistory]);

  // Auto-generate number when type changes
  useEffect(() => {
    fetchNextNumber(docType);
  }, [docType, fetchNextNumber]);

  // Customer selection
  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (!customerId) return;
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      setClientName(customer.contactPerson);
      setClientEmail(customer.emailAddress);
      setClientCompany(customer.company);
      setClientAddress(customer.address || "");
    }
  };

  // Line items
  const addLineItem = () => setLineItems([...lineItems, { description: "", qty: 1, unitPrice: 0 }]);
  const removeLineItem = (i: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, idx) => idx !== i));
  };
  const updateLineItem = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    if (field === "description") updated[i].description = value as string;
    else updated[i][field] = Number(value) || 0;
    setLineItems(updated);
  };

  // Transactions
  const addTransaction = () =>
    setTransactions([...transactions, { date: "", description: "", debit: 0, credit: 0, balance: 0 }]);
  const removeTransaction = (i: number) => {
    if (transactions.length <= 1) return;
    setTransactions(transactions.filter((_, idx) => idx !== i));
  };
  const updateTransaction = (i: number, field: keyof Transaction, value: string | number) => {
    const updated = [...transactions];
    if (field === "date" || field === "description") updated[i][field] = value as string;
    else updated[i][field] = Number(value) || 0;
    setTransactions(updated);
  };

  // Report sections
  const addSection = () =>
    setReportSections([...reportSections, { heading: "", content: "" }]);
  const removeSection = (i: number) => {
    if (reportSections.length <= 1) return;
    setReportSections(reportSections.filter((_, idx) => idx !== i));
  };
  const updateSection = (i: number, field: keyof ReportSection, value: string) => {
    const updated = [...reportSections];
    updated[i][field] = value;
    setReportSections(updated);
  };

  // Build document data
  const buildDocData = () => {
    const base = {
      type: docType,
      documentNo,
      title,
      date,
      clientName,
      clientEmail,
      clientCompany,
      clientAddress,
      notes,
    };

    if (docType === "INVOICE" || docType === "QUOTE") {
      return {
        ...base,
        dueDate: docType === "INVOICE" ? dueDate : undefined,
        validUntil: docType === "QUOTE" ? validUntil : undefined,
        lineItems,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        amountPaid: docType === "INVOICE" ? amountPaid : undefined,
        balanceDue: docType === "INVOICE" ? balanceDue : undefined,
      };
    }

    if (docType === "STATEMENT") {
      return {
        ...base,
        statementPeriod,
        openingBalance,
        closingBalance,
        transactions,
      };
    }

    // Report
    return {
      ...base,
      reportSections,
    };
  };

  // Preview PDF (client-side)
  const handlePreview = async () => {
    setPreviewing(true);
    setErrorMsg("");
    try {
      const { generateDocumentPdf } = await import("@/lib/pdf-generator");
      const arrayBuffer = generateDocumentPdf(buildDocData());
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setErrorMsg("Failed to generate preview: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setPreviewing(false);
  };

  // Download PDF (client-side)
  const handleDownload = async () => {
    setPreviewing(true);
    setErrorMsg("");
    try {
      const { generateDocumentPdf } = await import("@/lib/pdf-generator");
      const arrayBuffer = generateDocumentPdf(buildDocData());
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docType.toLowerCase()}-${documentNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg("Failed to download: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setPreviewing(false);
  };

  // Send via email (server-side)
  const handleSend = async () => {
    if (!clientEmail) {
      setErrorMsg("Client email is required to send");
      return;
    }
    if (!clientName) {
      setErrorMsg("Client name is required");
      return;
    }
    setSending(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/send-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildDocData(),
          sendViaEmail: true,
          emailSubject: emailSubject || undefined,
          emailMessage: emailMessage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccessMsg(`${docType} #${documentNo} sent to ${clientEmail}`);
      fetchHistory();
      fetchNextNumber(docType);
      // Reset form
      setTitle("");
      setNotes("");
      setEmailSubject("");
      setEmailMessage("");
      setLineItems([{ description: "", qty: 1, unitPrice: 0 }]);
      setTransactions([{ date: "", description: "", debit: 0, credit: 0, balance: 0 }]);
      setReportSections([{ heading: "", content: "" }]);
      setAmountPaid(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send");
    }
    setSending(false);
  };

  // Reset form on type change
  const handleTypeChange = (type: DocType) => {
    setDocType(type);
    setTitle("");
    setDueDate("");
    setValidUntil("");
    setStatementPeriod("");
    setOpeningBalance(0);
    setNotes("");
    setLineItems([{ description: "", qty: 1, unitPrice: 0 }]);
    setTransactions([{ date: "", description: "", debit: 0, credit: 0, balance: 0 }]);
    setReportSections([{ heading: "", content: "" }]);
    setAmountPaid(0);
    setEmailSubject("");
    setEmailMessage("");
    setSuccessMsg("");
    setErrorMsg("");
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch) return sentDocs;
    const q = historySearch.toLowerCase();
    return sentDocs.filter(
      (d) =>
        d.documentNo.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.clientEmail.toLowerCase().includes(q) ||
        (d.clientCompany || "").toLowerCase().includes(q) ||
        d.documentType.toLowerCase().includes(q)
    );
  }, [sentDocs, historySearch]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Send Documents</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Create and send custom PDF invoices, quotes, statements, and reports to clients via email
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
        <nav className="flex gap-6">
          {[
            { key: "create" as const, label: "Create Document", icon: <FileText size={16} /> },
            { key: "history" as const, label: "Sent History", icon: <Clock size={16} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center justify-between">
          {successMsg}
          <button onClick={() => setSuccessMsg("")} className="ml-2" title="Dismiss"><X size={14} /></button>
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          {errorMsg}
          <button onClick={() => setErrorMsg("")} className="ml-2" title="Dismiss"><X size={14} /></button>
        </div>
      )}

      {/* ── CREATE TAB ── */}
      {activeTab === "create" && (
        <div className="space-y-6">
          {/* Document type selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => handleTypeChange(dt.value)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition font-medium text-sm ${
                  docType === dt.value
                    ? `border-${dt.color}-500 bg-${dt.color}-50 text-${dt.color}-700 dark:bg-${dt.color}-900/20 dark:text-${dt.color}-300 dark:border-${dt.color}-500`
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {dt.icon}
                {dt.label}
              </button>
            ))}
          </div>

          {/* Main form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            {/* Document details + Client info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Left: Document details */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  Document Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Document No.
                    </label>
                    <input
                      type="text"
                      value={documentNo}
                      onChange={(e) => setDocumentNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Title / Subject
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`e.g. ${docType === "INVOICE" ? "Website Development" : docType === "QUOTE" ? "Hosting Package Proposal" : docType === "STATEMENT" ? "Account Statement - January 2025" : "Monthly Performance Report"}`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {docType === "INVOICE" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
                {docType === "QUOTE" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Valid Until
                    </label>
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
                {docType === "STATEMENT" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Statement Period
                    </label>
                    <input
                      type="text"
                      value={statementPeriod}
                      onChange={(e) => setStatementPeriod(e.target.value)}
                      placeholder="e.g. 1 Jan — 31 Jan 2025"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Right: Client info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  Client Details
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Select Customer
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— Manual entry —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company} ({c.contactPerson})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Client Name *
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Client Email *
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={clientCompany}
                    onChange={(e) => setClientCompany(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Address
                  </label>
                  <textarea
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* ── Line Items (Invoice / Quote) ── */}
            {(docType === "INVOICE" || docType === "QUOTE") && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-3">
                  Line Items
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-gray-700/50">
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-8">#</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Description</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-20">Qty</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-32">Unit Price (R)</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-28">Total (R)</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {lineItems.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(i, "description", e.target.value)}
                              placeholder="Item description"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={item.qty}
                              onChange={(e) => updateLineItem(i, "qty", e.target.value)}
                              min={0}
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                              min={0}
                              step="0.01"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-200">
                            {(item.qty * item.unitPrice).toFixed(2)}
                          </td>
                          <td className="px-1 py-2">
                            {lineItems.length > 1 && (
                              <button
                                onClick={() => removeLineItem(i)}
                                className="p-1 text-red-400 hover:text-red-600 transition"
                                title="Remove line item"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={addLineItem}
                  className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                >
                  <Plus size={14} /> Add Line Item
                </button>

                {/* Totals */}
                <div className="mt-4 flex justify-end">
                  <div className="w-72 space-y-2">
                    <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                      <span>Subtotal</span>
                      <span>R {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center gap-2">
                      <span className="text-slate-600 dark:text-slate-300">VAT</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={taxRate}
                          onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                          className="w-14 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-xs text-right text-slate-800 dark:text-white"
                          min={0}
                          max={100}
                        />
                        <span className="text-slate-400 text-xs">%</span>
                        <span className="ml-2 text-slate-600 dark:text-slate-300">R {taxAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between text-base font-bold text-slate-800 dark:text-white">
                      <span>Total</span>
                      <span>R {totalAmount.toFixed(2)}</span>
                    </div>
                    {docType === "INVOICE" && (
                      <>
                        <div className="flex justify-between text-sm items-center gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Amount Paid</span>
                          <input
                            type="number"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                            className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-right text-slate-800 dark:text-white"
                            min={0}
                            step="0.01"
                          />
                        </div>
                        <div className="flex justify-between text-sm font-semibold text-red-600 dark:text-red-400">
                          <span>Balance Due</span>
                          <span>R {balanceDue.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Transactions (Statement) ── */}
            {docType === "STATEMENT" && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-3">
                  Transactions
                </h3>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Opening Balance (R)
                  </label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                    className="w-40 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-gray-700/50">
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-32">Date</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Description</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-28">Debit (R)</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-28">Credit (R)</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-28">Balance (R)</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {transactions.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                          <td className="px-3 py-1">
                            <input
                              type="date"
                              value={t.date}
                              onChange={(e) => updateTransaction(i, "date", e.target.value)}
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="text"
                              value={t.description}
                              onChange={(e) => updateTransaction(i, "description", e.target.value)}
                              placeholder="Transaction description"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={t.debit}
                              onChange={(e) => updateTransaction(i, "debit", e.target.value)}
                              min={0}
                              step="0.01"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={t.credit}
                              onChange={(e) => updateTransaction(i, "credit", e.target.value)}
                              min={0}
                              step="0.01"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              value={t.balance}
                              onChange={(e) => updateTransaction(i, "balance", e.target.value)}
                              step="0.01"
                              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-transparent text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-1 py-2">
                            {transactions.length > 1 && (
                              <button
                                onClick={() => removeTransaction(i)}
                                className="p-1 text-red-400 hover:text-red-600 transition"
                                title="Remove transaction"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={addTransaction}
                  className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                >
                  <Plus size={14} /> Add Transaction
                </button>
                <div className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Closing Balance: R {closingBalance.toFixed(2)}
                </div>
              </div>
            )}

            {/* ── Report Sections ── */}
            {docType === "REPORT" && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-3">
                  Report Sections
                </h3>
                <div className="space-y-4">
                  {reportSections.map((sec, i) => (
                    <div key={i} className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-gray-700/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400 font-medium">Section {i + 1}</span>
                        {reportSections.length > 1 && (
                          <button
                            onClick={() => removeSection(i)}
                            className="p-1 text-red-400 hover:text-red-600 transition"
                            title="Remove section"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={sec.heading}
                        onChange={(e) => updateSection(i, "heading", e.target.value)}
                        placeholder="Section heading"
                        className="w-full px-3 py-2 mb-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        value={sec.content}
                        onChange={(e) => updateSection(i, "content", e.target.value)}
                        placeholder="Section content..."
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={addSection}
                  className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                >
                  <Plus size={14} /> Add Section
                </button>
              </div>
            )}

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes to appear on the document..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Email options */}
            <div className="mb-6">
              <button
                onClick={() => setShowEmailOptions(!showEmailOptions)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition"
              >
                {showEmailOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Email Options
              </button>
              {showEmailOptions && (
                <div className="mt-3 space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-gray-700/30">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Custom Email Subject
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder={`${docType} #${documentNo} from Global Software Services`}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Custom Email Message
                    </label>
                    <textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      rows={3}
                      placeholder="Custom message to include in the email body (replaces default message)..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handlePreview}
                disabled={previewing || !clientName}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-gray-600 transition text-sm font-medium disabled:opacity-50"
              >
                <Eye size={16} />
                {previewing ? "Generating..." : "Preview PDF"}
              </button>
              <button
                onClick={handleDownload}
                disabled={previewing || !clientName}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-500 transition text-sm font-medium disabled:opacity-50"
              >
                <Download size={16} />
                Download PDF
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !clientName || !clientEmail}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
              >
                <Send size={16} />
                {sending ? "Sending..." : "Send via Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div>
          {/* Search */}
          <div className="mb-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search sent documents..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-800 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                No sent documents found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Doc #</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Title</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Email</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Sent By</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredHistory.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[doc.documentType] || "bg-slate-100 text-slate-700"}`}>
                            {doc.documentType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700 dark:text-slate-200">
                          {doc.documentNo}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200 max-w-[200px] truncate">
                          {doc.title}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                          <div>{doc.clientName}</div>
                          {doc.clientCompany && (
                            <div className="text-xs text-slate-400">{doc.clientCompany}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                          {doc.clientEmail}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-700 dark:text-slate-200">
                          {doc.totalAmount != null
                            ? `R ${Number(doc.totalAmount).toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                          {doc.sentByName || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(doc.sentAt).toLocaleDateString("en-ZA")}{" "}
                          {new Date(doc.sentAt).toLocaleTimeString("en-ZA", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
