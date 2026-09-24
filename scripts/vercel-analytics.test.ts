import { describe, expect, it } from 'vitest';
import { vercelAnalyticsDefine } from './vercel-analytics';

const FLAG = 'import.meta.env.VITE_VERCEL_ANALYTICS';

describe('vercelAnalyticsDefine', () => {
  it('turns Web Analytics on for a build Vercel runs, where /_vercel/insights/script.js exists', () => {
    expect(vercelAnalyticsDefine({ VERCEL: '1' })[FLAG]).toBe('true');
  });

  it('leaves it off everywhere else: a local preview or a self-hosted node build would 404 the script', () => {
    expect(vercelAnalyticsDefine({})[FLAG]).toBe('false');
    expect(vercelAnalyticsDefine({ DEPLOY_TARGET: 'node' })[FLAG]).toBe('false');
  });
});
