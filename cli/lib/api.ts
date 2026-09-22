/**
 * Thin HTTP client for the dazero CLI.
 * No Supabase, no DB access, no secrets — just HTTP calls to the dazero API.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { appUrl } from './config.ts';
import {
  pathFor,
  pathWithoutBrand,
  TOOL_HEADER,
  type BrandEndpoint,
  type ResourceEndpoint,
  type ResourcelessEndpoint,
} from './contracts/index.ts';

/**
 * Quale tool sta chiamando, per le richieste che partono da qui dentro. Un comando della CLI non
 * ne apre nessuno: l'intestazione parte solo quando c'è davvero un tool, e il server non si trova
 * ad attribuire una spesa a un tool che nessuno ha chiamato.
 */
const toolCall = new AsyncLocalStorage<string>();

export function asTool<T>(tool: string, fn: () => T): T {
  return toolCall.run(tool, fn);
}

export async function request<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  // Resolved per call, not at import time: loadEnv() sets PUBLIC_APP_URL after the module
  // graph is already loaded, so a module-level constant would freeze the production default
  // and ignore the local dev server.
  const url = `${appUrl()}${path}`;
  const tool = toolCall.getStore();
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(tool ? { [TOOL_HEADER]: tool } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function get<T>(path: string, token: string): Promise<T> {
  return request<T>(path, token);
}

function post<T>(path: string, token: string, body?: unknown): Promise<T> {
  return request<T>(path, token, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Nessuno slug: si va per la strada senza brand, se il registro ne dichiara una. Se non la
 * dichiara è un errore qui e subito — cadere sulla rotta del brand costruirebbe `/brands//…`, che
 * il server rifiuterebbe con un 404 illeggibile molto più tardi.
 */
function brandFreeCall(endpoint: BrandEndpoint, slug: string | null): string | null {
  if (slug) return null;

  const path = pathWithoutBrand(endpoint);
  if (!path) throw new Error(`${endpoint.tool} needs a brand slug`);

  return path;
}

export function callEndpoint<T>(
  endpoint: ResourcelessEndpoint,
  token: string,
  slug: string | null,
  input?: Record<string, unknown>,
): Promise<T>;
export function callEndpoint<T>(
  endpoint: ResourceEndpoint,
  token: string,
  slug: string,
  input: Record<string, unknown>,
  id: string,
): Promise<T>;
export function callEndpoint<T>(
  endpoint: BrandEndpoint,
  token: string,
  slug: string | null,
  input: Record<string, unknown> = {},
  id?: string,
): Promise<T> {
  const path = brandFreeCall(endpoint, slug)
    ?? (endpoint.resource === undefined ? pathFor(endpoint, slug!) : pathFor(endpoint, slug!, id ?? ''));
  if (endpoint.method === 'DELETE') return request<T>(path, token, { method: 'DELETE' });
  if (endpoint.method !== 'GET') {
    return request<T>(path, token, { method: endpoint.method, body: JSON.stringify(input) });
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const qs = query.toString();
  return get<T>(qs ? `${path}?${qs}` : path, token);
}

// ── Types ───────────────────────────────────────────────────────────────

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  status: string | null;
  timezone: string;
  pendingCount: number;
};

export type BrandDetail = {
  brand: BrandSummary;
  pendingCount: number;
  runs: { status: string; posts_created: number; created_at: string; error: string | null }[];
  productCount: number;
  accountCount: number;
  scheduledCount: number;
  publishedCount: number;
  hasHistory: boolean;
  kit: { about: string | null; brand_colors: unknown } | null;
  logoUrl: string | null;
};

// ── API methods ─────────────────────────────────────────────────────────

export const api = {
  // Brands
  listBrands: (t: string) => get<BrandSummary[]>('/api/v1/brands', t),
  getBrand: (t: string, slug: string) => get<BrandDetail>(`/api/v1/brands/${slug}`, t),

  // ── Products ──────────────────────────────────────────────────────────
  listProducts: (t: string, slug: string) =>
    get<{ products: { id: string; title: string; kind: string; pricing: string | null; imageCount: number; featured: boolean }[] }>(`/api/v1/brands/${slug}/products`, t),

  syncProducts: (t: string, slug: string) =>
    post<{
      ok: boolean;
      platform: string;
      synced: number;
      rejected: { title: string; reason: string }[];
    }>(`/api/v1/brands/${slug}/products`, t),

  // ── Ads ───────────────────────────────────────────────────────────────

  getAds: (t: string, slug: string) =>
    get<{
      summary: {
        campaigns: {
          id: string;
          name: string;
          platform: string;
          ad_type: string;
          status: string;
          goal: string;
          budget_amount: number;
          budget_type: string;
        }[];
        totals: { spend: number; impressions: number; clicks: number; active: number; proposed: number };
      };
      candidates: { platform: string; score: number; reason: string; caption: string | null }[];
      adAccounts: { id: string; platform: string; name: string | null; status: string; zernio_ad_account_id: string }[];
    }>(`/api/v1/brands/${slug}/ads`, t),

  adsAction: (
    t: string,
    slug: string,
    body: Record<string, unknown>
  ) =>
    post<{
      ok?: boolean;
      error?: string;
      created?: number;
      candidates?: number;
      zernioAdId?: string;
      accounts?: number;
      metrics?: number;
      id?: string;
      next?: 'active' | 'paused';
      copiedCampaignId?: string;
    }>(`/api/v1/brands/${slug}/ads`, t, body),

};
