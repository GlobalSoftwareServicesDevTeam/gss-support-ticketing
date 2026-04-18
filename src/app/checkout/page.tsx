"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Globe,
  CreditCard,
  Lock,
  Server,
  HardDrive,
  Database,
  Mail,
  Shield,
  User,
  Check,
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
  diskSpace: string | null;
  bandwidth: string | null;
  databases: string | null;
  emailAccounts: string | null;
  emailStorage: string | null;
  sslSupport: boolean;
  phpSupport: boolean;
}

function formatPrice(val: string | number | null | undefined): string {
  if (val == null) return "R0.00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(num) ? "R0.00" : `R${num.toFixed(2)}`;
}

function CheckoutForm() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("product");

  const [step, setStep] = useState(1); // 1=Contact, 2=Domain, 3=Payment
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Contact info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  // Domain
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [domainOption, setDomainOption] = useState<"own" | "register" | "transfer">("own");
  const [domain, setDomain] = useState("");
  const [eppKey, setEppKey] = useState("");

  // Payment
  const [gateway, setGateway] = useState<"PAYFAST" | "OZOW" | "EFT">("PAYFAST");
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    fetch(`/api/hosting/products/public/${productId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setProduct(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId]);

  const hostingPrice = product
    ? billingCycle === "annual" && product.annualPrice
      ? parseFloat(product.annualPrice)
      : parseFloat(product.monthlyPrice)
    : 0;
  const setupFee = product ? parseFloat(product.setupFee) || 0 : 0;
  const totalAmount = hostingPrice + setupFee;

  const features: string[] = (() => {
    try {
      return product?.features ? JSON.parse(product.features) : [];
    } catch {
      return [];
    }
  })();

  function cleanDomain(raw: string) {
    return raw.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
  }

  function nextStep() {
    setError("");
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
        setError("Please fill in all required contact fields.");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError("Please enter a valid email address.");
        return;
      }
    }
    if (step === 2) {
      if (!domain.trim()) {
        setError("Please enter your domain name.");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  async function handleCheckout() {
    if (!product) return;
    if (!acceptTerms) {
      setError("Please accept the terms of service to continue.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/hosting/checkout/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          company,
          productId: product.id,
          billingCycle,
          domainOption,
          domain: cleanDomain(domain),
          eppKey: domainOption === "transfer" ? eppKey : undefined,
          gateway,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Checkout failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);

      // Handle gateway redirect
      if (data.gateway === "PAYFAST" && data.redirect) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.redirect.url;
        const fields = data.redirect.params as Record<string, string>;
        for (const [key, value] of Object.entries(fields)) {
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
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.redirect.url;
        const fields = data.redirect.params as Record<string, string>;
        for (const [key, value] of Object.entries(fields)) {
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

      // EFT — show success, don't redirect
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-50 py-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Product Not Found</h1>
            <p className="text-slate-500 mb-6">
              The hosting package you selected is not available.
            </p>
            <a
              href="https://globalsoftwareservices.co.za/hosting"
              className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              View Hosting Plans
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success && gateway === "EFT") {
    return (
      <div className="min-h-screen bg-slate-50 py-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10">
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Order Received!</h1>
            <p className="text-slate-600 mb-2">
              Thank you, {firstName}! Your hosting order for <strong>{domain}</strong> has
              been received.
            </p>
            <p className="text-slate-500 text-sm mb-6">
              Please complete your EFT payment using our bank details. Your hosting will be
              provisioned once payment is confirmed. Check your email for details.
            </p>
            <div className="bg-slate-50 rounded-lg p-4 text-left text-sm mb-6 space-y-1">
              <p className="font-semibold text-slate-700">EFT Banking Details</p>
              <p className="text-slate-600">Bank: <span className="font-medium">FNB</span></p>
              <p className="text-slate-600">Account: <span className="font-medium">Global Software Services</span></p>
              <p className="text-slate-600">Reference: <span className="font-medium">{email}</span></p>
              <p className="text-slate-600">Amount: <span className="font-medium text-blue-700">{formatPrice(totalAmount)}</span></p>
            </div>
            <a
              href="https://support.globalsoftwareservices.co.za/login"
              className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Access Your Account
            </a>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Contact" },
    { num: 2, label: "Domain" },
    { num: 3, label: "Payment" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="https://globalsoftwareservices.co.za" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Global Software Services"
              width={140}
              height={40}
              className="h-8 w-auto"
              unoptimized
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="font-bold text-slate-800 text-lg hidden sm:block">
              Global Software Services
            </span>
          </a>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Lock className="h-4 w-4 text-green-500" />
            Secure Checkout
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition ${
                    step > s.num
                      ? "bg-green-500 text-white"
                      : step === s.num
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {step > s.num ? <Check size={14} /> : s.num}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    step >= s.num ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    step > s.num ? "bg-green-500" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* ── Form Panel ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">

              {error && (
                <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* ─── Step 1: Contact Info ─── */}
              {step === 1 && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Contact Information</h2>
                      <p className="text-sm text-slate-500">We&apos;ll use this to set up your account</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Smith"
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        A client account will be created with this email
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+27 81 234 5678"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Company <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Acme Pty Ltd"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={nextStep}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ─── Step 2: Domain ─── */}
              {step === 2 && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Domain & Billing</h2>
                      <p className="text-sm text-slate-500">Set up your domain name</p>
                    </div>
                  </div>

                  {/* Billing Cycle */}
                  {product.annualPrice && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Billing Cycle
                      </label>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {[
                          {
                            value: "monthly" as const,
                            label: "Monthly",
                            price: formatPrice(product.monthlyPrice),
                            sub: "per month",
                          },
                          {
                            value: "annual" as const,
                            label: "Annual",
                            price: formatPrice(product.annualPrice),
                            sub: "per year",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setBillingCycle(opt.value)}
                            className={`flex items-center justify-between p-4 rounded-xl border-2 text-left transition ${
                              billingCycle === opt.value
                                ? "border-blue-600 bg-blue-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <span className="font-medium text-slate-800">{opt.label}</span>
                            <div className="text-right">
                              <span className="block font-bold text-blue-700">{opt.price}</span>
                              <span className="text-xs text-slate-400">{opt.sub}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Domain Option */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Domain Option
                    </label>
                    <div className="space-y-2">
                      {[
                        { value: "own" as const, label: "I already have a domain", sub: "Connect your existing domain" },
                        { value: "register" as const, label: "Register a new domain", sub: "We'll help you register it" },
                        { value: "transfer" as const, label: "Transfer my domain", sub: "Move your domain to us" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition ${
                            domainOption === opt.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="domainOption"
                            value={opt.value}
                            checked={domainOption === opt.value}
                            onChange={() => setDomainOption(opt.value)}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div>
                            <span className="block text-sm font-medium text-slate-800">{opt.label}</span>
                            <span className="block text-xs text-slate-400">{opt.sub}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Domain Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Domain Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder={
                        domainOption === "register"
                          ? "e.g. mybusiness.co.za"
                          : "e.g. example.co.za"
                      }
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {domainOption === "transfer" && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        EPP Key / Transfer Code
                      </label>
                      <input
                        type="text"
                        value={eppKey}
                        onChange={(e) => setEppKey(e.target.value)}
                        placeholder="EPP / Authorization code from your current registrar"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => setStep(1)}
                      className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition text-sm font-medium"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      onClick={nextStep}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ─── Step 3: Payment ─── */}
              {step === 3 && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Payment Method</h2>
                      <p className="text-sm text-slate-500">Choose how you&apos;d like to pay</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {[
                      {
                        value: "PAYFAST" as const,
                        label: "PayFast",
                        sub: "Credit card, debit card, EFT, Instant EFT",
                        icon: "💳",
                      },
                      {
                        value: "OZOW" as const,
                        label: "Ozow",
                        sub: "Instant EFT from your bank",
                        icon: "🏦",
                      },
                      {
                        value: "EFT" as const,
                        label: "Manual EFT / Bank Transfer",
                        sub: "Pay directly into our bank account",
                        icon: "🏧",
                      },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition ${
                          gateway === opt.value
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="gateway"
                          value={opt.value}
                          checked={gateway === opt.value}
                          onChange={() => setGateway(opt.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-xl">{opt.icon}</span>
                        <div>
                          <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                          <span className="block text-xs text-slate-400">{opt.sub}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Terms */}
                  <div className="mb-6">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-blue-600 rounded"
                      />
                      <span className="text-sm text-slate-600">
                        I agree to the{" "}
                        <a
                          href="https://globalsoftwareservices.co.za/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          terms of service
                        </a>{" "}
                        and{" "}
                        <a
                          href="https://globalsoftwareservices.co.za/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          privacy policy
                        </a>
                      </span>
                    </label>
                  </div>

                  {success && (
                    <div className="mb-6 flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                      <span>Order created! Redirecting to payment gateway...</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition text-sm font-medium"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      onClick={handleCheckout}
                      disabled={submitting || !acceptTerms}
                      className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          Complete Order
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Order Summary ── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Order Summary</h3>

              {/* Product Info */}
              <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Server className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{product.name}</p>
                  {product.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{product.description}</p>
                  )}
                </div>
              </div>

              {/* Specs */}
              <div className="py-4 space-y-2 border-b border-slate-100">
                {product.diskSpace && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                    {product.diskSpace} Storage
                  </div>
                )}
                {product.bandwidth && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    {product.bandwidth} Bandwidth
                  </div>
                )}
                {product.databases && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Database className="h-3.5 w-3.5 text-slate-400" />
                    {product.databases} Databases
                  </div>
                )}
                {product.emailAccounts && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    {product.emailAccounts} Email Accounts
                  </div>
                )}
                {product.sslSupport && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Shield className="h-3.5 w-3.5 text-green-500" />
                    Free SSL Certificate
                  </div>
                )}
              </div>

              {/* Features */}
              {features.length > 0 && (
                <div className="py-4 border-b border-slate-100">
                  <ul className="space-y-1.5">
                    {features.slice(0, 5).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Price Breakdown */}
              <div className="py-4 space-y-2 border-b border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    {billingCycle === "annual" && product.annualPrice ? "Annual price" : "Monthly price"}
                  </span>
                  <span className="text-slate-800">
                    {billingCycle === "annual" && product.annualPrice
                      ? formatPrice(product.annualPrice)
                      : formatPrice(product.monthlyPrice)}
                  </span>
                </div>
                {setupFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Setup fee</span>
                    <span className="text-slate-800">{formatPrice(setupFee)}</span>
                  </div>
                )}
                {domain && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Domain</span>
                    <span className="text-slate-600 font-medium">{cleanDomain(domain) || domain}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4">
                <span className="font-bold text-slate-900">Total</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatPrice(totalAmount)}
                </span>
              </div>

              <p className="text-xs text-slate-400 text-center mt-3">
                Prices exclude VAT. All prices in ZAR.
              </p>

              {/* Security badges */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-center gap-4">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Lock className="h-3 w-3" />
                  SSL Secured
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Shield className="h-3 w-3" />
                  Safe Checkout
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <CheckoutForm />
    </Suspense>
  );
}
