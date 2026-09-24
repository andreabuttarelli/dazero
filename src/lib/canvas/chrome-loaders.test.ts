import { describe, expect, it } from 'vitest';
import { NAV_ENTRIES } from '$lib/shell-nav';
import { CHROME_LOADERS, ENTRY_PREFETCH } from './chrome-loaders';

describe('CHROME_LOADERS: la chat e il pannello a sinistra non pesano sul primo disegno', () => {
  it('sono moduli pigri che si risolvono in un componente', async () => {
    for (const load of [CHROME_LOADERS.chat, CHROME_LOADERS.leftPanel]) {
      expect((await load()).default).toBeTruthy();
    }
  });
});

describe('ENTRY_PREFETCH: passare sopra una voce della rail ne scarica il codice', () => {
  it('ogni voce della rail ha il suo prefetch', () => {
    const missing = NAV_ENTRIES.map((entry) => entry.id).filter((id) => !(id in ENTRY_PREFETCH));
    expect(missing).toEqual([]);
  });

  it('il prefetch porta il modulo che la voce apre', async () => {
    for (const load of Object.values(ENTRY_PREFETCH)) {
      expect((await load()).default).toBeTruthy();
    }
  });
});
