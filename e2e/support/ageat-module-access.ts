import { expect, test, type Page } from '@playwright/test';
import { AGEAT_MODULE_NAME } from '../pages/ageat-module.page';
import {
  ageatModule,
  siatWebApplicationPanel,
  siatWebContributorSelection,
} from '../pages/factories';

/**
 * Opens the e-AGEAT module from the authenticated application panel and proves
 * arrival.
 *
 * Shared by the module-access sequence and the legacy traversal, so that both
 * open the module exactly the same way; only the company choice differs.
 */
export async function openEageatModuleFromPanel(page: Page): Promise<void> {
  await test.step('Open the e-AGEAT module from the application panel', async () => {
    const panel = siatWebApplicationPanel(page);
    await panel.getModuleEntry(AGEAT_MODULE_NAME).first().click();
  });

  await test.step('Confirm the module page is on screen', async () => {
    // The route changes before the panel is swapped out, so the module list has
    // to be gone before the module page can be believed.
    const panel = siatWebApplicationPanel(page);
    await expect(panel.moduleEntries).toHaveCount(0);
    const modulePage = ageatModule(page);
    await modulePage.expectOpen();
  });
}

/**
 * Reaches the e-AGEAT module from an authenticated session.
 *
 * Separate from the login, and called explicitly like it, so that both stages
 * show up in the report and no session is shared between tests. Reaching the
 * module means choosing a company first, which the portal requires.
 */
export async function openAgeatModule(page: Page): Promise<void> {
  await test.step('Choose which company the session acts for', async () => {
    const selection = siatWebContributorSelection(page);
    await selection.searchAllContributors();
    await selection.selectFirstAvailableContributor();
  });

  await openEageatModuleFromPanel(page);
}
