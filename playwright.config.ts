import { defineConfig, devices } from '@playwright/test';

// Smoke suite against the dev server with PLACEHOLDER Supabase env: every target page is
// db-free by design (see tests/e2e/README.md). Port 4173 stays clear of a developer's own
// `npm run dev` on 5173.
const E2E_PORT = 4173;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Un Zernio finto in locale, mai il vero: calendar.spec.ts programma/pubblica/cancella per
  // davvero contro questo server, non contro l'account di nessuno. Deve partire PRIMA di
  // webServer — è lì che ZERNIO_BASE_URL viene letta la prima volta.
  globalSetup: './tests/e2e/fixtures/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite dev --port ${E2E_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
      PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY ?? 'e2e-placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      PUBLIC_APP_URL: BASE_URL,
      ORIGIN: BASE_URL,
      NO_HMR: '1',
      // Un mock Zernio, mai il vero: la firma di publish.ts è HTTP, quindi le spec che devono
      // programmare/pubblicare puntano qui invece che a https://zernio.com — vedi
      // calendar.spec.ts per il server che risponde su questa porta.
      ...(process.env.ZERNIO_BASE_URL ? { ZERNIO_BASE_URL: process.env.ZERNIO_BASE_URL } : {}),
      ZERNIO_API_KEY: process.env.ZERNIO_API_KEY ?? 'e2e-placeholder-zernio-key'
    }
  }
});
