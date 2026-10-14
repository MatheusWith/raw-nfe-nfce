import { expect, type Locator, type Page } from '@playwright/test';
import { MissingExportControlError } from './nfe-export-error';

/**
 * How a screen decides it is ready to be used.
 *
 * Two screens served by a postback on the same route answered that question with
 * the same algorithm written twice: wait for the controls the flow needs to turn up,
 * name the ones that did not, then confirm each is visible and enabled. The
 * divergence was in the message and nothing else, which is the shape of duplication
 * that hides a difference nobody wrote on purpose.
 */

/**
 * A control a screen has to carry before the flow can use it.
 *
 * Named rather than counted, because a screen that renders half of the form and one
 * that renders none of it are different failures and only the names tell them apart.
 */
export interface RequiredScreenControl {
  /** How the person would name this control, as it appears in a failure. */
  readonly name: string;

  /** Locator that resolves to the control. */
  readonly locator: (page: Page) => Locator;
}

/** Names the required controls the screen is not carrying. */
async function missingControls(
  page: Page,
  controls: readonly RequiredScreenControl[],
): Promise<string[]> {
  const missing: string[] = [];

  for (const control of controls) {
    if ((await control.locator(page).count()) === 0) {
      missing.push(control.name);
    }
  }

  return missing;
}

/**
 * Waits until the screen serves every control the flow requires.
 *
 * Web-first on purpose: a screen served by a postback on the same route turns its
 * controls up a moment after the action that asked for it, and a plain count taken
 * straight away would read that as a screen that never rendered them — a different
 * failure, and a wrong one to report.
 *
 * @param timeoutMs bound on the controls turning up; defaults to the Playwright
 * assertion timeout.
 * @param pollMessage what the wait says, in the words of the screen it is about.
 */
export async function expectScreenControlsServed(
  page: Page,
  controls: readonly RequiredScreenControl[],
  timeoutMs: number | undefined,
  pollMessage: string,
): Promise<void> {
  try {
    await expect
      .poll(async () => (await missingControls(page, controls)).length, {
        timeout: timeoutMs,
        message: pollMessage,
      })
      .toBe(0);
  } catch (cause) {
    throw new MissingExportControlError(await missingControls(page, controls), cause);
  }
}

/**
 * Confirms every required control is visible and enabled.
 *
 * Says what the previous step cannot: that the controls are there *and usable*.
 * It deliberately does not wait for them, because it follows a step that already
 * waited with the bound the screen actually asks for — polling here again would
 * spend the default five seconds asking a question that has been answered, which is
 * how a proven screen ends up looking slow.
 */
export async function expectScreenControlsUsable(
  page: Page,
  controls: readonly RequiredScreenControl[],
): Promise<void> {
  for (const control of controls) {
    await expect(control.locator(page)).toBeVisible();
    await expect(control.locator(page)).toBeEnabled();
  }
}

/**
 * Waits for the controls the flow requires, then confirms they are usable.
 *
 * The whole of "the screen is ready", for the caller that has no earlier claim on the
 * arrival. A caller that already proved the arrival wants only
 * {@link expectScreenControlsUsable}, so that the controls are waited for once.
 */
export async function expectScreenReady(
  page: Page,
  controls: readonly RequiredScreenControl[],
  timeoutMs: number | undefined,
  pollMessage: string,
): Promise<void> {
  await expectScreenControlsServed(page, controls, timeoutMs, pollMessage);
  await expectScreenControlsUsable(page, controls);
}
