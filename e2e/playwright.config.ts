import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// ── Chargement du fichier .env selon l'environnement ─────────────────────────
// Priorité : variables d'environnement système > .env.local > .env.<E2E_ENV> > .env
const env = process.env['E2E_ENV'] ?? 'local';

dotenv.config({ path: path.resolve(__dirname, '.env.local'),         override: false });
dotenv.config({ path: path.resolve(__dirname, `.env.${env}`),        override: false });
dotenv.config({ path: path.resolve(__dirname, '.env'),               override: false });

// ── Résolution des URLs ───────────────────────────────────────────────────────
const BASE_URL      = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
const IGNORE_HTTPS  = process.env['E2E_IGNORE_HTTPS'] === 'true';
const TIMEOUT       = parseInt(process.env['E2E_TIMEOUT'] ?? '30000');

console.log(`\n🎭 Playwright → ${BASE_URL}  (env=${env})\n`);

export default defineConfig({
  testDir:   './scenarios',
  timeout:   TIMEOUT,
  // Tests séquentiels — la DB est partagée entre les tests
  workers:   1,
  retries:   1,
  reporter:  [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL:             BASE_URL,
    ignoreHTTPSErrors:   IGNORE_HTTPS,
    trace:               'on-first-retry',
    screenshot:          'only-on-failure',
    video:               'on-first-retry',
    actionTimeout:       10_000,
    navigationTimeout:   20_000,
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],
});
