import { describe, expect, it } from 'vitest';
import type { NarrowedDatabase } from './typed-database';

type NodeInsert = NarrowedDatabase['public']['Tables']['nodes']['Insert'];
type PostsInsert = NarrowedDatabase['public']['Tables']['posts']['Insert'];
type AdCampaignsInsert = NarrowedDatabase['public']['Tables']['ad_campaigns']['Insert'];
type CanvasesInsert = NarrowedDatabase['public']['Tables']['canvases']['Insert'];

describe('NarrowedDatabase rejects a wrong jsonb shape at compile time', () => {
  it('a node of type "image" requires the image schema, not the text schema', () => {
    const valid: NodeInsert = {
      org_id: 'org_1',
      canvas_id: 'canvas_1',
      project_id: 'project_1',
      type: 'image',
      x: 0,
      y: 0,
      data: { prompt: 'a red bicycle' }
    };

    const mismatched: NodeInsert = {
      org_id: 'org_1',
      canvas_id: 'canvas_1',
      project_id: 'project_1',
      type: 'image',
      x: 0,
      y: 0,
      // @ts-expect-error data.content belongs to the doc schema, not to image
      data: { content: 'a red bicycle' }
    };

    expect(valid.type).toBe('image');
    expect(mismatched.type).toBe('image');
  });

  it('a node of type "image" cannot be missing the required prompt', () => {
    // @ts-expect-error prompt is required by the image schema
    const missingPrompt: NodeInsert = {
      org_id: 'org_1',
      canvas_id: 'canvas_1',
      project_id: 'project_1',
      type: 'image',
      x: 0,
      y: 0,
      data: {}
    };

    expect(missingPrompt.type).toBe('image');
  });

  it('posts.media must be the assetId/order/role shape, not an arbitrary object', () => {
    const wrongMedia: PostsInsert = {
      org_id: 'org_1',
      brand_id: 'brand_1',
      caption: 'caption',
      // @ts-expect-error media items need assetId and order, not url
      media: [{ url: 'https://example.com/a.png' }]
    };

    expect(wrongMedia.caption).toBe('caption');
  });

  it('ad_campaigns.targeting rejects a field the schema does not declare', () => {
    const wrongTargeting: AdCampaignsInsert = {
      org_id: 'org_1',
      brand_id: 'brand_1',
      ad_account_id: 'acct_1',
      name: 'campaign',
      objective: 'traffic',
      budget_type: 'daily',
      budget_amount: 10,
      // @ts-expect-error budget is not part of AdTargeting
      targeting: { budget: 10 }
    };

    expect(wrongTargeting.name).toBe('campaign');
  });

  it('canvases.viewport requires x, y and zoom as numbers', () => {
    const wrongViewport: CanvasesInsert = {
      org_id: 'org_1',
      project_id: 'project_1',
      name: 'canvas',
      // @ts-expect-error zoom is required and must be a number
      viewport: { x: 0, y: 0 }
    };

    expect(wrongViewport.name).toBe('canvas');
  });
});
