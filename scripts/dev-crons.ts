import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

type Cron = { path: string; schedule: string };

const EVERY_MINUTE = new Set(['* * * * *', '*/1 * * * *']);
const TICK_MS = 60_000;

export function everyMinutePaths(crons: Cron[]): string[] {
  return crons.filter((c) => EVERY_MINUTE.has(c.schedule.trim())).map((c) => c.path);
}

export function devCrons(): Plugin {
  return {
    name: 'dev-crons',
    apply: 'serve',
    configureServer(server) {
      const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: Cron[] };
      const paths = everyMinutePaths(vercel.crons ?? []);

      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === 'string') {
          return;
        }

        const base = `http://localhost:${address.port}`;
        const timer = setInterval(() => {
          for (const path of paths) {
            fetch(base + path).catch(() => {});
          }
        }, TICK_MS);
        server.httpServer?.once('close', () => clearInterval(timer));
      });
    }
  };
}
