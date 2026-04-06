"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  ShieldCheck,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  RotateCcw,
  Send,
  Eye,
  X,
} from "lucide-react";

interface SslCertificate {
  id: string;
  orderId: string;
  digicertOrderId: number | null;
  productType: string;
  commonName: string;
  sans: string | null;
  status: string;
  validationType: string | null;
  validationStatus: string | null;
  validFrom: string | null;
  validTo: string | null;
  issuedAt: string | null;
  createdAt: string;
  order: {
    id: string;
    domain: string | null;
    status: string;
    amount: string | null;
    userId: string;
    user: { firstName: string | null; lastName: string | null; email: string };
  };
}

const STATUS_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock size={14} /> },
  PENDING_VALIDATION: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: <Clock size={14} /> },
  ISSUED: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 size={14} /> },
  EXPIRED: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400", icon: <AlertTriangle size={14} /> },
  REVOKED: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle size={14} /> },
  REJECTED: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle size={14} /> },
  CANCELLED: { color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400", icon: <XCircle size={14} /> },
};

const DIGICERT_PRODUCTS = [
  { id: "ssl_dv_geotrust", name: "GeoTrust Standard DV SSL", type: "DV" },
  { id: "ssl_dv_rapidssl", name: "RapidSSL Standard DV SSL", type: "DV" },
  { id: "wildcard_dv_geotrust", name: "GeoTrust Wildcard DV SSL", type: "DV" },
  { id: "wildcard_dv_rapidssl", name: "RapidSSL Wildcard DV SSL", type: "DV" },
  { id: "ssl_basic", name: "Basic OV SSL", type: "OV" },
  { id: "ssl_ev_basic", name: "Basic EV SSL", type: "EV" },
  { id: "ssl_securesite", name: "Secure Site SSL", type: "OV" },
  { id: "ssl_ev_securesite", name: "Secure Site EV SSL", type: "EV" },
];

