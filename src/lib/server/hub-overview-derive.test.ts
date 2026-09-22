import { describe, it, expect } from 'vitest';
import { derivePostCounts } from './hub-overview';

// This replaces separate PostgREST round trips (migration 0206). The risk of moving counting
// from SQL into JS is that a predicate quietly drifts from the one it replaced, so the tests
// below are written against the SQL they stand in for.

describe('derivePostCounts', () => {
  it('counts each status independently', () => {
    const c = derivePostCounts([
      { status: 'pending_user' },
      { status: 'pending_user' },
      { status: 'scheduled' },
      { status: 'published' },
      { status: 'published' },
      { status: 'published' }
    ]);
    expect(c).toEqual({ pending: 2, scheduled: 1, published: 3 });
  });

  it('ignores statuses Overview does not show', () => {
    const c = derivePostCounts([{ status: 'failed' }, { status: 'approved' }, { status: 'draft' }]);
    expect(c).toEqual({ pending: 0, scheduled: 0, published: 0 });
  });

  it('survives null/empty input', () => {
    expect(derivePostCounts(null)).toEqual({ pending: 0, scheduled: 0, published: 0 });
    expect(derivePostCounts([])).toEqual({ pending: 0, scheduled: 0, published: 0 });
  });
});
