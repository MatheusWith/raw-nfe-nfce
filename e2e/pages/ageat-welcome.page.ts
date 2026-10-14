import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Label of the dropdown toggle that reveals the menu holding the way into the
 * SIATWeb system.
 *
 * The legacy welcome screen is the only place the portal shows this control —
 * not on the login screen, not on the application panel, not on the lost
 * session screen — which is what makes it the marker of arrival. Both role and
 * label were measured in the inspection (spike 05), not presumed.
 */
const AUTO_REGULARIZACAO_MENU_LABEL = 'Autorregularização';

/**
 * Href of the menu option that takes the session into the SIATWeb system,
 * measured in the inspection: the "SIAT" option inside the revealed menu.
 */
const SIATWEB_OPTION_HREF = 'javascript:logarSiatWeb();';

/**
 * Markup the legacy welcome screen is addressed by, as measured in spike 05.
 *
 * Grouped here so the raw markup of the screen has a single source of truth,
 * instead of being spelled inside the locator that uses it.
 */
const AGEAT_WELCOME_SELECTORS = {
  /**
   * The visible dropdown toggle.
   *
   * The class list is what picks the visible toggle over the hidden same-label
   * duplicate the page also renders; the label then narrows it to this menu.
   */
  menuToggle: 'a.dropdown-toggle.btn',

  /**
   * The option that leads to the SIATWeb system.
   *
   * Matched by href and not by accessible name on purpose: the revealed menu
   * holds both "SIAT" and "SISAT", and a name match cannot tell them apart
   * because Playwright matches accessible names by substring.
   */
  siatWebOption: `.dropdown-menu a[href="${SIATWEB_OPTION_HREF}"]`,
} as const;

/**
 * Public contract of the legacy welcome screen page object.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface AgeatWelcomePageContract {
  /**
   * The single marker that says the welcome screen is open: the dropdown toggle
   * that reveals the auto-regularização menu.
   */
  readonly autoRegularizacaoMenuTrigger: Locator;

  /** The option of the revealed menu that navigates to the SIATWeb system. */
  readonly siatWebMenuOption: Locator;

  /**
   * Confirms the welcome screen is on screen, which is what arrival means here.
   *
   * @param timeoutMs bound on the arrival, used by the sequence while it waits for the
   * crossing to finish; defaults to the Playwright assertion timeout.
   */
  expectOpen(timeoutMs?: number): Promise<void>;

  /** Reveals the auto-regularização menu, waiting for the option to appear. */
  revealAutoRegularizacaoMenu(): Promise<void>;

  /** Activates the option that leads to the SIATWeb system. */
  openSiatWebSystemOption(): Promise<void>;
}

/**
 * The legacy welcome screen of the e-AGEAT application, reached from the module
 * page through "Acessar Sistema".
 *
 * The menu trigger and the option it reveals are two distinct locators of this
 * same component, as discovered in the inspection: one control reveals a menu,
 * and inside it lies the option; there is no screen in between. Only the menu
 * is modelled — nothing that acts on a document appears here on purpose.
 */
export class AgeatWelcomePage implements AgeatWelcomePageContract {
  constructor(private readonly page: Page) {}

  /**
   * The single marker that says the welcome screen is open.
   *
   * Addressed by the measured class that bootstrap-style dropdown toggles
   * carry, narrowed by the measured label, so the visible toggle is picked and
   * the hidden same-label duplicate the page also renders is not.
   */
  get autoRegularizacaoMenuTrigger(): Locator {
    return this.page
      .locator(AGEAT_WELCOME_SELECTORS.menuToggle)
      .filter({ hasText: AUTO_REGULARIZACAO_MENU_LABEL });
  }

  /** The option of the revealed menu that navigates to the SIATWeb system. */
  get siatWebMenuOption(): Locator {
    return this.page.locator(AGEAT_WELCOME_SELECTORS.siatWebOption);
  }

  /** Confirms the welcome screen is on screen, which is what arrival means here. */
  async expectOpen(timeoutMs?: number): Promise<void> {
    await expect(this.autoRegularizacaoMenuTrigger).toBeVisible({ timeout: timeoutMs });
  }

  /** Reveals the auto-regularização menu, waiting for the option to appear. */
  async revealAutoRegularizacaoMenu(): Promise<void> {
    await this.autoRegularizacaoMenuTrigger.click();
    await expect(this.siatWebMenuOption).toBeVisible();
  }

  /** Activates the option that leads to the SIATWeb system. */
  async openSiatWebSystemOption(): Promise<void> {
    await this.siatWebMenuOption.click();
  }
}
