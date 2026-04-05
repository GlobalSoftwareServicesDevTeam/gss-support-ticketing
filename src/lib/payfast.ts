import crypto from "crypto";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "";
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

export const PAYFAST_URL = PAYFAST_SANDBOX
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

export const PAYFAST_VALIDATE_URL = PAYFAST_SANDBOX
  ? "https://sandbox.payfast.co.za/eng/query/validate"
  : "https://www.payfast.co.za/eng/query/validate";

export function isPayfastConfigured(): boolean {
  return !!(PAYFAST_MERCHANT_ID && PAYFAST_MERCHANT_KEY);
}

export interface PayfastPaymentData {
  amount: number;
  itemName: string;
  invoiceNumber?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  paymentId: string;
}

export function buildPayfastForm(data: PayfastPaymentData, baseUrl: string) {
  const params: Record<string, string> = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: `${baseUrl}/payments?result=success`,
    cancel_url: `${baseUrl}/payments?result=cancelled`,
    notify_url: `${baseUrl}/api/payments/payfast/notify`,
    m_payment_id: data.paymentId,
    amount: data.amount.toFixed(2),
    item_name: data.itemName.substring(0, 100),
  };

  if (data.invoiceNumber) params.item_description = `Invoice: ${data.invoiceNumber}`;
  if (data.customerEmail) params.email_address = data.customerEmail;
  if (data.customerFirstName) params.name_first = data.customerFirstName;
  if (data.customerLastName) params.name_last = data.customerLastName;

  // Generate signature
  const signatureString = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`)
    .join("&");

  const passphrase = PAYFAST_PASSPHRASE
    ? `${signatureString}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE.trim()).replace(/%20/g, "+")}`
    : signatureString;

  params.signature = crypto.createHash("md5").update(passphrase).digest("hex");

  return { url: PAYFAST_URL, params };
}

export function validatePayfastSignature(data: Record<string, string>): boolean {
  const receivedSignature = data.signature;
  const params = { ...data };
  delete params.signature;

  const signatureString = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`)
    .join("&");

  const passphrase = PAYFAST_PASSPHRASE
    ? `${signatureString}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE.trim()).replace(/%20/g, "+")}`
    : signatureString;

  const calculatedSignature = crypto.createHash("md5").update(passphrase).digest("hex");

  return calculatedSignature === receivedSignature;
}

export async function validatePayfastServer(pfParamString: string): Promise<boolean> {
  try {
    const res = await fetch(PAYFAST_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: pfParamString,
    });
    const text = await res.text();
    return text.trim() === "VALID";
  } catch {
    return false;
  }
}
