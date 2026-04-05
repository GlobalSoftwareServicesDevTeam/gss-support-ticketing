import crypto from "crypto";

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || "";
const OZOW_API_KEY = process.env.OZOW_API_KEY || "";
const OZOW_IS_TEST = process.env.OZOW_IS_TEST === "true";

const OZOW_PAY_URL = "https://pay.ozow.com";

export function isOzowConfigured(): boolean {
  return !!(OZOW_SITE_CODE && OZOW_PRIVATE_KEY);
}

export interface OzowPaymentData {
  amount: number;
  transactionRef: string;
  bankRef?: string;
  customerEmail?: string;
  isTest?: boolean;
}

export function buildOzowPaymentUrl(data: OzowPaymentData, baseUrl: string) {
  const params: Record<string, string> = {
    SiteCode: OZOW_SITE_CODE,
    CountryCode: "ZA",
    CurrencyCode: "ZAR",
    Amount: data.amount.toFixed(2),
    TransactionReference: data.transactionRef,
    BankReference: data.bankRef || data.transactionRef,
    Optional1: "",
    Optional2: "",
    Optional3: "",
    Optional4: "",
    Optional5: "",
    CancelUrl: `${baseUrl}/payments?result=cancelled`,
    ErrorUrl: `${baseUrl}/payments?result=error`,
    SuccessUrl: `${baseUrl}/payments?result=success`,
    NotifyUrl: `${baseUrl}/api/payments/ozow/notify`,
    IsTest: OZOW_IS_TEST || data.isTest ? "true" : "false",
  };

  // Generate hash: concatenate values in order + private key, then SHA512 lowercase
  const hashInput = [
    params.SiteCode,
    params.CountryCode,
    params.CurrencyCode,
    params.Amount,
    params.TransactionReference,
    params.BankReference,
    params.Optional1,
    params.Optional2,
    params.Optional3,
    params.Optional4,
    params.Optional5,
    params.CancelUrl,
    params.ErrorUrl,
    params.SuccessUrl,
    params.NotifyUrl,
    params.IsTest,
    OZOW_PRIVATE_KEY,
  ].join("");

  const hashCheck = crypto
    .createHash("sha512")
    .update(hashInput.toLowerCase())
    .digest("hex");

  params.HashCheck = hashCheck;

  return { url: OZOW_PAY_URL, params };
}

export function validateOzowHash(data: Record<string, string>): boolean {
  const receivedHash = data.Hash || data.HashCheck;
  if (!receivedHash) return false;

  // Notification hash: all fields except Hash, in order, + private key
  const fields = [
    "SiteCode", "TransactionId", "TransactionReference", "Amount",
    "Status", "Optional1", "Optional2", "Optional3", "Optional4", "Optional5",
    "CurrencyCode", "IsTest", "StatusMessage",
  ];

  const hashInput = fields.map((f) => data[f] || "").join("") + OZOW_PRIVATE_KEY;

  const calculatedHash = crypto
    .createHash("sha512")
    .update(hashInput.toLowerCase())
    .digest("hex");

  return calculatedHash.toLowerCase() === receivedHash.toLowerCase();
}

export { OZOW_API_KEY };
