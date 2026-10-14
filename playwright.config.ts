import { defineConfig, devices } from '@playwright/test';
import { config as loadEnvFile } from 'dotenv';
import { getBaseUrl } from './e2e/support/environment';
import { TEST_DEADLINE_MS } from './e2e/support/timeouts';

// Quiet: the missing-variable check below already reports configuration problems,
// and dotenv would otherwise log once per worker.
loadEnvFile({ quiet: true });

// Fail fast instead of silently skipping: running the suite against the wrong
// environment is worse than not running it at all.
const baseURL = getBaseUrl();

export default defineConfig({
  testDir: 'e2e',
  // Unit tests sit under the source they cover but need no browser and no portal,
  // so they run under their own configuration. Excluded here because `testDir`
  // claims every spec beneath it, and a file Playwright collects that holds no
  // Playwright test is an error rather than a pass.
  testIgnore: '**/unit/**',
  // Derived from the bounds the flow itself waits on, so that a test which runs out
  // of time has exhausted the wait it was inside and can report the screen that
  // answered, instead of being cut off by the runner. The derivation and the reason
  // it is not arithmetic live with the bounds.
  timeout: TEST_DEADLINE_MS,
  // Serial, and measured rather than preferred. Run in parallel, every test in the
  // suite failed at certificate login with the portal refusing the session —
  // "não foi possível localizar um usuário ativo vinculado a esse certificado", from
  // `controle-acesso-ws/mensagens/900004`. Run one at a time, the very same login
  // passes. Locked here rather than left to a command-line option, because the next
  // run without the option breaks the portal again.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Zero everywhere, CI included. A retry of this suite is a second real export
  // request for a real company, and instability is fixed by its cause instead.
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    // Keep evidence of every failure, not only of retries.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The end goal of this project is downloading files from the portal.
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
