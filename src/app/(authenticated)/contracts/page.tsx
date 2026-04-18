"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/components/signature-pad";
import {
  FileText,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Loader2,
  AlertTriangle,
  Shield,
} from "lucide-react";

interface CustomerInfo {
  id: string;
  company: string;
  contactPerson: string;
  emailAddress: string;
  address: string;
  vatNumber: string;
  regNumber: string;
}

interface ContactInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
}

interface Contract {
  id: string;
  contractType: string;
  status: string;
  signedAt: string | null;
  skippedAt: string | null;
}

type ContractType = "NDA" | "WEBSITE_DESIGN" | "SOFTWARE_DEVELOPMENT" | "MAINTENANCE";

interface FormFields {
  clientCompany: string;
  clientRepName: string;
  clientRepTitle: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  clientRegNumber: string;
  clientVatNumber: string;
  effectiveDate: string;
  projectDescription: string;
  projectTimeline: string;
  projectCost: string;
  maintenanceMonthlyFee: string;
  maintenanceStartDate: string;
}

const CONTRACT_LABELS: Record<ContractType, string> = {
  NDA: "Mutual Non-Disclosure Agreement",
  WEBSITE_DESIGN: "Website Design Agreement",
  SOFTWARE_DEVELOPMENT: "Software Development Agreement",
  MAINTENANCE: "Software Maintenance Agreement",
};

const GSS_INFO = {
  company: "Global Software Services",
  representative: "Nathan Avis",
  title: "Director",
  address: "7 Kromiet Avenue, Waldrift, Vereeniging, 1939",
  email: "nathan@globalsoftwareservices.co.za",
  phone: "071 680 9898",
};

