import { describe, expect, it } from 'vitest';
import { upcomingFeed } from './home-upcoming';

const post = (id: string, when: string, patch: Record<string, unknown> = {}) => ({
  id,
  platform: 'instagram',
  caption: 'una didascalia',
  media_url: 'https://x/1.jpg',
  scheduled_for: when,
  ...patch
});

describe('cosa esce, in ordine di quando esce', () => {
  it('ordina per orario', () => {
    const feed = upcomingFeed([post('p1', '2026-09-15T10:00:00Z'), post('p2', '2026-09-13T08:00:00Z')]);

    expect(feed.map((i) => i.id)).toEqual(['p2', 'p1']);
  });

  it('porta la rotta di ogni riga', () => {
    const [social] = upcomingFeed([post('p1', '2026-09-13T08:00:00Z')]);

    expect(social.path).toBe('/calendar?status=scheduled');
  });

  /** Senza titolo la riga esiste comunque: l'orario è già un'informazione. */
  it('non scarta una riga per un titolo mancante', () => {
    const feed = upcomingFeed([post('p1', '2026-09-13T08:00:00Z', { caption: null })]);

    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBeNull();
  });

  it('accorcia una didascalia lunga invece di lasciarla sfondare la riga', () => {
    const feed = upcomingFeed([post('p1', '2026-09-13T08:00:00Z', { caption: 'x'.repeat(200) })]);

    expect(feed[0].title!.length).toBeLessThan(100);
    expect(feed[0].title!.endsWith('…')).toBe(true);
  });

  it('non inventa righe quando non c’è niente in programma', () => {
    expect(upcomingFeed([])).toEqual([]);
  });
});
