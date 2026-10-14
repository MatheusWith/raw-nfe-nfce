import type { Page } from '@playwright/test';
import { AgeatModulePage, type AgeatModulePageContract } from './ageat-module.page';
import { AgeatWelcomePage, type AgeatWelcomePageContract } from './ageat-welcome.page';
import {
  SiatWebApplicationPanelPage,
  type SiatWebApplicationPanelPageContract,
} from './siatweb-application-panel.page';
import {
  SiatWebContributorSelectionPage,
  type SiatWebContributorSelectionPageContract,
} from './siatweb-contributor-selection.page';
import { SiatWebLoginPage, type SiatWebLoginPageContract } from './siatweb-login.page';
import {
  SiatWebNfeContributorFormPage,
  type SiatWebNfeContributorFormPageContract,
} from './siatweb-nfe-contributor-form.page';
import {
  SiatWebNfeIssuerFormPage,
  type SiatWebNfeIssuerFormPageContract,
} from './siatweb-nfe-issuer-form.page';
import {
  SiatWebNfceIssuerFormPage,
  type SiatWebNfceIssuerFormPageContract,
} from './siatweb-nfce-issuer-form.page';
import { SiatWebNfeExportPage, type SiatWebNfeExportPageContract } from './siatweb-nfe-export.page';
import { SiatWebSystemPage, type SiatWebSystemPageContract } from './siatweb-system.page';

/**
 * One factory per screen, and the only place a page object is ever constructed.
 *
 * Building one is free; reading twenty-eight of them is not. Each construction spent
 * a line — sometimes three, and once four of them in a single module — saying the
 * same thing a step beside it already said, to the point where a step of the sequence
 * was shorter than the line preparing its object. The repetition also let a
 * consumer reach for the class and its contract in one import, when the contract was
 * all it ever depended on.
 *
 * So each factory returns the contract, and no consumer names a class: a swap behind a
 * contract stays invisible because nothing outside this module ever named the thing
 * being swapped.
 *
 * The construction stays explicit at the point of use. The idiomatic alternative — a
 * Playwright fixture handing out every screen — was considered and refused: it would
 * make each support module depend on the fixture in order to be used, turning a
 * one-line change into a signature change across nineteen files.
 *
 * This module and the screens are mutually dependent — the SIATWeb system screen
 * walks the menu to a screen of its own, so it needs that screen's factory. The
 * cycle is safe because every reference is inside a function body: nothing here
 * touches a class at module scope, and nothing there touches this module at module
 * scope, so neither is ever read before it is initialised.
 */

export function ageatModule(page: Page): AgeatModulePageContract {
  return new AgeatModulePage(page);
}

export function ageatWelcome(page: Page): AgeatWelcomePageContract {
  return new AgeatWelcomePage(page);
}

export function siatWebApplicationPanel(page: Page): SiatWebApplicationPanelPageContract {
  return new SiatWebApplicationPanelPage(page);
}

export function siatWebContributorSelection(page: Page): SiatWebContributorSelectionPageContract {
  return new SiatWebContributorSelectionPage(page);
}

export function siatWebLogin(page: Page): SiatWebLoginPageContract {
  return new SiatWebLoginPage(page);
}

export function siatWebNfeContributorForm(page: Page): SiatWebNfeContributorFormPageContract {
  return new SiatWebNfeContributorFormPage(page);
}

/**
 * The issuer form is built with the contributor form it delegates to, and this is
 * the only place the two are put together.
 *
 * Injected rather than looked up inside the class, so that the issuer page object
 * holds a contract instead of reaching for a factory: the seven delegated
 * operations are the other page object's, and the class states that as a dependency
 * it was given.
 */
export function siatWebNfeIssuerForm(page: Page): SiatWebNfeIssuerFormPageContract {
  return new SiatWebNfeIssuerFormPage(page, siatWebNfeContributorForm(page));
}

/**
 * The NFC-e form is built from the page alone, and that is the whole difference
 * from its NF-e sibling above: the NF-e screen opens on a search-by-key state that
 * only becomes the form once a role is marked, so two page objects model one screen
 * and the second is given the first. The NFC-e screen **arrives** on the export form
 * (measured in spike 08), so there is no form of a contributor to inject and one
 * object owns the screen from arrival to registration.
 */
export function siatWebNfceIssuerForm(page: Page): SiatWebNfceIssuerFormPageContract {
  return new SiatWebNfceIssuerFormPage(page);
}

export function siatWebNfeExport(page: Page): SiatWebNfeExportPageContract {
  return new SiatWebNfeExportPage(page);
}

export function siatWebSystem(page: Page): SiatWebSystemPageContract {
  return new SiatWebSystemPage(page);
}
