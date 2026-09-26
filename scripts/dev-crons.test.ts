import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { everyMinutePaths } from './dev-crons';

describe('in sviluppo girano le stesse cron al minuto che Vercel chiama in produzione', () => {
  it('prende solo quelle con cadenza al minuto', () => {
    const crons = [
      { path: '/a', schedule: '*/1 * * * *' },
      { path: '/b', schedule: '0 4 * * *' },
      { path: '/c', schedule: '* * * * *' }
    ];
    expect(everyMinutePaths(crons)).toEqual(['/a', '/c']);
  });

  it('su vercel.json vero include il tick della tela, senza cui un video resta in caricamento', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
    expect(everyMinutePaths(vercel.crons)).toContain('/api/v1/canvas/runs/tick');
  });
});
