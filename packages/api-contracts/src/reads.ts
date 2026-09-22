import { z } from 'zod';
import type { BrandEndpoint } from './index';

const NoInput = z.object({}).strict();

const JsonObject = z.record(z.string(), z.unknown());

export const GET_ADS = {
  tool: 'get_ads',
  title: 'Ads overview',
  description:
    'The brand\'s paid campaigns: what is running, what has been proposed and is waiting, and ' +
    'which advertising accounts are connected. ads_action is what changes any of it. Free.',
  method: 'GET',
  pathUnderBrand: '/ads',
  input: NoInput,
  output: z.object({
    summary: z.looseObject({ campaigns: z.array(JsonObject), totals: JsonObject }),
    candidates: z.array(JsonObject),
    adAccounts: z.array(JsonObject)
  }),
  failures: [
    { error: 'ads_not_on_plan', status: 403 },
    { error: 'Not found', status: 404 }
  ],
  destructive: false
} satisfies BrandEndpoint;

// La dashboard è il brand stesso: `GET /api/v1/brands/:slug`, nessun segmento sotto. Con
// `pathUnderBrand` vuoto `pathFor` produce già quell'URL — non serve un secondo registro per gli
// endpoint fuori dal brand, ne resta fuori uno solo (`list_brands`, che di brand non ne ha uno).
