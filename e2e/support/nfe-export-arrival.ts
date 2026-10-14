import { test, type Page } from '@playwright/test';
import { siatWebNfeExport, siatWebSystem } from '../pages/factories';
import { NF_EXPORT_SCREEN_TIMEOUT_MS } from './timeouts';

/**
 * Takes the session from the SIATWeb system to a usable NF-e export screen.
 *
 * Named and explicit like the login and the traversal, and for the same reason:
 * each stage shows up in the report as a step of its own, and no stage is hidden
 * inside another. The menu walk, the arrival proof and the dismissal of the
 * notice are three separate steps, because a screen that opens, a screen whose
 * controls are all there, and a screen whose notice is out of the way are three
 * different claims.
 *
 * Nothing is filled in, no choice is marked and nothing is scheduled here: the
 * screen opens, the notice is acknowledged, and the flow stops there.
 */
export async function openNfeExportScreen(page: Page): Promise<void> {
  await test.step('Walk the destination menu to the NF-e export screen', async () => {
    // The arrival is proved inside the walk, before anything on the screen is
    // touched: a screen that came out wrong has to be named as such, not
    // reported later as a control that would not act.
    const system = siatWebSystem(page);
    await system.openNfeExportScreen(NF_EXPORT_SCREEN_TIMEOUT_MS);
  });

  await test.step('Dismiss the notice on the NF-e export screen', async () => {
    const screen = siatWebNfeExport(page);
    await screen.dismissNotice();
  });

  await test.step('Confirm the NF-e export screen is usable', async () => {
    const screen = siatWebNfeExport(page);
    await screen.expectUsable();
  });
}
