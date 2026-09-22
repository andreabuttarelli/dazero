import { z } from 'zod';
import type { BrandEndpoint } from './index';

const MediaRow = z.object({
  id: z.string(),
  kind: z.string(),
  mime: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  // Short permanent link (/a/<code>), never the signed storage URL. What crosses this boundary is
  // meant to be handed on — pasted to a person, embedded, kept — and a signed URL survives none of
  // that: it expires in 2h and truncates inside an agent's output.
  url: z.string().nullable(),
  created_at: z.string()
});

/**
 * La rotta REST resta e continua a validare con questo schema; il tool MCP non c'e' piu:
 * la lettura la serve `query`. Qui vive solo cio che serve alla rotta.
 */
export const LIST_MEDIA_READ = {
  output: z.object({ media: z.array(MediaRow) }),
  input: z
    .object({
      query: z.string().optional().describe('Free-text filter over title, description and tags'),
      limit: z.coerce.number().int().min(1).max(200).optional()
    })
    .strict(),
  failures: []
} as const;

const ImportMediaUrlInputSchema = z
  .object({
    url: z
      .string()
      .min(1)
      .describe('Public https URL of an image (jpeg, png, webp, gif) or video (mp4, mov, webm)'),
    title: z.string().optional().describe('The name the asset carries in the library')
  })
  .strict();

const ImportMediaUrlResultSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  kind: z.string(),
  mime: z.string(),
  bytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  source_url: z.string(),
  url: z.string().nullable()
});

export const IMPORT_MEDIA_URL = {
  tool: 'import_media_url',
  title: 'Import media from a URL',
  description:
    'Copy an image or video you produced elsewhere into the brand media library, then use the id ' +
    'it returns as media_ids on create_post. The file is copied, not generated. The URL must be ' +
    'public https and stay public across every redirect; jpeg, png, webp and gif up to 12MB, mp4, ' +
    'mov and webm up to 64MB. Anything else is refused and nothing is stored. Free.',
  method: 'POST',
  pathUnderBrand: '/media',
  input: ImportMediaUrlInputSchema,
  output: ImportMediaUrlResultSchema,
  failures: [
    { error: 'not_https', status: 400 },
    { error: 'blocked_host', status: 400 },
    { error: 'fetch_failed', status: 400 },
    { error: 'unsupported_type', status: 415 },
    { error: 'too_large', status: 413 },
    { error: 'empty', status: 400 },
    { error: 'store_failed', status: 502 }
  ],
  destructive: false
} satisfies BrandEndpoint;
