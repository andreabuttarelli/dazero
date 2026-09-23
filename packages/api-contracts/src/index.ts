import type { z } from 'zod';
import { ADS_ACTION, ADS_REMIX } from './ads';
import { BILLING_PORTAL_LINK, CHECKOUT_LINK } from './billing';
import { QUERY_DATABASE } from './query';
import { INSERT_ROW, UPDATE_ROW, DELETE_ROW } from './write';
import { IMPORT_MEDIA_URL } from './posts';
import { SET_BRAND_SETTINGS } from './brand-settings';
import { GET_MEDIA_MODELS, SET_MEDIA_MODEL } from './media-models';
import { SOCIAL_CONNECT_LINK } from './social';
import { ENHANCE_PROMPT } from './prompts';
import { UPDATE_PRODUCT } from './studio';

export type EndpointFailure = { readonly error: string; readonly status: number };

export const BRAND_RESOURCES = {
  post: 'Post',
  product: 'Product'
} as const;

export type BrandResource = keyof typeof BRAND_RESOURCES;

export const RESOURCE_SEGMENT = ':id';

/**
 * L'intestazione con cui un client dice QUALE tool sta chiamando. `ai_calls` registra la chiamata
 * al modello, non chi l'ha causata: senza questo nome la spesa di un tool non è separabile da
 * quella di nessun altro, e «questo tool vale quello che costa» resta senza risposta.
 */
export const TOOL_HEADER = 'x-dazero-tool';

/**
 * Il nome arriva dalla rete, quindi non è un nome finché non lo si guarda: si accetta solo la
 * forma che un tool ha davvero e si scarta il resto invece di scriverlo.
 */
export function toolFromHeader(value: string | null | undefined): string | null {
  return value && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null;
}

type EndpointShape = {
  readonly tool: string;
  readonly title: string;
  readonly description: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly input: z.ZodObject<z.ZodRawShape>;
  readonly output: z.ZodType;
  readonly failures: readonly EndpointFailure[];
  readonly destructive: boolean;
  readonly openWorld?: boolean;
};

export type ResourcelessEndpoint = EndpointShape & {
  readonly pathUnderBrand: string;
  /**
   * The same tool, reachable without naming a brand. Declaring it is what makes `slug` optional
   * and what tells the caller a second route exists — an endpoint that omits this one has no way
   * of running outside a brand, and asking for one is an error rather than a silent fallback.
   */
  readonly pathWithoutBrand?: string;
  readonly resource?: undefined;
};

export type ResourceEndpoint = EndpointShape & {
  readonly pathUnderBrand: `${string}/${typeof RESOURCE_SEGMENT}${string}`;
  readonly pathWithoutBrand?: undefined;
  readonly resource: BrandResource;
};

export type BrandEndpoint = ResourcelessEndpoint | ResourceEndpoint;

export const BRAND_ENDPOINTS: readonly BrandEndpoint[] = [
  ADS_REMIX,
  BILLING_PORTAL_LINK,
  CHECKOUT_LINK,
  ENHANCE_PROMPT,
  GET_MEDIA_MODELS,
  IMPORT_MEDIA_URL,
  DELETE_ROW,
  INSERT_ROW,
  QUERY_DATABASE,
  SET_BRAND_SETTINGS,
  SET_MEDIA_MODEL,
  SOCIAL_CONNECT_LINK,
  UPDATE_ROW,
];

export const OWN_TOOL_ENDPOINTS: readonly BrandEndpoint[] = BRAND_ENDPOINTS;

export function pathFor(endpoint: ResourcelessEndpoint, slug: string): string;
export function pathFor(endpoint: ResourceEndpoint, slug: string, id: string): string;
export function pathFor(endpoint: BrandEndpoint, slug: string, id?: string): string {
  const base = `/api/v1/brands/${encodeURIComponent(slug)}`;
  if (endpoint.resource === undefined) return `${base}${endpoint.pathUnderBrand}`;
  if (!id) throw new Error(`${endpoint.tool} needs a ${endpoint.resource} id`);
  return `${base}${endpoint.pathUnderBrand.replace(RESOURCE_SEGMENT, encodeURIComponent(id))}`;
}

/** Where this tool runs when no brand is named — `null` when it only exists under one. */
export function pathWithoutBrand(endpoint: BrandEndpoint): string | null {
  return endpoint.pathWithoutBrand ? `/api/v1${endpoint.pathWithoutBrand}` : null;
}

// Un id accorciato è una comodità di lettura: la lista dice quale riga, il prefisso basta a
// indicarla. Su una cancellazione non basta — il prefisso ambiguo colpisce la riga sbagliata e
// non si torna indietro — quindi la DELETE prende l'id che il contratto dichiara, per intero.
export function acceptsIdPrefix(endpoint: BrandEndpoint): endpoint is ResourceEndpoint {
  return endpoint.resource !== undefined && endpoint.method !== 'DELETE';
}

export function statusForFailure(
  endpoint: { readonly failures: readonly EndpointFailure[] },
  error: string
): number {
  return endpoint.failures.find((f) => f.error === error)?.status ?? 500;
}

export {
  ADS_ACTION,
  ADS_REMIX,
  IMPORT_MEDIA_URL,
};
/**
 * Gli schemi delle letture ritirate da MCP. La rotta REST resta e continua a validare con questi;
 * nessuno di essi e' un endpoint del registry, quindi nessuno diventa un tool.
 */
export { LIST_MEDIA_READ } from './posts';
export { LIST_SOCIAL_ACCOUNTS_READ } from './social';

export { QUERY_DATABASE, QUERY_OPS, QUERY_TABLE_NAMES, QUERY_DEFAULT_ROWS, QUERY_MAX_ROWS } from './query';
export { QUERY_TABLES } from './query-tables';
export {
  SET_BRAND_SETTINGS,
  TARGET_PLATFORMS
} from './brand-settings';
export type { TargetPlatform } from './brand-settings';
export {
  GET_MEDIA_MODELS,
  MEDIA_MODEL_JOBS,
  MEDIA_MODEL_SLOT_IDS,
  SET_MEDIA_MODEL
} from './media-models';
export type { MediaModelSlotId } from './media-models';
export { ENHANCE_PROMPT } from './prompts';
export { UPDATE_PRODUCT } from './studio';
export {
  AUTOMATION_CADENCES,
  AUTOMATION_JOBS,
  AUTOMATION_STATES
} from './automations';
export type { AutomationJob } from './automations';
export { SOCIAL_CONNECT_LINK } from './social';
export { BILLING_PORTAL_LINK, CHECKOUT_LINK };
export type { BillingPortalLinkResult, CheckoutLinkInput, CheckoutLinkResult } from './billing';
export { INSERT_ROW, UPDATE_ROW, DELETE_ROW, UPDATE_MAX_ROWS, DELETE_MAX_ROWS } from './write';
export { TABLE_CHECKS, WRITABLE_COLUMNS } from './write-rules';

/**
 * I CONTRATTI DEI TOOL RITIRATI, che restano esportati.
 *
 * Ritirare un tool vuol dire toglierlo da `BRAND_ENDPOINTS`, cioè smettere di esporlo su MCP. La
 * rotta REST resta, il CLI la chiama, e il contratto è la forma con cui la chiama: toglierlo anche
 * di qui fa smettere di compilare una rotta, con un errore di TIPO che il codice in esecuzione non
 * mostra e che si perde fra i preesistenti.
 */
export { GET_ADS } from './reads';