export default function ContractSigningPage() {
  const { update: updateSession } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [step, setStep] = useState<"nda" | "choose" | "sign-selected" | "done">("nda");
  const [selectedTypes, setSelectedTypes] = useState<ContractType[]>([]);
  const [currentSigningType, setCurrentSigningType] = useState<ContractType>("NDA");
  const [signature, setSignature] = useState<string>("");
  const [formFields, setFormFields] = useState<FormFields>({
    clientCompany: "",
    clientRepName: "",
    clientRepTitle: "",
    clientAddress: "",
    clientEmail: "",
    clientPhone: "",
    clientRegNumber: "",
    clientVatNumber: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    projectDescription: "",
    projectTimeline: "",
    projectCost: "",
    maintenanceMonthlyFee: "",
    maintenanceStartDate: "",
  });
  const [error, setError] = useState("");
  const [signedInSession, setSignedInSession] = useState<string[]>([]);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts");
      if (!res.ok) return;
      const data = await res.json();
      setContracts(data.contracts || []);
      setCustomer(data.customer || null);
      setContact(data.contact || null);

      // Pre-fill form fields from customer/contact data
      if (data.customer || data.contact) {
        setFormFields((prev) => ({
          ...prev,
          clientCompany: data.customer?.company || prev.clientCompany,
          clientRepName: data.contact
            ? `${data.contact.firstName} ${data.contact.lastName}`
            : prev.clientRepName,
          clientRepTitle: data.contact?.position || prev.clientRepTitle,
          clientAddress: data.customer?.address || prev.clientAddress,
          clientEmail: data.contact?.email || data.customer?.emailAddress || prev.clientEmail,
          clientPhone: data.contact?.phone || prev.clientPhone,
          clientRegNumber: data.customer?.regNumber || prev.clientRegNumber,
          clientVatNumber: data.customer?.vatNumber || prev.clientVatNumber,
        }));
      }

      // Determine starting step
      const signedTypes = (data.contracts || [])
        .filter((c: Contract) => c.status === "SIGNED")
        .map((c: Contract) => c.contractType);

      if (!signedTypes.includes("NDA")) {
        setStep("nda");
        setCurrentSigningType("NDA");
      } else {
        // Check if they've signed or skipped all optional ones
        const optionalDone = ["WEBSITE_DESIGN", "SOFTWARE_DEVELOPMENT", "MAINTENANCE"].every(
          (t) =>
            signedTypes.includes(t) ||
            (data.contracts || []).some(
              (c: Contract) => c.contractType === t && c.status === "SKIPPED"
            )
        );
        if (optionalDone) {
          setStep("done");
        } else {
          setStep("choose");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleFieldChange = (field: keyof FormFields, value: string) => {
    setFormFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleSign = async () => {
    if (!signature) {
      setError("Please provide your signature");
      return;
    }

    // Validate required fields based on contract type
    if (!formFields.clientCompany || !formFields.clientRepName || !formFields.effectiveDate) {
      setError("Please fill in all required fields");
      return;
    }

    setSigning(true);
    setError("");

    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: currentSigningType,
          formData: formFields,
          signature,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to sign contract");
        return;
      }

      setSignedInSession((prev) => [...prev, currentSigningType]);
      setSignature("");

      if (currentSigningType === "NDA") {
        setStep("choose");
      } else {
        // Move to next selected contract or done
        const remaining = selectedTypes.filter(
          (t) => t !== currentSigningType && !signedInSession.includes(t)
        );
        if (remaining.length > 0) {
          setCurrentSigningType(remaining[0]);
        } else {
          // Skip any unselected optional contracts
          const skippable = (["WEBSITE_DESIGN", "SOFTWARE_DEVELOPMENT", "MAINTENANCE"] as ContractType[]).filter(
            (t) => !selectedTypes.includes(t) && !signedInSession.includes(t) && t !== currentSigningType
          );
          if (skippable.length > 0) {
            await fetch("/api/contracts/skip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contractTypes: skippable }),
            });
          }
          setStep("done");
          await updateSession();
        }
      }
    } finally {
      setSigning(false);
    }
  };

  const handleSkipAll = async () => {
    setSigning(true);
    try {
      const skippable = (["WEBSITE_DESIGN", "SOFTWARE_DEVELOPMENT", "MAINTENANCE"] as ContractType[]).filter(
        (t) =>
          !contracts.some((c) => c.contractType === t && c.status === "SIGNED") &&
          !signedInSession.includes(t)
      );
      if (skippable.length > 0) {
        await fetch("/api/contracts/skip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractTypes: skippable }),
        });
      }
      await updateSession();
      router.push("/dashboard");
    } finally {
      setSigning(false);
    }
  };

  const handleProceedWithSelected = () => {
    if (selectedTypes.length === 0) {
      handleSkipAll();
      return;
    }
    setCurrentSigningType(selectedTypes[0]);
    setStep("sign-selected");
  };

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Not a primary contact or no customer
  if (!customer || !contact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Contract signing is only required for primary contacts.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // DONE step
  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            All Contracts Complete
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Thank you for signing your contracts. You can now proceed to your dashboard.
          </p>
          <button
            onClick={handleGoToDashboard}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // CHOOSE step - select which optional contracts to sign
  if (step === "choose") {
    const optionalContracts: { type: ContractType; description: string }[] = [
      {
        type: "WEBSITE_DESIGN",
        description:
          "For website design, development, and related digital services including UI/UX design, responsive web development, and content management systems.",
      },
      {
        type: "SOFTWARE_DEVELOPMENT",
        description:
          "For custom software development including mobile apps, desktop applications, APIs, and enterprise systems.",
      },
      {
        type: "MAINTENANCE",
        description:
          "Optional ongoing software maintenance, support, bug fixes, security updates, and performance monitoring.",
      },
    ];

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-8 h-8 text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                NDA Signed ✓
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Select Service Agreements
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please select the service agreements that apply to your engagement with Global
              Software Services. You can sign these now or skip and come back later.
            </p>

            <div className="space-y-4 mb-8">
              {optionalContracts.map(({ type, description }) => {
                const alreadySigned = contracts.some(
                  (c) => c.contractType === type && c.status === "SIGNED"
                );
                const isSelected = selectedTypes.includes(type);
                return (
                  <label
                    key={type}
                    className={`block p-4 rounded-lg border-2 cursor-pointer transition ${
                      alreadySigned
                        ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                        : isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                        : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        disabled={alreadySigned}
                        checked={alreadySigned || isSelected}
                        onChange={(e) => {
                          if (alreadySigned) return;
                          setSelectedTypes((prev) =>
                            e.target.checked
                              ? [...prev, type]
                              : prev.filter((t) => t !== type)
                          );
                        }}
                        className="mt-1 w-5 h-5 text-blue-600 rounded"
                      />
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          {CONTRACT_LABELS[type]}
                          {alreadySigned && (
                            <span className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 px-2 py-0.5 rounded-full">
                              Signed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {description}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleProceedWithSelected}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
              >
                {selectedTypes.length > 0 ? (
                  <>
                    Sign Selected ({selectedTypes.length})
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Skip for Now
                    <SkipForward className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
            {selectedTypes.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                You&apos;ll receive email reminders every 3 days to complete these agreements
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // NDA or SIGN-SELECTED step - show the contract form
  const isNDA = step === "nda";
  const contractType = isNDA ? "NDA" : currentSigningType;

  const currentIndex = isNDA ? 0 : selectedTypes.indexOf(currentSigningType);
  const totalSigning = isNDA ? 1 : selectedTypes.length;
  const stepLabel = isNDA
    ? "Step 1: Non-Disclosure Agreement (Required)"
    : `Signing ${currentIndex + 1} of ${totalSigning}: ${CONTRACT_LABELS[contractType]}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {stepLabel}
            </span>
            {isNDA && (
              <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded-full">
                Required
              </span>
            )}
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
            <div
              className="h-2 bg-blue-600 rounded-full transition-all"
              style={{
                width: isNDA
                  ? "33%"
                  : `${33 + ((currentIndex + 1) / totalSigning) * 67}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          {/* Contract Header */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-8 py-6">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-white" />
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {CONTRACT_LABELS[contractType]}
                </h1>
                <p className="text-blue-200 text-sm">
                  Between Global Software Services and {formFields.clientCompany || "Your Company"}
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 dark:text-red-300">{error}</span>
              </div>
            )}

            {/* Contract Document Preview */}
            <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              <ContractPreview type={contractType} fields={formFields} />
            </div>

            {/* Form Fields */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Client Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="Company Name *"
                  value={formFields.clientCompany}
                  onChange={(v) => handleFieldChange("clientCompany", v)}
                />
                <FormInput
                  label="Representative Name *"
                  value={formFields.clientRepName}
                  onChange={(v) => handleFieldChange("clientRepName", v)}
                />
                <FormInput
                  label="Title / Position"
                  value={formFields.clientRepTitle}
                  onChange={(v) => handleFieldChange("clientRepTitle", v)}
                />
                <FormInput
                  label="Email Address"
                  value={formFields.clientEmail}
                  onChange={(v) => handleFieldChange("clientEmail", v)}
                  type="email"
                />
                <FormInput
                  label="Phone Number"
                  value={formFields.clientPhone}
                  onChange={(v) => handleFieldChange("clientPhone", v)}
                />
                <FormInput
                  label="Effective Date *"
                  value={formFields.effectiveDate}
                  onChange={(v) => handleFieldChange("effectiveDate", v)}
                  type="date"
                />
                <FormInput
                  label="Company Address"
                  value={formFields.clientAddress}
                  onChange={(v) => handleFieldChange("clientAddress", v)}
                  fullWidth
                />
                <FormInput
                  label="Registration Number"
                  value={formFields.clientRegNumber}
                  onChange={(v) => handleFieldChange("clientRegNumber", v)}
                />
                <FormInput
                  label="VAT Number"
                  value={formFields.clientVatNumber}
                  onChange={(v) => handleFieldChange("clientVatNumber", v)}
                />
              </div>

              {/* Extra fields for service agreements */}
              {contractType !== "NDA" && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                    Project Details
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      label="Project Description"
                      value={formFields.projectDescription}
                      onChange={(v) => handleFieldChange("projectDescription", v)}
                      fullWidth
                    />
                    <FormInput
                      label="Project Timeline"
                      value={formFields.projectTimeline}
                      onChange={(v) => handleFieldChange("projectTimeline", v)}
                      placeholder="e.g. 3 months"
                    />
                    <FormInput
                      label="Project Cost (ZAR)"
                      value={formFields.projectCost}
                      onChange={(v) => handleFieldChange("projectCost", v)}
                      placeholder="e.g. R50,000"
                    />
                    {contractType === "MAINTENANCE" && (
                      <>
                        <FormInput
                          label="Monthly Maintenance Fee (ZAR)"
                          value={formFields.maintenanceMonthlyFee}
                          onChange={(v) => handleFieldChange("maintenanceMonthlyFee", v)}
                          placeholder="e.g. R2,500"
                        />
                        <FormInput
                          label="Maintenance Start Date"
                          value={formFields.maintenanceStartDate}
                          onChange={(v) => handleFieldChange("maintenanceStartDate", v)}
                          type="date"
                        />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Signature */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Signature
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                By signing below, you acknowledge that you have read and agree to the terms of this{" "}
                {CONTRACT_LABELS[contractType]}.
              </p>
              <div className="border-2 border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden inline-block">
                <SignaturePad onSignature={setSignature} width={500} height={200} />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-6">
              <div>
                {!isNDA && step === "sign-selected" && currentIndex > 0 && (
                  <button
                    onClick={() => setCurrentSigningType(selectedTypes[currentIndex - 1])}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isNDA && (
                  <button
                    onClick={handleSkipAll}
                    disabled={signing}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip for Now
                  </button>
                )}
                <button
                  onClick={handleSign}
                  disabled={signing || !signature}
                  className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {signing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Sign {CONTRACT_LABELS[contractType]}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "md:col-span-2" : ""}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

function ContractPreview({ type, fields }: { type: ContractType; fields: FormFields }) {
  const date = fields.effectiveDate
    ? new Date(fields.effectiveDate).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "[Effective Date]";

  const client = fields.clientCompany || "[Client Company]";
  const clientRep = fields.clientRepName || "[Client Representative]";
  const clientTitle = fields.clientRepTitle || "[Title]";
  const clientAddress = fields.clientAddress || "[Client Address]";

  if (type === "NDA") {
    return (
      <div className="space-y-4">
        <h3 className="text-center font-bold text-lg">MUTUAL NON-DISCLOSURE AGREEMENT</h3>
        <p>
          This Mutual Non-Disclosure Agreement (&quot;Agreement&quot;) is entered into as of{" "}
          <strong>{date}</strong> by and between:
        </p>
        <p>
          <strong>Party A:</strong> Global Software Services (Pty) Ltd
          <br />
          Address: {GSS_INFO.address}
          <br />
          Represented by: {GSS_INFO.representative}, {GSS_INFO.title}
        </p>
        <p>
          <strong>Party B:</strong> {client}
          <br />
          Address: {clientAddress}
          <br />
          Represented by: {clientRep}, {clientTitle}
        </p>
        <p className="font-semibold">
          Collectively referred to as the &quot;Parties&quot; and individually as a
          &quot;Party&quot;.
        </p>
        <h4 className="font-bold">1. PURPOSE</h4>
        <p>
          The Parties wish to explore a potential business relationship related to software
          development and IT services. In the course of discussions, each Party may disclose
          Confidential Information to the other. This Agreement is intended to protect the
          confidentiality of such information.
        </p>
        <h4 className="font-bold">2. DEFINITION OF CONFIDENTIAL INFORMATION</h4>
        <p>
          &quot;Confidential Information&quot; means any and all non-public information disclosed by
          one Party to the other, whether in writing, orally, electronically, or by inspection,
          including but not limited to: trade secrets, business plans, source code, algorithms,
          software designs, technical data, customer lists, financial information, marketing
          strategies, and any other proprietary information.
        </p>
        <h4 className="font-bold">3. OBLIGATIONS OF RECEIVING PARTY</h4>
        <p>Each Party agrees to:</p>
        <ul className="list-disc ml-6">
          <li>
            Hold and maintain the other Party&apos;s Confidential Information in strict confidence.
          </li>
          <li>
            Not disclose the Confidential Information to any third parties without prior written
            consent.
          </li>
          <li>
            Use the Confidential Information solely for the purpose of evaluating the potential
            business relationship.
          </li>
          <li>
            Take reasonable measures to protect the secrecy of the Confidential Information, at
            least equal to the measures it takes to protect its own confidential information.
          </li>
        </ul>
        <h4 className="font-bold">4. EXCLUSIONS</h4>
        <p>Confidential Information does not include information that:</p>
        <ul className="list-disc ml-6">
          <li>Was already publicly available at the time of disclosure;</li>
          <li>Becomes publicly available through no fault of the receiving Party;</li>
          <li>
            Was already known to the receiving Party prior to disclosure, as documented by written
            records;
          </li>
          <li>Is independently developed by the receiving Party without use of the disclosing Party&apos;s Confidential Information;</li>
          <li>Is disclosed with the prior written approval of the disclosing Party.</li>
        </ul>
        <h4 className="font-bold">5. TERM</h4>
        <p>
          This Agreement shall remain in effect for a period of two (2) years from the date of
          execution. The obligations of confidentiality shall survive termination of this Agreement.
        </p>
        <h4 className="font-bold">6. RETURN OF INFORMATION</h4>
        <p>
          Upon termination of this Agreement or upon request, each Party shall promptly return or
          destroy all Confidential Information received from the other Party, including all copies.
        </p>
        <h4 className="font-bold">7. REMEDIES</h4>
        <p>
          Each Party acknowledges that any breach of this Agreement may cause irreparable harm and
          that the disclosing Party shall be entitled to seek equitable relief, including injunction
          and specific performance, in addition to all other remedies available at law.
        </p>
        <h4 className="font-bold">8. GOVERNING LAW</h4>
        <p>
          This Agreement shall be governed by and construed in accordance with the laws of the
          Republic of South Africa.
        </p>
        <h4 className="font-bold">9. ENTIRE AGREEMENT</h4>
        <p>
          This Agreement constitutes the entire agreement between the Parties concerning the subject
          matter hereof and supersedes all prior agreements, understandings, and communications.
        </p>
      </div>
    );
  }

  if (type === "WEBSITE_DESIGN") {
    return (
      <div className="space-y-4">
        <h3 className="text-center font-bold text-lg">WEBSITE DESIGN AGREEMENT</h3>
        <p>
          This Website Design Agreement (&quot;Agreement&quot;) is entered into as of{" "}
          <strong>{date}</strong> by and between:
        </p>
        <p>
          <strong>Service Provider:</strong> Global Software Services (Pty) Ltd
          <br />
          Address: {GSS_INFO.address}
        </p>
        <p>
          <strong>Client:</strong> {client}
          <br />
          Address: {clientAddress}
          <br />
          Contact: {clientRep}, {clientTitle}
        </p>
        <h4 className="font-bold">1. SCOPE OF WORK</h4>
        <p>
          The Service Provider agrees to design, develop, and deliver a website for the Client as
          described: <strong>{fields.projectDescription || "[To be defined]"}</strong>
        </p>
        <h4 className="font-bold">2. TIMELINE</h4>
        <p>
          The project is estimated to be completed within:{" "}
          <strong>{fields.projectTimeline || "[To be agreed]"}</strong>
        </p>
        <h4 className="font-bold">3. COMPENSATION</h4>
        <p>
          The Client agrees to pay:{" "}
          <strong>{fields.projectCost || "[To be quoted]"}</strong> as per the invoice
          schedule provided by the Service Provider.
        </p>
        <h4 className="font-bold">4. INTELLECTUAL PROPERTY</h4>
        <p>
          Upon full payment, the Client shall own the design and content of the final website.
          The Service Provider retains ownership of any proprietary tools, frameworks, or
          reusable components used in the development process.
        </p>
        <h4 className="font-bold">5. CLIENT RESPONSIBILITIES</h4>
        <p>
          The Client agrees to provide all required content, images, branding materials, and
          feedback in a timely manner to avoid project delays.
        </p>
        <h4 className="font-bold">6. WARRANTIES</h4>
        <p>
          The Service Provider warrants that the website will be free from material defects for a
          period of 30 days after delivery. Bug fixes during this period are included.
        </p>
        <h4 className="font-bold">7. LIMITATION OF LIABILITY</h4>
        <p>
          The Service Provider&apos;s liability under this Agreement shall not exceed the total amount
          paid by the Client.
        </p>
        <h4 className="font-bold">8. GOVERNING LAW</h4>
        <p>
          This Agreement shall be governed by the laws of the Republic of South Africa.
        </p>
      </div>
    );
  }

  if (type === "SOFTWARE_DEVELOPMENT") {
    return (
      <div className="space-y-4">
        <h3 className="text-center font-bold text-lg">SOFTWARE DEVELOPMENT AGREEMENT</h3>
        <p>
          This Software Development Agreement (&quot;Agreement&quot;) is entered into as of{" "}
          <strong>{date}</strong> by and between:
        </p>
        <p>
          <strong>Developer:</strong> Global Software Services (Pty) Ltd
          <br />
          Address: {GSS_INFO.address}
        </p>
        <p>
          <strong>Client:</strong> {client}
          <br />
          Address: {clientAddress}
          <br />
          Contact: {clientRep}, {clientTitle}
        </p>
        <h4 className="font-bold">1. SCOPE OF DEVELOPMENT</h4>
        <p>
          The Developer agrees to design, develop, test, and deliver software as described:{" "}
          <strong>{fields.projectDescription || "[To be defined]"}</strong>
        </p>
        <h4 className="font-bold">2. PROJECT TIMELINE</h4>
        <p>
          Estimated delivery timeline:{" "}
          <strong>{fields.projectTimeline || "[To be agreed]"}</strong>
        </p>
        <h4 className="font-bold">3. COMPENSATION</h4>
        <p>
          The Client agrees to pay:{" "}
          <strong>{fields.projectCost || "[To be quoted]"}</strong> according to
          milestones and invoices issued by the Developer.
        </p>
        <h4 className="font-bold">4. INTELLECTUAL PROPERTY</h4>
        <p>
          Upon full payment, the Client shall own the custom software developed specifically for
          this project. The Developer retains ownership of all pre-existing code libraries,
          frameworks, tools, and reusable components.
        </p>
        <h4 className="font-bold">5. CONFIDENTIALITY</h4>
        <p>
          Both Parties agree to keep confidential all proprietary information shared during the
          project, subject to the Mutual Non-Disclosure Agreement signed between the Parties.
        </p>
        <h4 className="font-bold">6. TESTING & ACCEPTANCE</h4>
        <p>
          The Client will be given a 14-day acceptance period after delivery to review and test
          the software. Acceptance is deemed given if no written objections are raised within
          this period.
        </p>
        <h4 className="font-bold">7. WARRANTY</h4>
        <p>
          The Developer warrants the software will be free from material defects for 60 days after
          delivery. Bug fixes during this period are included at no additional cost.
        </p>
        <h4 className="font-bold">8. LIMITATION OF LIABILITY</h4>
        <p>
          The Developer&apos;s total liability shall not exceed the total fees paid by the Client
          under this Agreement.
        </p>
        <h4 className="font-bold">9. TERMINATION</h4>
        <p>
          Either Party may terminate this Agreement with 30 days&apos; written notice. The Client
          shall pay for all work completed up to the date of termination.
        </p>
        <h4 className="font-bold">10. GOVERNING LAW</h4>
        <p>
          This Agreement shall be governed by the laws of the Republic of South Africa.
        </p>
      </div>
    );
  }

  if (type === "MAINTENANCE") {
    return (
      <div className="space-y-4">
        <h3 className="text-center font-bold text-lg">SOFTWARE MAINTENANCE AGREEMENT</h3>
        <p>
          This Software Maintenance Agreement (&quot;Agreement&quot;) is entered into as of{" "}
          <strong>{date}</strong> by and between:
        </p>
        <p>
          <strong>Service Provider:</strong> Global Software Services (Pty) Ltd
          <br />
          Address: {GSS_INFO.address}
        </p>
        <p>
          <strong>Client:</strong> {client}
          <br />
          Address: {clientAddress}
          <br />
          Contact: {clientRep}, {clientTitle}
        </p>
        <h4 className="font-bold">1. SCOPE OF MAINTENANCE</h4>
        <p>
          The Service Provider agrees to provide ongoing maintenance and support services for the
          Client&apos;s software, including: bug fixes, security patches, performance optimization,
          minor feature enhancements, and technical support.
        </p>
        <h4 className="font-bold">2. MONTHLY FEE</h4>
        <p>
          The Client agrees to pay a monthly maintenance fee of:{" "}
          <strong>{fields.maintenanceMonthlyFee || "[To be agreed]"}</strong>, payable on
          the first business day of each month.
        </p>
        <h4 className="font-bold">3. COMMENCEMENT</h4>
        <p>
          Maintenance services commence on:{" "}
          <strong>
            {fields.maintenanceStartDate
              ? new Date(fields.maintenanceStartDate).toLocaleDateString("en-ZA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "[Start Date]"}
          </strong>
        </p>
        <h4 className="font-bold">4. RESPONSE TIMES</h4>
        <ul className="list-disc ml-6">
          <li>Critical issues: Response within 4 business hours</li>
          <li>High priority: Response within 8 business hours</li>
          <li>Medium priority: Response within 2 business days</li>
          <li>Low priority: Response within 5 business days</li>
        </ul>
        <h4 className="font-bold">5. EXCLUSIONS</h4>
        <p>
          This Agreement does not cover: new feature development, hardware issues, third-party
          software problems, or issues caused by unauthorized modifications.
        </p>
        <h4 className="font-bold">6. TERMINATION</h4>
        <p>
          Either Party may terminate this Agreement with 30 days&apos; written notice. Outstanding
          fees remain payable.
        </p>
        <h4 className="font-bold">7. GOVERNING LAW</h4>
        <p>
          This Agreement shall be governed by the laws of the Republic of South Africa.
        </p>
      </div>
    );
  }

  return null;
}
