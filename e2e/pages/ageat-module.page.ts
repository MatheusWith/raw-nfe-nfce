import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { pathPrefixPattern } from '../support/route';

/**
 * Name the portal lists the e-AGEAT module by, both in the panel and in its route.
 *
 * Exported as the single source of truth: the panel entry and the route identify
 * the same module, and nothing but this constant keeps them from drifting apart.
 */
export const AGEAT_MODULE_NAME = 'e-AGEAT';

/** Route the portal serves the module on, followed by its own identifier. */
const AGEAT_MODULE_PATH_PREFIX = `/painel-aplicacoes/paginas/${AGEAT_MODULE_NAME}/`;

/**
 * The control that takes the session from the module page into the e-AGEAT
 * system itself.
 *
 * The portal renders the module as its own legacy application under `/eageat`,
 * and this control is the only thing on the page that crosses into it. It is the
 * marker of arrival because the portal shows it on the module page and nowhere
 * else: not on the login screen, and not on the application panel.
 */
const MODULE_ENTRY_CONTROL = 'Acessar Sistema';

/**
 * Public contract of the e-AGEAT module page object.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface AgeatModulePageContract {
  /** The single marker that says the module is open. */
  readonly moduleEntryControl: Locator;

  /**
   * Confirms the module page is on screen, which is what arrival means here.
   *
   * @param timeoutMs bound on the arrival, used by the sequence while it waits for the
   * module to be served; defaults to the Playwright assertion timeout.
   */
  expectOpen(timeoutMs?: number): Promise<void>;

  /**
   * Confirms the session is served the module route.
   *
   * The module is served from the same application panel as the login screen, so
   * the route is the only thing that tells a module arrival apart from a session
   * that silently fell back to the login screen.
   */
  expectModuleRoute(): Promise<void>;
}

/**
 * The e-AGEAT module page.
 *
 * Only the arrival is modelled. The controls that act on a document, such as
 * acknowledging or answering a message, are deliberately left out so that no test
 * can reach them by accident from this page object.
 */
export class AgeatModulePage implements AgeatModulePageContract {
  constructor(private readonly page: Page) {}

  /**
   * The single marker that says the module is open.
   *
   * Addressed by text because the portal renders it as a list item rather than
   * a link or a button, so it carries no role of its own to address it by.
   */
  get moduleEntryControl(): Locator {
    return this.page.getByText(MODULE_ENTRY_CONTROL);
  }

  /** Confirms the module page is on screen, which is what arrival means here. */
  async expectOpen(timeoutMs?: number): Promise<void> {
    await expect(this.moduleEntryControl).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * Confirms the session is served the module route.
   *
   * Matched as a prefix rather than exactly, because the portal serves the module
   * under its own internal identifier after the prefix.
   */
  async expectModuleRoute(): Promise<void> {
    await expect(this.page).toHaveURL(pathPrefixPattern(AGEAT_MODULE_PATH_PREFIX));
  }
}
