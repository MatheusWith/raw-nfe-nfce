import { expect, type Page } from '@playwright/test';
import { siatWebNfeExport, siatWebNfceIssuerForm } from './factories';
import { getSiatWebSystemOrigin } from '../support/environment';
import { originAndPathPattern } from '../support/route';
import { MENU_WALK_TIMEOUT_MS } from '../support/timeouts';

/**
 * Route, on the destination origin, of the screen the traversal arrives at.
 *
 * The option "SIAT" on the welcome screen navigates the same tab to this route
 * (measured in the inspection, spike 05). The address is the marker of arrival:
 * it only exists on the destination origin, and it is the screen the download
 * phase will start from.
 */
const DESTINATION_ARRIVAL_PATH = '/siatweb/faces/index.xhtml';

/**
 * Menu groups that lead to the NF-e screen, in the order they nest.
 *
 * Both open on the pointer rather than on a click (measured in spike 06), so
 * they are revealed by hovering and never actuated.
 */
const NF_EXPORT_MENU_GROUPS = ['Autoatendimento', 'NF-e'] as const;

/**
 * Menu item that opens the "Consultar/Exportar NF-e" screen.
 *
 * Matched on its exact text, and the exactness is what makes it safe: by
 * substring the same text also matches "Consultar/Exportar NF-e Detalhada",
 * which measured two elements where the exact match measures one.
 */
const NF_EXPORT_MENU_ITEM = 'Consultar/Exportar NF-e';

/**
 * Menu groups that lead to the NFC-e screen, in the order they nest.
 *
 * A different branch of the same menu, opening on the pointer rather than on a
 * click under the same measurement, so they are revealed by hovering and never
 * actuated. `NFC-e` is matched by its exact text wherever it is matched: measured
 * in spike 08 as one element by exact text and **two** by substring, so a loose
 * match would walk into an unrelated item.
 */
const NFCE_MENU_GROUPS = ['Autoatendimento', 'NFC-e'] as const;

/**
 * Menu item that opens the "Consultar/Exportar NFC-e" screen.
 *
 * Measured as one element by its exact text. The exactness is what makes it safe,
 * and it is the same reason the NF-e item is matched exactly.
 */
const NFCE_MENU_ITEM = 'Consultar/Exportar NFC-e';

/**
 * Public contract of the SIATWeb system page object.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface SiatWebSystemPageContract {
  /**
   * Confirms the SIATWeb system is on screen, which is what arrival means here.
   *
   * @param timeoutMs bound on the arrival, used by the sequence while it waits
   * for the crossing to finish; defaults to the Playwright assertion timeout.
   */
  expectOpen(timeoutMs?: number): Promise<void>;

  /**
   * Walks the menu to the "Consultar/Exportar NF-e" screen and activates it.
   *
   * Returns as soon as the screen is on screen: what is done with the form that
   * opens there is the business of the component that models it.
   *
   * @param screenArrivalTimeoutMs bound on the screen being served after the
   * menu item is activated; defaults to the Playwright assertion timeout.
   */
  openNfeExportScreen(screenArrivalTimeoutMs?: number): Promise<void>;

  /**
   * Walks the menu to the "Consultar/Exportar NFC-e" screen, activates it, and
   * leaves it ready for use.
   *
   * This one carries the notice dismissal and the usability check as well, where
   * the NF-e opening leaves them to its arrival sequence: the NFC-e screen is
   * opened from the cycle itself, and having the cycle reassemble the same three
   * steps on every revisit is what a shared composition exists to prevent. Returns
   * with the notice out of the way and the export form usable, so a caller that
   * does nothing else is still in a state the flow can work from.
   *
   * @param screenArrivalTimeoutMs bound on the screen being served after the
   * menu item is activated; defaults to the Playwright assertion timeout.
   */
  openNfceExportScreen(screenArrivalTimeoutMs?: number): Promise<void>;
}

/**
 * The SIATWeb system, served by another origin than the portal.
 *
 * The traversal ends here; from this screen the automation navigates to the export
 * screens via the menu — the NF-e branch and, for the third flow, the NFC-e branch.
 * Arrival is proven by the URL, which only exists on the destination origin, and is
 * therefore absolute and built from the configured destination origin — a relative
 * route would resolve to the portal's own origin. Beyond that, only the way into
 * each screen is modelled: what is done with the form that opens there belongs to
 * the component that models it.
 */
export class SiatWebSystemPage implements SiatWebSystemPageContract {
  constructor(private readonly page: Page) {}

  /** Confirms the SIATWeb system is on screen, which is what arrival means here. */
  async expectOpen(timeoutMs?: number): Promise<void> {
    await expect(this.page).toHaveURL(buildSiatWebSystemArrivalUrlPattern(), {
      timeout: timeoutMs,
    });
  }

  /**
   * Walks the menu to the "Consultar/Exportar NF-e" screen and activates it.
   *
   * The item is activated on the same tab by a JSF postback on the same route,
   * so there is no history to go back to afterwards and every opening starts
   * from this menu again.
   */
  async openNfeExportScreen(screenArrivalTimeoutMs?: number): Promise<void> {
    await this.walkMenu(NF_EXPORT_MENU_GROUPS, NF_EXPORT_MENU_ITEM);

    const screen = siatWebNfeExport(this.page);
    await screen.expectOpen(screenArrivalTimeoutMs);
  }

  async openNfceExportScreen(screenArrivalTimeoutMs?: number): Promise<void> {
    await this.walkMenu(NFCE_MENU_GROUPS, NFCE_MENU_ITEM);

    const form = siatWebNfceIssuerForm(this.page);
    await form.expectOpen(screenArrivalTimeoutMs);
    // The notice is dismissed here rather than by the caller because this method
    // promises a screen ready to be worked from, and while the notice is up the form
    // behind it is not usable. Idempotent, so a screen the portal did not serve a
    // notice on costs the visibility read and nothing else.
    await form.dismissNotice();
    await form.expectUsable();
  }

  /**
   * Reveals a menu branch by hovering each of its groups in turn, then activates
   * its item.
   *
   * The walk is bounded apart from the screen's arrival, and the bound is the walk's
   * own: an element that never becomes actionable used to wait out the test's whole
   * deadline with no request going out at all (measured twice — 403 s inside a single
   * `hover`), and the report then named the deadline instead of the menu. Bounding it
   * here is what turns that into a failure that says which step stopped answering.
   *
   * Both branches share the walk because hovering a group and clicking an item is
   * one behaviour of the menu, not two; what each branch opens is the different
   * part, and that stays in the methods that call this one.
   */
  private async walkMenu(groups: readonly string[], item: string): Promise<void> {
    for (const group of groups) {
      await this.page.getByText(group, { exact: true }).hover({ timeout: MENU_WALK_TIMEOUT_MS });
    }
    await this.page.getByText(item, { exact: true }).click({ timeout: MENU_WALK_TIMEOUT_MS });
  }
}

/**
 * Builds the arrival URL expectation from the configured destination origin.
 *
 * Exported so the sequence can wait on the same single marker without
 * duplicating how the arrival address is put together.
 */
export function buildSiatWebSystemArrivalUrlPattern(): RegExp {
  return originAndPathPattern(getSiatWebSystemOrigin(), DESTINATION_ARRIVAL_PATH);
}
