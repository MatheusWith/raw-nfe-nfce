import type { Locator, Page } from '@playwright/test';
import { isOnPath } from '../support/route';

/** Route the portal lands on once the authorization code has become a session. */
const APPLICATION_PANEL_PATH = '/painel-aplicacoes/main';

/**
 * Href prefix every module entry shares.
 *
 * The portal routes a module by an internal identifier, so the prefix is what
 * says "this link opens a module" regardless of which identifier it carries.
 */
const MODULE_HREF_PREFIX = '/painel-aplicacoes/paginas/';

/**
 * Markup the application panel is addressed by, as measured in the inspection.
 *
 * Grouped here so the raw markup of the screen has a single source of truth,
 * instead of being spelled inside the locator that uses it.
 */
const APPLICATION_PANEL_SELECTORS = {
  /**
   * Every module the signed-in user may open.
   *
   * The href prefix is what says "this link opens a module", whatever internal
   * identifier the portal routes it by.
   */
  moduleEntry: `a[href^="${MODULE_HREF_PREFIX}"]`,
} as const;

/**
 * Public contract of the application panel page object.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface SiatWebApplicationPanelPageContract {
  /** Every module the signed-in user may open. */
  readonly moduleEntries: Locator;

  /** The entry of a single module, addressed by its visible name. */
  getModuleEntry(moduleName: string): Locator;

  /** Tells whether the panel is on screen with its module list filled in. */
  isRendered(): Promise<boolean>;
}

/**
 * The application panel, reached once a certificate session exists.
 *
 * It is the landing route of every authenticated visit: the portal answers the
 * login screen and the panel from the same prefix, so only the module list
 * itself tells a finished session from one still being established.
 */
export class SiatWebApplicationPanelPage implements SiatWebApplicationPanelPageContract {
  constructor(private readonly page: Page) {}

  /** Every module the signed-in user may open, in whatever order the portal lists them. */
  get moduleEntries(): Locator {
    return this.page.locator(APPLICATION_PANEL_SELECTORS.moduleEntry);
  }

  /**
   * The entry of a single module, addressed by its visible name.
   *
   * Deliberately not an exact match: the portal renders the availability badge
   * inside the link, so the accessible name is the module name followed by
   * " ATIVO" and an exact name would match nothing.
   */
  getModuleEntry(moduleName: string): Locator {
    return this.page.getByRole('link', { name: moduleName });
  }

  /**
   * Tells whether the panel is on screen with its module list filled in.
   *
   * Classifies rather than asserts, and that is the whole difference from an
   * `expectOpen`. A classifier is asked *which known state the browser is in*, and
   * the browser is legitimately in none of them for a while: the portal answers the
   * authorization code on this route before it can list the modules, so there is a
   * stretch where the session exists and the panel has not rendered yet. An arrival
   * assertion would fail there, and its failure would say "the panel is not here"
   * about a session that is still being established — indistinguishable, in the
   * report, from a portal that never answered.
   *
   * So this returns a verdict and never throws: an unreadable document answers
   * "not the panel yet", because that is what an unreadable document means to the
   * caller polling it. Both the route and the list are required, so the loading shell
   * of the callback route is never mistaken for a live session.
   *
   * The route is compared exactly, because the login screen is served one path above
   * this one and a prefix comparison would accept it.
   */
  async isRendered(): Promise<boolean> {
    if (!isOnPath(this.page.url(), APPLICATION_PANEL_PATH)) {
      return false;
    }

    return (await this.moduleEntries.count()) > 0;
  }
}
