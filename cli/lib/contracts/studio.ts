import { z } from 'zod';
import type { BrandEndpoint } from './index';

const id = z.string().min(1).describe('Row id, verbatim from get_studio');

const PRODUCT_FIELDS = {
  title: z.string().min(1).describe('What the offer is called'),
  description: z.string().describe('What it is, in the brand’s own words'),
  pricing: z.string().describe('Free text as the brand writes it, e.g. "18,50 €" or "Free"'),
  url: z.string().describe('Where the offer lives'),
  featured: z.boolean().describe('Whether the planner may lead with it')
};

const Ok = z.object({ ok: z.literal(true) });

const NOT_FOUND: { error: string; status: number } = { error: 'not_found', status: 404 };
const NO_FIELDS: { error: string; status: number } = { error: 'no_fields', status: 400 };

const UpdateProductInputSchema = z
  .object({
    id,
    title: PRODUCT_FIELDS.title.optional(),
    description: PRODUCT_FIELDS.description.optional(),
    pricing: PRODUCT_FIELDS.pricing.optional(),
    url: PRODUCT_FIELDS.url.optional(),
    featured: PRODUCT_FIELDS.featured.optional()
  })
  .strict();

export const UPDATE_PRODUCT = {
  tool: 'update_product',
  title: 'Update product',
  description:
    'Correct one offer in place. Only the fields you send change; every other column keeps the ' +
    'value it had. Free.',
  method: 'PUT',
  pathUnderBrand: '/products/:id',
  resource: 'product',
  input: UpdateProductInputSchema,
  output: Ok,
  failures: [NOT_FOUND, NO_FIELDS, { error: 'update_failed', status: 500 }],
  destructive: false
} satisfies BrandEndpoint;
