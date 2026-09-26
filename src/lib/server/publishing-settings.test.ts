import { describe, it, expect } from 'vitest';
import { PUBLISHING_POLICY, getPublishingSettings } from './publishing-settings';

// These tests exist to make removing the human approval gate LOUD. The gate is what the AI Act's
// Art. 50(2) human-review exemption rests on, so "someone quietly added an auto-publish branch
// back" has to fail CI rather than ship.

describe('publishing policy', () => {
  it('is a constant, not a setting', () => {
    expect(PUBLISHING_POLICY).toBe('review_required');
  });

  it('lists active accounts without any per-account publishing flag', async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        const chain = {
          select(cols: string) {
            calls.push(cols);
            return chain;
          },
          eq() {
            return chain;
          },
          then(resolve: (v: { data: unknown }) => void) {
            resolve({ data: [{ id: 'a1', platform: 'instagram' }] });
          }
        };
        return chain;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const out = await getPublishingSettings(supabase, 'brand-1');
    expect(out).toEqual({
      policy: 'review_required',
      accounts: [{ id: 'a1', platform: 'instagram' }]
    });
    expect(calls.join(' ')).not.toMatch(/auto_publish/);
  });
});
