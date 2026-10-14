import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  expectScreenControlsServed,
  expectScreenControlsUsable,
  type RequiredScreenControl,
} from '../support/screen-readiness';

/**
 * Accessible name of the group that holds the search-by-key form.
 *
 * Measured on the arrival state, and used instead of the field's own label: the
 * field carries a visible label but no `<label for>`, so `getByLabel` cannot
 * resolve it, and the group is the only thing around it the person reads.
 */
const CONSULT_DATA_GROUP_NAME = 'Dados da Consulta';

/**
 * Name of the control that acknowledges the notice the screen opens with.
 *
 * Measured as the only element with that accessible name, and as a button, so
 * the semantic role locator resolves it without any markup.
 */
const NOTICE_ACKNOWLEDGEMENT_NAME = 'Entendi';

/**
 * Button of the search-by-key form, which is the marker of arrival.
 *
 * It is NOT the scheduling button: "Agendar exportação" belongs to the
 * destination-recipient form and does not exist yet (measured in spike 06). This
 * one exports a single NF-e by its access key, which no part of this flow asks
 * for, so it is only ever asserted on, never actuated.
 */
const SINGLE_NOTE_EXPORT_BUTTON_NAME = 'Exportar';

/**
 * The controls the arrival state has to carry for the flow to be possible.
 *
 * The screen does not open on the export form (measured in spike 06): it opens
 * on the search-by-key form, and the inscription control, the emission date
 * fields and the "Agendar exportação" button only come into being once the
 * destination-recipient role is chosen. Asserting them here would assert a
 * state this screen is not in.
 */
const ARRIVAL_CONTROLS = [
  {
    name: 'the search-by-key field',
    locator: (page: Page): Locator =>
      page.getByRole('group', { name: CONSULT_DATA_GROUP_NAME, exact: true }).getByRole('textbox'),
  },
  {
    name: 'the search-by-key export button',
    locator: (page: Page): Locator =>
      page.getByRole('button', { name: SINGLE_NOTE_EXPORT_BUTTON_NAME, exact: true }),
  },
] as const satisfies readonly RequiredScreenControl[];

/** What the wait for the arrival controls says, in the words of this screen. */
const ARRIVAL_CONTROLS_POLL_MESSAGE =
  'The NF-e export screen did not serve the controls the flow requires. ' +
  'The screen arrived in a shape the flow does not know how to use.';

/**
 * Public contract of the "Consultar/Exportar NF-e" screen.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface SiatWebNfeExportPageContract {
  /**
   * The single marker that says the screen opened on its search-by-key form.
   *
   * The button of that form is the element that disappears once the role is
   * chosen, so its presence proves the arrival state and not the export form.
   */
  readonly arrivalMarker: Locator;

  /**
   * The control that acknowledges the notice, used to prove the notice left the
   * screen.
   */
  readonly noticeAcknowledgement: Locator;

  /**
   * Confirms the screen is on its arrival state, before anything is touched.
   *
   * @param timeoutMs bound on the screen being served; defaults to the
   * Playwright assertion timeout.
   */
  expectOpen(timeoutMs?: number): Promise<void>;

  /** Confirms the arrival state carries every control the flow needs. */
  expectUsable(): Promise<void>;

  /** Acknowledges the notice, on any opening where the screen shows one. */
  dismissNotice(): Promise<void>;
}

/**
 * The "Consultar/Exportar NF-e" screen of the SIATWeb system, reached from the
 * destination menu.
 *
 * What is modelled here is exactly the arrival: that the screen opened on its
 * search-by-key form, that the controls the flow needs are on it, and that the
 * notice is out of the way. Choosing the destination-recipient role — and
 * everything that follows on that form, down to scheduling — belongs to the
 * component that models the form itself, which this one deliberately does not
 * reach.
 */
export class SiatWebNfeExportPage implements SiatWebNfeExportPageContract {
  constructor(private readonly page: Page) {}

  get arrivalMarker(): Locator {
    return this.page.getByRole('button', { name: SINGLE_NOTE_EXPORT_BUTTON_NAME, exact: true });
  }

  get noticeAcknowledgement(): Locator {
    return this.page.getByRole('button', { name: NOTICE_ACKNOWLEDGEMENT_NAME, exact: true });
  }

  async expectOpen(timeoutMs?: number): Promise<void> {
    await expectScreenControlsServed(
      this.page,
      ARRIVAL_CONTROLS,
      timeoutMs,
      ARRIVAL_CONTROLS_POLL_MESSAGE,
    );
    await expect(this.arrivalMarker).toBeVisible({ timeout: timeoutMs });
  }

  async expectUsable(): Promise<void> {
    // Only the usability is claimed here. The arrival was already proved by
    // `expectOpen`, under the bound this screen asks for, so waiting for the
    // controls a second time would spend the default five seconds on a question
    // that has been answered.
    await expectScreenControlsUsable(this.page, ARRIVAL_CONTROLS);
  }

  async dismissNotice(): Promise<void> {
    const acknowledgement = this.noticeAcknowledgement;
    // Measured: the notice is a modal dialog, so it is either on the screen or
    // not, with no partial state in between. While it is up the form behind it
    // is not usable, so it has to go before anything else is claimed; when the
    // portal does not show it there is nothing to dismiss and the assertion
    // below still holds.
    if (await acknowledgement.isVisible()) {
      await acknowledgement.click();
    }
    await expect(acknowledgement).toBeHidden();
  }
}
