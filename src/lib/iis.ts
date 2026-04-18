/**
 * Microsoft IIS Administration REST API client.
 *
 * The IIS Administration API (https://github.com/microsoft/IIS.Administration)
 * provides RESTful endpoints for managing IIS websites, application pools,
 * and server settings remotely.
 *
 * Config stored in SystemSetting:
 *   IIS_API_URL      – e.g. https://102.67.138.146:8890
 *   IIS_API_KEY      – Access token generated in IIS Administration API
 *   IIS_SERVER_NAME  – Display name for the server
 */
import { getSettings } from "@/lib/settings";

// ─── Types ──────────────────────────────────────────────────────────────

export interface IisSiteInfo {
  id: string;
  name: string;
  status: string; // "started" | "stopped" | "unknown"
  physical_path: string;
  bindings: IisSiteBinding[];
  limits?: { connection_timeout?: number; max_bandwidth?: number; max_connections?: number };
  server_auto_start?: boolean;
  _links?: Record<string, { href: string }>;
}

export interface IisSiteBinding {
  protocol: string;
  binding_information: string;
  hostname?: string;
  port?: number;
  ip_address?: string;
  certificate_hash?: string;
  certificate_store_name?: string;
  require_sni?: boolean;
}

export interface IisAppPool {
  id: string;
  name: string;
  status: string; // "started" | "stopped"
  pipeline_mode?: string;
  managed_runtime_version?: string;
  auto_start?: boolean;
  enable32_bit_app_on_win64?: boolean;
  _links?: Record<string, { href: string }>;
}

export interface IisApplication {
  path: string;
  physical_path: string;
  application_pool?: { name: string };
  enabled_protocols?: string;
}

// ─── Config ─────────────────────────────────────────────────────────────

let cachedConfig: { url: string; apiKey: string; serverName: string } | null = null;

export async function getIisConfig() {
  const s = await getSettings(["IIS_API_URL", "IIS_API_KEY", "IIS_SERVER_NAME"]);
  cachedConfig = {
    url: (s.IIS_API_URL || "").replace(/\/+$/, ""),
    apiKey: s.IIS_API_KEY || "",
    serverName: s.IIS_SERVER_NAME || "Windows Server",
  };
  return cachedConfig;
}

export async function isIisConfigured(): Promise<boolean> {
  const c = await getIisConfig();
  return !!(c.url && c.apiKey);
}

// ─── HTTP helpers ───────────────────────────────────────────────────────

async function iisFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = cachedConfig ?? await getIisConfig();
  if (!config.url || !config.apiKey) {
    throw new Error("IIS Administration API is not configured");
  }

  const url = `${config.url}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Access-Token": `Bearer ${config.apiKey}`,
      "Accept": "application/hal+json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    // IIS Admin API often uses self-signed certs
    // @ts-expect-error - Node fetch option for self-signed certs
    rejectUnauthorized: false,
  });

  return res;
}

async function iisGet<T>(path: string): Promise<T> {
  const res = await iisFetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IIS API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function iisPost<T>(path: string, body: unknown): Promise<T> {
  const res = await iisFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IIS API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function iisPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await iisFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IIS API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function iisDelete(path: string): Promise<void> {
  const res = await iisFetch(path, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`IIS API error ${res.status}: ${text || res.statusText}`);
  }
}

// ─── Websites ───────────────────────────────────────────────────────────

export async function listSites(): Promise<IisSiteInfo[]> {
  const data = await iisGet<{ websites: IisSiteInfo[] }>("/webserver/websites");
  return data.websites || [];
}

export async function getSite(siteId: string): Promise<IisSiteInfo> {
  return iisGet<IisSiteInfo>(`/webserver/websites/${encodeURIComponent(siteId)}`);
}

export async function startSite(siteId: string): Promise<IisSiteInfo> {
  return iisPost<IisSiteInfo>(`/webserver/websites/${encodeURIComponent(siteId)}/start`, {});
}

export async function stopSite(siteId: string): Promise<IisSiteInfo> {
  return iisPost<IisSiteInfo>(`/webserver/websites/${encodeURIComponent(siteId)}/stop`, {});
}

export async function createSite(params: {
  name: string;
  physical_path: string;
  bindings: Array<{
    protocol: string;
    port: number;
    ip_address?: string;
    hostname?: string;
  }>;
}): Promise<IisSiteInfo> {
  return iisPost<IisSiteInfo>("/webserver/websites", params);
}

export async function updateSite(
  siteId: string,
  updates: Partial<{
    name: string;
    physical_path: string;
    server_auto_start: boolean;
    bindings: IisSiteBinding[];
  }>
): Promise<IisSiteInfo> {
  return iisPatch<IisSiteInfo>(`/webserver/websites/${encodeURIComponent(siteId)}`, updates);
}

export async function deleteSite(siteId: string): Promise<void> {
  return iisDelete(`/webserver/websites/${encodeURIComponent(siteId)}`);
}

// ─── Application Pools ──────────────────────────────────────────────────

export async function listAppPools(): Promise<IisAppPool[]> {
  const data = await iisGet<{ app_pools: IisAppPool[] }>("/webserver/application-pools");
  return data.app_pools || [];
}

export async function getAppPool(poolId: string): Promise<IisAppPool> {
  return iisGet<IisAppPool>(`/webserver/application-pools/${encodeURIComponent(poolId)}`);
}

export async function startAppPool(poolId: string): Promise<void> {
  await iisPost(`/webserver/application-pools/${encodeURIComponent(poolId)}/start`, {});
}

export async function stopAppPool(poolId: string): Promise<void> {
  await iisPost(`/webserver/application-pools/${encodeURIComponent(poolId)}/stop`, {});
}

export async function recycleAppPool(poolId: string): Promise<void> {
  await iisPost(`/webserver/application-pools/${encodeURIComponent(poolId)}/recycle`, {});
}

export async function createAppPool(params: {
  name: string;
  pipeline_mode?: string;
  managed_runtime_version?: string;
  auto_start?: boolean;
}): Promise<IisAppPool> {
  return iisPost<IisAppPool>("/webserver/application-pools", params);
}

export async function deleteAppPool(poolId: string): Promise<void> {
  return iisDelete(`/webserver/application-pools/${encodeURIComponent(poolId)}`);
}

// ─── Applications (virtual apps inside a site) ─────────────────────────

export async function listApplications(siteId: string): Promise<IisApplication[]> {
  const data = await iisGet<{ applications: IisApplication[] }>(
    `/webserver/websites/${encodeURIComponent(siteId)}/applications`
  );
  return data.applications || [];
}

// ─── Server Info ────────────────────────────────────────────────────────

export async function getServerInfo(): Promise<{
  name: string;
  id: string;
  status: string;
  version: string;
  supports: Record<string, boolean>;
}> {
  return iisGet("/webserver");
}

// ─── Connection Test ────────────────────────────────────────────────────

export async function testIisConnection(): Promise<{
  success: boolean;
  message: string;
  version?: string;
}> {
  try {
    const configured = await isIisConfigured();
    if (!configured) {
      return { success: false, message: "IIS API not configured. Set URL and API key in System Settings." };
    }

    const info = await getServerInfo();
    return {
      success: true,
      message: `Connected to IIS ${info.version || ""}. Server: ${info.name || "OK"}`,
      version: info.version,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to connect to IIS API",
    };
  }
}
