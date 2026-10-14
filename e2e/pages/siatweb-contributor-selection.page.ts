import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Title of the dialog the portal opens to choose which company the session acts for. */
const DIALOG_TITLE = 'Selecionar Contribuinte';

/** Label of the button that runs the search inside the dialog. */
const SEARCH_BUTTON_NAME = 'Consultar';

/** Accessible name the portal gives the per-row control that picks a company. */
const SELECT_ACTION_TITLE = 'selecionar';

/**
 * Markup the contributor dialog is addressed by, as measured in the inspection.
 *
 * Grouped here so the raw markup of the screen has a single source of truth,
 * instead of being spelled inside the locator that uses it.
 */
const CONTRIBUTOR_SELECTION_SELECTORS = {
  /**
   * A company the session may act for.
   *
   * The dialog lists the companies in a table, so a row is a table row. The
   * header row is excluded by filtering on the select control rather than by
   * position, which keeps the result honest if the portal adds or reorders
   * columns.
   */
  row: 'tr',
} as const;

/**
 * Public contract of the contributor selection page object.
 *
 * No arrival operation, and deliberately so: the dialog is the portal's answer to
 * arriving with no company chosen, not a marker that tells this screen apart from
 * any other, so an operation invented to fill the gap would claim a distinction it
 * cannot make. {@link SiatWebContributorSelectionPageContract.searchAllContributors}
 * is the arrival proof instead — it runs the search and then proves a row can be
 * picked — and every other member is a step that follows it.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface SiatWebContributorSelectionPageContract {
  /** The dialog itself, scoped by its title. */
  readonly dialog: Locator;

  /** Rows that can be picked, the header row excluded. */
  readonly contributorRows: Locator;

  /** Runs the search that lists the companies this session may act for. */
  searchAllContributors(): Promise<void>;

  /**
   * Picks the first company the session may act for and returns the row text,
   * so the caller can name the company in a failure.
   */
  selectFirstAvailableContributor(): Promise<string>;

  /**
   * Picks the company identified by its inscription and returns the row text,
   * so the caller can name the company in a failure.
   */
  selectContributorByInscription(inscription: string): Promise<string>;
}

/**
 * The contributor picker the portal opens on arrival.
 *
 * A session that signs in as an accountant has no company yet, and the dialog is
 * modal: its scrim blocks every module entry until a company is chosen. The
 * dialog also refuses to be dismissed while the search is empty, so choosing a
 * company is the only way forward rather than a detail of the flow.
 */
export class SiatWebContributorSelectionPage implements SiatWebContributorSelectionPageContract {
  constructor(private readonly page: Page) {}

  /** The dialog itself, scoped by its title so an unrelated dialog cannot be mistaken for it. */
  get dialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: DIALOG_TITLE });
  }

  /**
   * Rows that can be picked, the header row excluded.
   *
   * Filtering on the select control rather than on position keeps this honest if
   * the portal ever adds or reorders columns.
   */
  get contributorRows(): Locator {
    return this.dialog
      .locator(CONTRIBUTOR_SELECTION_SELECTORS.row)
      .filter({ has: this.page.getByTitle(SELECT_ACTION_TITLE) });
  }

  /**
   * Runs the search that lists the companies this session may act for.
   *
   * The portal accepts it with every field empty, and that is the only search
   * that works without already knowing a company identifier.
   */
  async searchAllContributors(): Promise<void> {
    await this.dialog.getByRole('button', { name: SEARCH_BUTTON_NAME }).click();
    await expect(this.contributorRows.first()).toBeVisible();
  }

  /**
   * Picks the first company the session may act for and returns the row text.
   *
   * Which company matters for the module's data, so this is a deliberate
   * placeholder rather than a final choice: the tests built on top of it need a
   * named company, and the portal lets the contributor be changed afterwards. The
   * row text comes back for the same reason the by-inscription picker returns it —
   * a dead end downstream is only diagnosable if the failure says which company the
   * session was acting for.
   */
  async selectFirstAvailableContributor(): Promise<string> {
    const row = this.contributorRows.first();
    const companyRow = (await row.innerText()).trim().replace(/\s+/g, ' ');
    await row.getByTitle(SELECT_ACTION_TITLE).click();
    return companyRow;
  }

  /**
   * Picks the company identified by its inscription and returns the row text,
   * so the caller can name the company in a failure.
   *
   * The inscription is unique per row, so it picks one company even if the
   * list is reordered or several rows share a corporate name.
   */
  async selectContributorByInscription(inscription: string): Promise<string> {
    const row = this.contributorRows.filter({ hasText: inscription });
    const companyRow = (await row.innerText()).trim().replace(/\s+/g, ' ');
    await row.getByTitle(SELECT_ACTION_TITLE).click();
    return companyRow;
  }
}
