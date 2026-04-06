import { getSettings } from "@/lib/settings";

const DIGICERT_BASE_URL = "https://www.digicert.com/services/v2";

export async function getDigicertConfig() {
  return getSettings(["DIGICERT_API_KEY", "DIGICERT_ORG_ID"]);
}

async function digicertFetch(path: string, options: RequestInit = {}) {
  const config = await getDigicertConfig();
  const apiKey = config.DIGICERT_API_KEY;
  if (!apiKey) {
    throw new Error("DigiCert API key not configured");
  }

  const url = `${DIGICERT_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-DC-DEVKEY": apiKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = { message: text };
    }
    throw new Error(
      `DigiCert API error (${res.status}): ${errorData?.errors?.[0]?.message || errorData?.message || text}`
    );
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

// Product type to DigiCert product name mapping
export const DIGICERT_PRODUCTS: Record<string, { name: string; id: string; type: string }> = {
  ssl_dv_geotrust: { name: "GeoTrust Standard DV SSL", id: "ssl_dv_geotrust", type: "DV" },
  ssl_dv_rapidssl: { name: "RapidSSL Standard DV SSL", id: "ssl_dv_rapidssl", type: "DV" },
  wildcard_dv_geotrust: { name: "GeoTrust Wildcard DV SSL", id: "wildcard_dv_geotrust", type: "DV" },
  wildcard_dv_rapidssl: { name: "RapidSSL Wildcard DV SSL", id: "wildcard_dv_rapidssl", type: "DV" },
  ssl_basic: { name: "Basic OV SSL", id: "ssl_basic", type: "OV" },
  ssl_ev_basic: { name: "Basic EV SSL", id: "ssl_ev_basic", type: "EV" },
  ssl_securesite: { name: "Secure Site SSL", id: "ssl_securesite", type: "OV" },
  ssl_ev_securesite: { name: "Secure Site EV SSL", id: "ssl_ev_securesite", type: "EV" },
};

export async function listProducts() {
  return digicertFetch("/product");
}

export async function orderCertificate(params: {
  productId: string;
  commonName: string;
  csr: string;
  validityYears?: number;
  sans?: string[];
  dcvMethod?: string;
  orgId?: number;
}) {
  const config = await getDigicertConfig();
  const orgId = params.orgId || (config.DIGICERT_ORG_ID ? parseInt(config.DIGICERT_ORG_ID) : undefined);

  const body: Record<string, unknown> = {
    certificate: {
      common_name: params.commonName,
      csr: params.csr,
      ...(params.sans?.length ? { dns_names: params.sans } : {}),
      server_platform: { id: 2 }, // Apache
    },
    order_validity: {
      years: params.validityYears || 1,
    },
    payment_method: "balance",
    skip_approval: true,
    ...(params.dcvMethod ? { dcv_method: params.dcvMethod } : {}),
  };

  // OV/EV certs need organization
  const product = DIGICERT_PRODUCTS[params.productId];
  if (product && (product.type === "OV" || product.type === "EV") && orgId) {
    (body as Record<string, unknown>).organization = { id: orgId };
  }

  return digicertFetch(`/order/certificate/${params.productId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getOrderInfo(orderId: number) {
  return digicertFetch(`/order/certificate/${orderId}`);
}

export async function downloadCertificate(orderId: number, format: string = "pem_all") {
  const config = await getDigicertConfig();
  const apiKey = config.DIGICERT_API_KEY;
  if (!apiKey) throw new Error("DigiCert API key not configured");

  const url = `${DIGICERT_BASE_URL}/certificate/download/order/${orderId}/format/${format}`;
  const res = await fetch(url, {
    headers: { "X-DC-DEVKEY": apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigiCert download error (${res.status}): ${text}`);
  }

  return res.text();
}

export async function revokeCertificate(orderId: number, reason?: string) {
  return digicertFetch(`/order/certificate/${orderId}/revoke`, {
    method: "PUT",
    body: JSON.stringify({
      ...(reason ? { comments: reason } : {}),
    }),
  });
}

export async function checkDcv(orderId: number) {
  return digicertFetch(`/order/certificate/${orderId}/dcv`, {
    method: "PUT",
  });
}

export async function resendDcvEmails(orderId: number) {
  return digicertFetch(`/order/certificate/${orderId}/dcv/emails`, {
    method: "PUT",
  });
}

export async function getValidationStatus(orderId: number) {
  return digicertFetch(`/order/certificate/${orderId}/validation`);
}
