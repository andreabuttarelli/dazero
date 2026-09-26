import { describe, expect, it } from 'vitest';
import { weeklyRecapEmailHtml, weeklyRecapEmailText, type RecapData } from './email';

function baseRecap(over: Partial<RecapData> = {}): RecapData {
  return {
    brandName: 'Acme',
    brandSlug: 'acme',
    weekLabel: '1 – 8 Aug',
    postsPublished: 2,
    postsPending: 0,
    postsScheduled: 1,
    totalEngagement: 10,
    totalImpressions: 100,
    totalSaves: 0,
    engagementDeltaPct: null,
    prevEngagement: 0,
    prevImpressions: 0,
    prevPosts: 0,
    topPostCaption: null,
    topPostPlatform: null,
    platformStats: [],
    trends: [],
    suggestions: [],
    actionItems: [],
    dashboardUrl: 'https://app.example/app/acme',
    connectedAccounts: [{ platform: 'instagram', username: 'acme' }],
    ...over
  };
}

describe('weekly recap link clicks section', () => {
  it('renders link clicks in html and text when > 0', () => {
    const data = baseRecap({ linkClicks: 42 });
    const html = weeklyRecapEmailHtml('en', data);
    expect(html).toContain('Link clicks');
    expect(html).toContain('42');

    const text = weeklyRecapEmailText('en', data);
    expect(text).toContain('Link clicks: 42');
  });

  it('omits the section when linkClicks is missing or 0', () => {
    expect(weeklyRecapEmailHtml('en', baseRecap())).not.toContain('Link clicks');
    expect(weeklyRecapEmailHtml('en', baseRecap({ linkClicks: 0 }))).not.toContain('Link clicks');
    expect(weeklyRecapEmailText('en', baseRecap())).not.toContain('Link clicks');
  });
});

describe('weekly recap visual insights section', () => {
  it('renders visual insights in html and text when data present', () => {
    const data = baseRecap({
      visualInsights: [
        { dimension: 'genre', value: 'produced_ugc', n: 12, erAvg: 6.2, delta: 35 },
        { dimension: 'platform', value: 'tiktok', n: 8, erAvg: 5.1, delta: 18 },
        { dimension: 'genre', value: 'product_shots', n: 5, erAvg: 1.2, delta: -20 }
      ]
    });
    const html = weeklyRecapEmailHtml('en', data);
    expect(html).toContain('Visual insights');
    expect(html).toContain('genre: produced_ugc +35% ER vs avg (n=12)');
    expect(html).toContain('genre: product_shots -20% ER vs avg (n=5)');

    const text = weeklyRecapEmailText('en', data);
    expect(text).toContain('Visual insights');
    expect(text).toContain('genre: produced_ugc +35% ER vs avg (n=12)');
  });

  it('renders at most 3 visual insight rows', () => {
    const data = baseRecap({
      visualInsights: [
        { dimension: 'genre', value: 'a', n: 3, erAvg: 1, delta: 40 },
        { dimension: 'genre', value: 'b', n: 3, erAvg: 1, delta: 30 },
        { dimension: 'genre', value: 'c', n: 3, erAvg: 1, delta: 20 },
        { dimension: 'genre', value: 'd', n: 3, erAvg: 1, delta: 10 }
      ]
    });
    const html = weeklyRecapEmailHtml('en', data);
    expect(html).toContain('genre: a +40% ER vs avg');
    expect(html).not.toContain('genre: d +10% ER vs avg');
  });

  it('omits the section when there is no data', () => {
    const html = weeklyRecapEmailHtml('en', baseRecap());
    expect(html).not.toContain('Visual insights');
    expect(weeklyRecapEmailText('en', baseRecap())).not.toContain('Visual insights');
  });

});

