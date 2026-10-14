import { defineConfig } from '@playwright/test';

/**
 * Runner for the unit tests.
 *
 * Separate from the suite that drives the portal, and deliberately not sharing its
 * configuration: these tests claim something a portal run cannot, so they need no
 * browser, no device and no base URL — and inheriting the suite's configuration
 * would make `E2E_BASE_URL` a precondition of proving a function is correct.
 *
 * Still the same runner, on purpose: a second test framework would be a second
 * assertion vocabulary to learn and a second set of rules to configure.
 */
export default defineConfig({
  testDir: 'e2e/unit',
  reporter: 'list',
  outputDir: 'test-results/unit',
});
