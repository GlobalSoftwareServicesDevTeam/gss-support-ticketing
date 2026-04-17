"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Server, Globe, ArrowLeft, ArrowRight, ShoppingCart, CreditCard,
  Search, Check, X, Loader2, HardDrive, Database, Mail, Shield,
  AlertTriangle, ExternalLink, RefreshCw,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  type: string;
  description: string | null;
  monthlyPrice: string;
  annualPrice: string | null;
  setupFee: string;
  features: string | null;
  pleskPlanName: string | null;
  diskSpace: string | null;
  bandwidth: string | null;
  databases: string | null;
  emailAccounts: string | null;
  emailStorage: string | null;
  sslSupport: boolean;
  phpSupport: boolean;
  isActive: boolean;
}

interface DomainResult {
  domain: string;
  tld: string;
  available: boolean;
  registered: boolean;
  price: number | null;
  productId: string | null;
  productName: string | null;
  message: string;
}

// ─── Helpers ────────────────────────────────────────────

function formatPrice(val: string | number | null | undefined): string {
  if (val == null) return "R0.00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  return `R${num.toFixed(2)}`;
}

// ─── Component ──────────────────────────────────────────

export default function HostingOrderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("product");

  // Step state: 1=Package, 2=Domain, 3=Review, 4=Payment
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // Product state
  const [product, setProduct] = useState<Product | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  // Domain state
  const [domainOption, setDomainOption] = useState<"own" | "register" | "transfer">("own");
  const [domainInput, setDomainInput] = useState("");
  const [domainResults, setDomainResults] = useState<DomainResult[]>([]);
  const [domainChecking, setDomainChecking] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<{
    domain: string;
    price: number;
    productId: string | null;
  } | null>(null);
  const [eppKey, setEppKey] = useState("");

  // Payment state
  const [gateway, setGateway] = useState<"PAYFAST" | "OZOW" | "EFT">("PAYFAST");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load the selected product
  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    fetch("/api/hosting/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Product[]) => {
        const found = products.find((p) => p.id === productId && p.type === "HOSTING");
        setProduct(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId]);

  // Check domain availability
  const checkDomain = useCallback(async () => {
    if (!domainInput.trim()) return;
    setDomainChecking(true);
    setDomainResults([]);
    setSelectedDomain(null);
    setError("");
    try {
      const res = await fetch("/api/hosting/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setDomainResults(data.results);
      } else if (res.ok) {
        setDomainResults([
          {
            domain: data.domain,
            tld: "",
            available: data.available,
            registered: !data.available,
            price: null,
            productId: null,
            productName: null,
            message: data.message,
          },
        ]);
      } else {
        setError(data.error || "Failed to check domain");
      }
    } catch {
      setError("Failed to check domain availability");
    }
    setDomainChecking(false);
  }, [domainInput]);

  // Submit checkout
  async function handleCheckout() {
    if (!product || !selectedDomain) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/hosting/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          billingCycle,
          domainOption,
          domain: selectedDomain.domain,
          domainProductId: selectedDomain.productId || undefined,
          eppKey: domainOption === "transfer" ? eppKey : undefined,
          gateway,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Checkout failed");
        setSubmitting(false);
        return;
      }

      // Handle gateway redirect
      if (data.gateway === "PAYFAST" && data.redirect) {
        // PayFast returns form data - need to submit a form
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.redirect.action;
        for (const [key, value] of Object.entries(data.redirect.fields as Record<string, string>)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }

      if (data.gateway === "OZOW" && data.redirect) {
        window.location.href = data.redirect.url || data.redirect;
        return;
      }

      // EFT - go to orders page
      router.push("/hosting?tab=orders");
    } catch {
      setError("Checkout failed. Please try again.");
    }
    setSubmitting(false);
  }

  // Confirm domain for "own" or "transfer" option
  function confirmOwnDomain() {
    if (!domainInput.trim()) return;
    const clean = domainInput
      .trim()
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, "");
    setSelectedDomain({ domain: clean, price: 0, productId: null });
  }

  // ─── Calculations ─────────────────────────────────────

  const hostingPrice = product
    ? billingCycle === "annual" && product.annualPrice
      ? parseFloat(product.annualPrice)
      : parseFloat(product.monthlyPrice)
    : 0;
  const setupFee = product ? parseFloat(product.setupFee) || 0 : 0;
  const domainPrice = selectedDomain?.price || 0;
  const totalAmount = hostingPrice + setupFee + domainPrice;

  const features = product?.features
    ? (() => {
        try {
          return JSON.parse(product.features!) as string[];
        } catch {
          return [];
        }
      })()
    : [];

  // ─── Loading/Error states ─────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (!productId || !product) {
    return (
      <div className="text-center py-16">
        <Server className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Package Selected</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Please select a hosting package first.</p>
        <a
          href="/hosting-packages"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <ArrowLeft size={16} /> View Packages
        </a>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : router.push("/hosting-packages"))}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          title="Go back"
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Order Hosting</h1>
          <p className="text-sm text-slate-500">{product.name}</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: "Package" },
          { num: 2, label: "Domain" },
          { num: 3, label: "Review & Pay" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition ${
                step >= s.num
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400"
              }`}
            >
              {step > s.num ? <Check size={16} /> : s.num}
            </div>
            <span
              className={`text-sm font-medium ${
                step >= s.num ? "text-slate-900 dark:text-white" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {i < 2 && (
              <div
                className={`flex-1 h-0.5 ${
                  step > s.num ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle size={18} />
          {error}
          <button onClick={() => setError("")} className="ml-auto">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ─── Step 1: Package Confirmation ─────────────── */}
      {step === 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Selected Package</h2>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Package details */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Server className="text-blue-600 dark:text-blue-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{product.name}</h3>
                  {product.description && (
                    <p className="text-sm text-slate-500">{product.description}</p>
                  )}
                </div>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-3">
                {product.diskSpace && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <HardDrive size={14} className="text-blue-500" />
                    <strong>{product.diskSpace}</strong> Disk
                  </div>
                )}
                {product.bandwidth && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Globe size={14} className="text-blue-500" />
                    <strong>{product.bandwidth}</strong> Bandwidth
                  </div>
                )}
                {product.emailAccounts && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Mail size={14} className="text-blue-500" />
                    <strong>{product.emailAccounts}</strong> Emails
                  </div>
                )}
                {product.databases && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Database size={14} className="text-blue-500" />
                    <strong>{product.databases}</strong> DBs
                  </div>
                )}
                {product.sslSupport && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Shield size={14} className="text-green-500" />
                    Free SSL
                  </div>
                )}
              </div>

              {features.length > 0 && (
                <ul className="space-y-1.5">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Check size={14} className="text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Pricing */}
            <div className="w-full md:w-72 space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Billing Cycle
              </label>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                    billingCycle === "monthly"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="billing"
                    checked={billingCycle === "monthly"}
                    onChange={() => setBillingCycle("monthly")}
                    className="accent-blue-600"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Monthly — {formatPrice(product.monthlyPrice)}
                    </div>
                    <div className="text-xs text-slate-500">Billed every month</div>
                  </div>
                </label>
                {product.annualPrice && parseFloat(product.annualPrice) > 0 && (
                  <label
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      billingCycle === "annual"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="billing"
                      checked={billingCycle === "annual"}
                      onChange={() => setBillingCycle("annual")}
                      className="accent-blue-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        Annual — {formatPrice(product.annualPrice)}
                        <span className="ml-2 text-xs text-green-600 font-semibold">
                          Save{" "}
                          {formatPrice(
                            parseFloat(product.monthlyPrice) * 12 -
                              parseFloat(product.annualPrice!)
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">Billed once a year</div>
                    </div>
                  </label>
                )}
              </div>

              {setupFee > 0 && (
                <p className="text-xs text-slate-500">
                  + {formatPrice(product.setupFee)} one-time setup fee
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <a
              href="/hosting-packages"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
            >
              <ArrowLeft size={16} /> Change Package
            </a>
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Domain Selection ─────────────────── */}
      {step === 2 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Choose Your Domain</h2>

          {/* Domain option tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              {
                key: "register" as const,
                label: "Register New Domain",
                desc: "Search and purchase a new domain name",
                icon: <Globe size={20} />,
              },
              {
                key: "transfer" as const,
                label: "Transfer Domain",
                desc: "Transfer your domain from another registrar",
                icon: <RefreshCw size={20} />,
              },
              {
                key: "own" as const,
                label: "I Have a Domain",
                desc: "Use a domain you already own",
                icon: <ExternalLink size={20} />,
              },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setDomainOption(opt.key);
                  setSelectedDomain(null);
                  setDomainResults([]);
                  setDomainInput("");
                  setError("");
                }}
                className={`text-left p-4 border rounded-xl transition ${
                  domainOption === opt.key
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                }`}
              >
                <div className={`mb-2 ${domainOption === opt.key ? "text-blue-600" : "text-slate-400"}`}>
                  {opt.icon}
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Register new domain */}
          {domainOption === "register" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkDomain()}
                  placeholder="Search for a domain name, e.g. mybusiness"
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                />
                <button
                  onClick={checkDomain}
                  disabled={domainChecking || !domainInput.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
                >
                  {domainChecking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Search
                </button>
              </div>

              {/* Domain results */}
              {domainResults.length > 0 && (
                <div className="space-y-2">
                  {domainResults.map((r) => (
                    <div
                      key={r.domain}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        r.available
                          ? selectedDomain?.domain === r.domain
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : "border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/10 cursor-pointer"
                          : "border-slate-200 dark:border-slate-700 opacity-60"
                      }`}
                      onClick={() =>
                        r.available &&
                        setSelectedDomain({
                          domain: r.domain,
                          price: r.price || 0,
                          productId: r.productId,
                        })
                      }
                    >
                      <div className="flex items-center gap-3">
                        {r.available ? (
                          <Check size={18} className="text-green-600" />
                        ) : (
                          <X size={18} className="text-red-500" />
                        )}
                        <div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {r.domain}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {r.available ? "Available" : "Taken"}
                          </span>
                        </div>
                      </div>
                      {r.available && r.price != null && r.price > 0 && (
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatPrice(r.price)}/yr
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transfer domain */}
          {domainOption === "transfer" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Domain to Transfer
                </label>
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="e.g. mydomain.co.za"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  EPP / Authorization Key
                  <span className="text-slate-400 font-normal ml-1">(optional — get from current registrar)</span>
                </label>
                <input
                  type="text"
                  value={eppKey}
                  onChange={(e) => setEppKey(e.target.value)}
                  placeholder="EPP key for domain transfer"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                />
              </div>
              <button
                onClick={() => {
                  if (!domainInput.trim()) return;
                  // Check if there's a transfer fee based on TLD
                  const clean = domainInput.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
                  // Check for matching transfer product
                  fetch("/api/hosting/products")
                    .then((r) => r.ok ? r.json() : [])
                    .then((products: Product[]) => {
                      const domainProducts = products.filter((p) => p.type === "DOMAIN" && p.isActive);
                      const tld = clean.includes(".") ? clean.substring(clean.indexOf(".")) : "";
                      const matchingProduct = domainProducts.find((p) => {
                        const productTld = p.name.match(/(\.[a-z.]+)/i);
                        return productTld && productTld[1].toLowerCase() === tld.toLowerCase();
                      });
                      setSelectedDomain({
                        domain: clean,
                        price: matchingProduct ? parseFloat(matchingProduct.monthlyPrice) : 0,
                        productId: matchingProduct?.id || null,
                      });
                    })
                    .catch(() => {
                      setSelectedDomain({ domain: clean, price: 0, productId: null });
                    });
                }}
                disabled={!domainInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw size={16} />
                Confirm Transfer
              </button>
              {selectedDomain && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <Check size={18} className="text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {selectedDomain.domain}
                    </span>
                    {selectedDomain.price > 0 ? (
                      <span className="text-sm text-slate-600 dark:text-slate-400 ml-2">
                        Transfer fee: {formatPrice(selectedDomain.price)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 ml-2">No transfer fee</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Use own domain */}
          {domainOption === "own" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Your Domain Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmOwnDomain()}
                    placeholder="e.g. mydomain.co.za"
                    className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                  />
                  <button
                    onClick={confirmOwnDomain}
                    disabled={!domainInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
                  >
                    <Check size={16} /> Use This Domain
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  You&apos;ll need to point your domain&apos;s DNS to our nameservers after setup.
                </p>
              </div>
              {selectedDomain && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <Check size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedDomain.domain}
                  </span>
                  <span className="text-xs text-green-700 dark:text-green-400">No additional cost</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={() => {
                if (!selectedDomain) {
                  setError("Please select or enter a domain name");
                  return;
                }
                setStep(3);
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50"
              disabled={!selectedDomain}
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review & Pay ─────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Order Summary */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart size={20} /> Order Summary
            </h2>

            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {/* Hosting line item */}
              <div className="flex justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {product.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedDomain?.domain} — {billingCycle === "annual" ? "Annual" : "Monthly"} billing
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white text-right">
                  {formatPrice(hostingPrice)}
                  <span className="text-xs text-slate-400 font-normal">
                    /{billingCycle === "annual" ? "yr" : "mo"}
                  </span>
                </div>
              </div>

              {/* Setup fee */}
              {setupFee > 0 && (
                <div className="flex justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Setup Fee
                    </div>
                    <div className="text-xs text-slate-500">One-time</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatPrice(setupFee)}
                  </div>
                </div>
              )}

              {/* Domain line item */}
              {domainOption !== "own" && domainPrice > 0 && (
                <div className="flex justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {domainOption === "register" ? "Domain Registration" : "Domain Transfer"}
                    </div>
                    <div className="text-xs text-slate-500">{selectedDomain?.domain}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatPrice(domainPrice)}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between py-4">
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  Total Due Today
                </div>
                <div className="text-lg font-bold text-blue-600">{formatPrice(totalAmount)}</div>
              </div>
            </div>

            {/* Recurring notice */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400">
              After your first payment, your hosting will be automatically billed at{" "}
              <strong>{formatPrice(hostingPrice)}/{billingCycle === "annual" ? "year" : "month"}</strong>{" "}
              until you cancel.
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard size={20} /> Payment Method
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { key: "PAYFAST" as const, label: "PayFast", desc: "Credit/Debit Card or Instant EFT" },
                { key: "OZOW" as const, label: "Ozow", desc: "Instant EFT via bank app" },
                { key: "EFT" as const, label: "Manual EFT", desc: "Bank transfer (manual confirmation)" },
              ] as const).map((g) => (
                <label
                  key={g.key}
                  className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition ${
                    gateway === g.key
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="gateway"
                    checked={gateway === g.key}
                    onChange={() => setGateway(g.key)}
                    className="accent-blue-600 mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{g.label}</div>
                    <div className="text-xs text-slate-500">{g.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={handleCheckout}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ShoppingCart size={18} />
              )}
              {gateway === "EFT" ? "Place Order" : `Pay ${formatPrice(totalAmount)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
