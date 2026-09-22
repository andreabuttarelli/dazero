import { z } from 'zod';
import type { BrandEndpoint } from './index';

export const POST_STATUSES = ['pending_user', 'approved', 'scheduled', 'published', 'failed'] as const;

const PostRow = z.object({
  id: z.string(),
  brand_id: z.string(),
  platform: z.string().nullable(),
  platforms: z.array(z.string()).nullable(),
  caption: z.string().nullable(),
  image_prompt: z.string().nullable(),
  slot: z.string().nullable(),
  media_url: z.string().nullable(),
  status: z.string(),
  content_type: z.string().nullable(),
  scheduled_for: z.string().nullable(),
  published_url: z.string().nullable(),
  product_name: z.string().nullable(),
  revisions_count: z.number().nullable(),
  pillar: z.string().nullable(),
  format: z.string().nullable(),
  created_at: z.string()
});

const CreatePostInputSchema = z.object({
  platforms: z.array(z.string().min(1)).min(1).describe('Text-capable platforms, e.g. ["linkedin","x"]'),
  caption: z.string().min(1).describe('The copy you wrote. dazero stores it as-is and writes nothing itself'),
  platform_captions: z
    .record(z.string(), z.string())
    .optional()
    .describe('Per-platform overrides of the caption'),
  scheduled_for: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Proposed publication instant, ISO. Without an offset it is read on the brand clock. ' +
        'It is a calendar proposal only: nothing is scheduled or published until the post is approved'
    ),
  media_ids: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe(
      'Full ids from this brand media library (see list_media) — unlike a post id, a media id ' +
        'is never resolved from a prefix. An id that is not this brand is rejected: the post is ' +
        'never quietly created without it. At most 8: a ninth is refused, not dropped'
    ),
  title: z.string().optional().describe('Required for Reddit'),
  subreddit: z.string().optional(),
  link_url: z.string().optional()
}).strict();

const CreatePostResultSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  status: z.literal('pending_user'),
  scheduled_for: z.string().nullable(),
  scheduled_for_local: z.string().nullable(),
  slot: z.string().nullable(),
  review_url: z.string()
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
export type CreatePostResult = z.infer<typeof CreatePostResultSchema>;

export const CREATE_POST = {
  tool: 'create_post',
  title: 'Create post',
  description:
    'Store copy you already wrote as one pending post for review. It does not publish and does ' +
    'not schedule: `scheduled_for` is the proposed calendar time, and approve_post remains the ' +
    'action that authorizes distribution. Text-capable platforms only — instagram and tiktok need ' +
    'an image, youtube needs a video. Two different media failures: `media_not_found` (400) means ' +
    'the id is not this brand — check it with list_media, and pass the full id, never a prefix; ' +
    '`media_unavailable` (502) means the id is yours and dazero could not attach it, so ' +
    'retrying other ids is wasted work — retry later or leave the media out. Free.',
  method: 'POST',
  pathUnderBrand: '/posts',
  input: CreatePostInputSchema,
  output: CreatePostResultSchema,
  failures: [
    { error: 'no_platforms', status: 400 },
    { error: 'need_caption', status: 400 },
    { error: 'need_media', status: 400 },
    { error: 'need_video', status: 400 },
    { error: 'over_limit', status: 400 },
    { error: 'reddit_title', status: 400 },
    { error: 'too_soon', status: 400 },
    { error: 'invalid_scheduled_for', status: 400 },
    { error: 'media_not_found', status: 400 },
    { error: 'media_unavailable', status: 502 }
  ],
  destructive: false
} satisfies BrandEndpoint;

export const RESCHEDULE_POST = {
  tool: 'reschedule_post',
  title: 'Reschedule post',
  description:
    'Move a post to a different date and time. `scheduled_for` is an ISO datetime. It does not ' +
    'publish and does not approve — it only changes when. Free.',
  method: 'POST',
  pathUnderBrand: '/posts/:id/reschedule',
  resource: 'post',
  input: z.object({
    scheduled_for: z.string().min(1).describe('ISO datetime, e.g. 2026-06-20T10:00')
  }).strict(),
  output: z.object({
    ok: z.literal(true),
    scheduled_for: z.string(),
    scheduled_for_local: z.string(),
    noAccount: z.boolean().optional()
  }),
  failures: [],
  destructive: false
} satisfies BrandEndpoint;

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
export const EDIT_POST = {
  tool: 'edit_post',
  title: 'Edit post',
  description:
    'Change what a post says without redrawing anything: caption, title, link, platforms, the ' +
    'slot it sits in. `slot` IS THE CALENDAR DAY, NOT THE PUBLISH TIME — the time a post actually ' +
    'goes out is `scheduled_for`, and only `reschedule_post` changes it. ' +
    'Only the fields you send change; `media_url: null` clears the image and ' +
    'makes it text-only. No model, no credits. A post that is already scheduled is re-synced ' +
    'to the publisher automatically. It does not publish and does not approve. id accepts a ' +
    'short prefix.',
  method: 'PUT',
  pathUnderBrand: '/posts/:id',
  resource: 'post',
  input: z
    .object({
      caption: z.string().optional(),
      title: z.string().optional(),
      link_url: z.string().nullable().optional(),
      subreddit: z.string().optional(),
      first_comment: z.string().optional(),
      image_prompt: z.string().optional(),
      format: z.string().optional(),
      slot: z.string().optional(),
      product_name: z.string().optional(),
      platforms: z.array(z.string()).optional(),
      media_url: z
        .string()
        .nullable()
        .optional()
        .describe('Set null to clear image (text-only)'),
      platform_captions: z.record(z.string(), z.string()).nullable().optional(),
      expected_updated_at: z
        .string()
        .optional()
        .describe(
          "The post's `updated_at` as you read it. Send it when your edit depends on what you " +
            'read — a caption you are rewriting, a slot you are moving — and the write is refused ' +
            'with `stale_post` if anyone (a person, another agent, the autopilot) changed the post ' +
            'in between, instead of silently overwriting them. Omit it for a field that does not ' +
            'depend on what was there.'
        )
    })
    .strict(),
  // `patch` è quello che la rotta ha scritto davvero, filtrato sui campi che sa applicare: una
  // conferma, non l'eco della richiesta. Un campo che non esiste non ci finisce dentro.
  output: z.object({ ok: z.literal(true), patch: z.record(z.string(), z.unknown()) }),
  failures: [
    { error: 'No fields to update', status: 400 },
    { error: 'Post not found', status: 404 },
    // 409, non 500: il post c'è ed è tuo, ma è cambiato. Chi chiama rilegge e ridecide — ritentare
    // lo stesso identico patch riprodurrebbe la sovrascrittura che questo codice esiste per evitare.
    { error: 'stale_post', status: 409 }
  ],
  destructive: false
} satisfies BrandEndpoint;
