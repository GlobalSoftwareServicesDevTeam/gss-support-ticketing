"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Server, HardDrive, Globe, Database, Mail, Shield, Code, FolderTree,
  Check, Star, ChevronDown, ChevronUp, Loader2, ShoppingCart,
} from "lucide-react";

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
  ftpAccounts: string | null;
  subdomains: string | null;
  sslSupport: boolean;
  phpSupport: boolean;
  backups: string | null;
  isPopular: boolean;
  sortOrder: number;
}

function formatPrice(val: string | null | undefined): string {
  if (!val) return "R0.00";
  const num = parseFloat(val);
  return `R${num.toFixed(2)}`;
}

export default function HostingPackagesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/hosting/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.filter((p: Product) => p.type === "HOSTING" && parseFloat(p.monthlyPrice) > 0));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const load = async () => { await loadProducts(); };
    load();
  }, [loadProducts]);

  function getPrice(product: Product) {
    if (billingCycle === "annual" && product.annualPrice) {
      return formatPrice(product.annualPrice);
    }
    return formatPrice(product.monthlyPrice);
  }

  function getPricePeriod() {
    return billingCycle === "annual" ? "/year" : "/month";
  }

  function getFeaturesList(product: Product): string[] {
    if (!product.features) return [];
    try {
      return JSON.parse(product.features);
    } catch {
      return [];
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <Server className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Hosting Packages Available</h2>
        <p className="text-slate-500 dark:text-slate-400">Hosting packages are being configured. Please check back soon.</p>
      </div>
    );
  }

  // Determine which have annual pricing
  const hasAnnual = products.some((p) => p.annualPrice && parseFloat(p.annualPrice) > 0);

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Hosting Packages</h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Choose the perfect hosting plan for your website. All plans include SSL, PHP support, and 24/7 monitoring.
        </p>

        {hasAnnual && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
              className={`relative w-12 h-6 rounded-full transition-colors ${billingCycle === "annual" ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
              title="Toggle billing cycle"
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${billingCycle === "annual" ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
            <span className={`text-sm font-medium ${billingCycle === "annual" ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
              Annual
              <span className="ml-1 text-xs text-green-600 font-semibold">Save up to 20%</span>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {products.map((product) => {
          const features = getFeaturesList(product);
          const isExpanded = expandedId === product.id;

          return (
            <div
              key={product.id}
              className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-sm border-2 transition-all hover:shadow-lg ${
                product.isPopular
                  ? "border-blue-500 dark:border-blue-400"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              {product.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                    <Star size={12} /> MOST POPULAR
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Plan Name & Price */}
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{product.name}</h2>
                  {product.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{product.description}</p>
                  )}
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{getPrice(product)}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{getPricePeriod()}</span>
                  </div>
                  {parseFloat(product.setupFee) > 0 && (
                    <p className="text-xs text-slate-400 mt-1">+ {formatPrice(product.setupFee)} setup fee</p>
                  )}
                </div>

                {/* Key Specs */}
                <div className="space-y-3 mb-6">
                  {product.diskSpace && (
                    <div className="flex items-center gap-3 text-sm">
                      <HardDrive size={16} className="text-blue-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.diskSpace}</strong> Disk Space</span>
                    </div>
                  )}
                  {product.bandwidth && (
                    <div className="flex items-center gap-3 text-sm">
                      <Globe size={16} className="text-blue-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.bandwidth}</strong> Bandwidth</span>
                    </div>
                  )}
                  {product.emailAccounts && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail size={16} className="text-blue-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.emailAccounts}</strong> Email Accounts</span>
                    </div>
                  )}
                  {product.emailStorage && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail size={16} className="text-slate-400 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.emailStorage}</strong> per Mailbox</span>
                    </div>
                  )}
                  {product.databases && (
                    <div className="flex items-center gap-3 text-sm">
                      <Database size={16} className="text-blue-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.databases}</strong> Databases</span>
                    </div>
                  )}
                  {product.subdomains && (
                    <div className="flex items-center gap-3 text-sm">
                      <FolderTree size={16} className="text-blue-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.subdomains}</strong> Subdomains</span>
                    </div>
                  )}
                  {product.sslSupport && (
                    <div className="flex items-center gap-3 text-sm">
                      <Shield size={16} className="text-green-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">Free SSL Certificate</span>
                    </div>
                  )}
                  {product.phpSupport && (
                    <div className="flex items-center gap-3 text-sm">
                      <Code size={16} className="text-purple-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">PHP Support</span>
                    </div>
                  )}
                  {product.backups && (
                    <div className="flex items-center gap-3 text-sm">
                      <Server size={16} className="text-orange-500 shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300"><strong>{product.backups}</strong> Backups</span>
                    </div>
                  )}
                </div>

                {/* Additional Features (expandable) */}
                {features.length > 0 && (
                  <div className="mb-6">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : product.id)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? "Hide" : "Show"} {features.length} additional feature{features.length !== 1 ? "s" : ""}
                    </button>
                    {isExpanded && (
                      <ul className="mt-3 space-y-2">
                        {features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <Check size={14} className="text-green-500 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Order Button */}
                <a
                  href={`/hosting?order=${product.id}`}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition ${
                    product.isPopular
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <ShoppingCart size={16} />
                  Get Started
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