export default function SslCertificatesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [certificates, setCertificates] = useState<SslCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedCert, setSelectedCert] = useState<SslCertificate | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    commonName: "",
    digicertProductId: "ssl_dv_geotrust",
    csr: "",
    privateKey: "",
    sans: "",
    dcvMethod: "dns-txt-token",
    amount: "",
    issueNow: false,
  });

  // Issue form state (for certificates pending CSR)
  const [issueForm, setIssueForm] = useState({
    csr: "",
    dcvMethod: "dns-txt-token",
  });

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ssl/certificates");
      if (res.ok) {
        setCertificates(await res.json());
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const load = async () => { await loadCertificates(); };
    load();
  }, [loadCertificates]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    const product = DIGICERT_PRODUCTS.find((p) => p.id === form.digicertProductId);

    try {
      const res = await fetch("/api/ssl/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commonName: form.commonName.trim(),
          productType: product?.type || "DV",
          digicertProductId: form.digicertProductId,
          csr: form.csr.trim() || undefined,
          privateKey: form.privateKey.trim() || undefined,
          sans: form.sans ? form.sans.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          dcvMethod: form.dcvMethod,
          domain: form.commonName.trim(),
          amount: form.amount || undefined,
          issueNow: form.issueNow,
        }),
      });

      const data = await res.json();
      if (res.ok || res.status === 201) {
        setSuccess(`SSL certificate order created for ${form.commonName}`);
        setShowCreate(false);
        setForm({ commonName: "", digicertProductId: "ssl_dv_geotrust", csr: "", privateKey: "", sans: "", dcvMethod: "dns-txt-token", amount: "", issueNow: false });
        loadCertificates();
      } else {
        setError(data.error || "Failed to create certificate order");
      }
    } catch {
      setError("Failed to create certificate order");
    }
    setCreating(false);
  }

  async function handleIssue(certId: string) {
    setIssuing(certId);
    setError(null);
    try {
      const res = await fetch(`/api/ssl/certificates/${certId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csr: issueForm.csr.trim() || undefined,
          dcvMethod: issueForm.dcvMethod,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Certificate submitted to DigiCert (Order #${data.digicertOrderId})`);
        loadCertificates();
      } else {
        setError(data.error || "Failed to issue certificate");
      }
    } catch {
      setError("Failed to issue certificate");
    }
    setIssuing(null);
  }

  async function handleValidate(certId: string, action: string) {
    setValidating(certId);
    setError(null);
    try {
      const res = await fetch(`/api/ssl/certificates/${certId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Validation ${action} completed`);
        loadCertificates();
      } else {
        setError(data.error || "Validation failed");
      }
    } catch {
      setError("Validation action failed");
    }
    setValidating(null);
  }

  async function handleRevoke(certId: string) {
    if (!confirm("Are you sure you want to revoke this certificate? This cannot be undone.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/ssl/certificates/${certId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Certificate revoked");
        loadCertificates();
      } else {
        setError(data.error || "Failed to revoke");
      }
    } catch {
      setError("Failed to revoke certificate");
    }
  }

  async function handleRefreshStatus(certId: string) {
    try {
      const res = await fetch(`/api/ssl/certificates/${certId}`);
      if (res.ok) {
        loadCertificates();
        setSuccess("Status refreshed");
      }
    } catch {
      /* ignore */
    }
  }

  function StatusBadge({ status }: { status: string }) {
    const style = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.color}`}>
        {style.icon}
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-green-600" size={28} />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SSL Certificates</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            {showCreate ? <X size={16} /> : <Plus size={16} />}
            {showCreate ? "Cancel" : "New Certificate"}
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <XCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto" title="Dismiss"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 size={16} />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto" title="Dismiss"><X size={14} /></button>
        </div>
      )}

      {/* Create Form */}
      {showCreate && isAdmin && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New SSL Certificate Order</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Common Name (Domain) *</label>
              <input
                type="text"
                value={form.commonName}
                onChange={(e) => setForm({ ...form, commonName: e.target.value })}
                placeholder="example.com or *.example.com"
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Certificate Product *</label>
              <select
                value={form.digicertProductId}
                onChange={(e) => setForm({ ...form, digicertProductId: e.target.value })}
                title="Certificate Product"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
              >
                {DIGICERT_PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SANs (Additional Domains)</label>
              <input
                type="text"
                value={form.sans}
                onChange={(e) => setForm({ ...form, sans: e.target.value })}
                placeholder="www.example.com, api.example.com"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">Comma-separated. May incur additional costs.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Validation Method</label>
              <select
                value={form.dcvMethod}
                onChange={(e) => setForm({ ...form, dcvMethod: e.target.value })}
                title="Validation Method"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
              >
                <option value="dns-txt-token">DNS TXT Record</option>
                <option value="dns-cname-token">DNS CNAME Record</option>
                <option value="http-token">HTTP File</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (ZAR)</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CSR (Certificate Signing Request)</label>
            <textarea
              value={form.csr}
              onChange={(e) => setForm({ ...form, csr: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Required to issue the certificate. Can be added later.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Private Key (optional, stored encrypted)</label>
            <textarea
              value={form.privateKey}
              onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="issueNow"
              checked={form.issueNow}
              onChange={(e) => setForm({ ...form, issueNow: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="issueNow" className="text-sm text-slate-700 dark:text-slate-300">
              Issue to DigiCert immediately (skip payment)
            </label>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create Certificate Order
          </button>
        </form>
      )}

      {/* Certificates List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-blue-500" size={24} />
        </div>
      ) : certificates.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <ShieldCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p>No SSL certificates found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{cert.commonName}</h3>
                    <StatusBadge status={cert.status} />
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {cert.productType}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                    {cert.order.user && (
                      <span>Customer: {cert.order.user.firstName} {cert.order.user.lastName} ({cert.order.user.email})</span>
                    )}
                    {cert.digicertOrderId && <span>DigiCert #{cert.digicertOrderId}</span>}
                    {cert.validFrom && cert.validTo && (
                      <span>Valid: {new Date(cert.validFrom).toLocaleDateString()} - {new Date(cert.validTo).toLocaleDateString()}</span>
                    )}
                    {cert.order.amount && <span>Amount: R{parseFloat(cert.order.amount).toFixed(2)}</span>}
                    <span>Created: {new Date(cert.createdAt).toLocaleDateString()}</span>
                    {cert.validationType && <span>DCV: {cert.validationType}</span>}
                  </div>
                  {cert.sans && (
                    <div className="text-xs text-slate-400 mt-1">
                      SANs: {JSON.parse(cert.sans).join(", ")}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {/* Refresh Status */}
                  {cert.digicertOrderId && ["PENDING_VALIDATION", "PENDING"].includes(cert.status) && (
                    <button
                      onClick={() => handleRefreshStatus(cert.id)}
                      className="p-2 text-slate-400 hover:text-blue-600 transition"
                      title="Refresh Status"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}

                  {/* View Details */}
                  <button
                    onClick={() => setSelectedCert(selectedCert?.id === cert.id ? null : cert)}
                    className="p-2 text-slate-400 hover:text-slate-600 transition"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              {/* Expanded Actions */}
              {selectedCert?.id === cert.id && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                  {/* Issue to DigiCert (if not yet issued) */}
                  {isAdmin && !cert.digicertOrderId && cert.status === "PENDING" && (
                    <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Issue to DigiCert</h4>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">CSR (required if not already provided)</label>
                        <textarea
                          value={issueForm.csr}
                          onChange={(e) => setIssueForm({ ...issueForm, csr: e.target.value })}
                          placeholder="-----BEGIN CERTIFICATE REQUEST-----"
                          rows={3}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={issueForm.dcvMethod}
                          onChange={(e) => setIssueForm({ ...issueForm, dcvMethod: e.target.value })}
                          title="DCV Method"
                          className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white"
                        >
                          <option value="dns-txt-token">DNS TXT</option>
                          <option value="dns-cname-token">DNS CNAME</option>
                          <option value="http-token">HTTP File</option>
                          <option value="email">Email</option>
                        </select>
                        <button
                          onClick={() => handleIssue(cert.id)}
                          disabled={issuing === cert.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
                        >
                          {issuing === cert.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          Submit to DigiCert
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Validation Actions */}
                  {isAdmin && cert.digicertOrderId && cert.status === "PENDING_VALIDATION" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleValidate(cert.id, "check")}
                        disabled={validating === cert.id}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                      >
                        {validating === cert.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Check DCV
                      </button>
                      <button
                        onClick={() => handleValidate(cert.id, "resend-email")}
                        disabled={validating === cert.id}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                      >
                        Resend DCV Email
                      </button>
                      <button
                        onClick={() => handleValidate(cert.id, "status")}
                        disabled={validating === cert.id}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50 text-sm"
                      >
                        Validation Status
                      </button>
                    </div>
                  )}

                  {/* Download & Revoke for issued certs */}
                  {cert.status === "ISSUED" && cert.digicertOrderId && (
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/ssl/certificates/${cert.id}/download?format=pem_all`}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                      >
                        <Download size={14} />
                        Download PEM
                      </a>
                      <a
                        href={`/api/ssl/certificates/${cert.id}/download?format=apache`}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition text-sm"
                      >
                        <Download size={14} />
                        Apache Format
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => handleRevoke(cert.id)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                        >
                          <XCircle size={14} />
                          Revoke
                        </button>
                      )}
                    </div>
                  )}

                  {/* Order info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-xs">Order ID</span>
                      <span className="text-slate-900 dark:text-white font-mono text-xs">{cert.orderId.slice(0, 8)}...</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-xs">Order Status</span>
                      <span className="text-slate-900 dark:text-white">{cert.order.status}</span>
                    </div>
                    {cert.issuedAt && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block text-xs">Issued At</span>
                        <span className="text-slate-900 dark:text-white">{new Date(cert.issuedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {cert.validTo && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block text-xs">Expires</span>
                        <span className="text-slate-900 dark:text-white">{new Date(cert.validTo).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
