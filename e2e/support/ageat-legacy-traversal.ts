import { test, type Page } from '@playwright/test';
import {
  ageatModule,
  ageatWelcome,
  siatWebContributorSelection,
  siatWebSystem,
} from '../pages/factories';
import { openEageatModuleFromPanel } from './ageat-module-access';
import { expectArrival } from './arrival';
import { LegacyTraversalError, LostSessionError } from './legacy-traversal-error';
import {
  LEGACY_ARRIVAL_TIMEOUT_MS,
  LEGACY_ENTRY_TIMEOUT_MS,
  SIATWEB_ARRIVAL_TIMEOUT_MS,
} from './timeouts';

/** Text that identifies the lost-session screen the portal answers with. */
const LOST_SESSION_SCREEN_TEXT = 'Usuário não identificado';

/**
 * Takes the session from the module page to the legacy welcome screen.
 *
 * The same way the login and the module access are, this is named, explicit and
 * appears as steps in the report. It runs for the first company the portal offers
 * the session, and every dead end fails immediately, without retrying: the company
 * is named in the error as the first suspect.
 */
export async function enterAgeatLegacySystem(page: Page): Promise<void> {
  let companyName = '';

  await test.step('Choose the company the traversal runs as', async () => {
    const selection = siatWebContributorSelection(page);
    await selection.searchAllContributors();
    companyName = await selection.selectFirstAvailableContributor();
  });

  await openEageatModuleFromPanel(page);

  await test.step('Cross from the module page into the legacy system', async () => {
    const modulePage = ageatModule(page);
    try {
      // Prove arrival to the module before actuating, because after the actuation the
      // entry control no longer exists. This single claim is also the only claim that
      // the control is there: waiting for it and then asserting it proved the same
      // thing twice, and the second time under a bound short enough to report a
      // control that had already arrived as one that never did.
      await modulePage.expectOpen(LEGACY_ENTRY_TIMEOUT_MS);
      // The loading overlay the module draws over the page intercepts the
      // pointer events, as measured in the inspection, so the click has to be
      // forced.
      // eslint-disable-next-line playwright/no-force-option
      await modulePage.moduleEntryControl.click({ force: true });
    } catch {
      // The module page may have crossed on its own before the control was
      // actioned, which the portal does after a while. No failure is swallowed
      // here: the single post-requisite below decides whether the session
      // arrived, and it fails with diagnostics if it did not.
    }
  });

  await test.step('Confirm the legacy welcome screen is on screen', async () => {
    const welcome = ageatWelcome(page);
    await expectArrival(
      page,
      async () => {
        await welcome.expectOpen(LEGACY_ARRIVAL_TIMEOUT_MS);
      },
      (screenText) => buildLandingFailure(companyName, screenText),
    );
  });
}

/**
 * Names the failure that an unexpected landing produced, the same way the
 * certificate login names its own dead ends: the lost-session screen gets its
 * own error that suspects the company, and any other landing gets a traversal
 * error carrying the screen text.
 */
function buildLandingFailure(companyName: string, screenText: string): Error {
  if (screenText.includes(LOST_SESSION_SCREEN_TEXT)) {
    return new LostSessionError(companyName, screenText);
  }

  return new LegacyTraversalError(
    'The session reached neither the legacy welcome screen nor the lost-session screen ' +
      'after crossing from the e-AGEAT module.',
    screenText,
  );
}

/**
 * Takes the session from the legacy welcome screen to the SIATWeb system.
 *
 * Reveals the auto-regularização menu, activates the option that leads to the
 * SIATWeb system and waits for the arrival to the destination origin. The
 * destination is never clicked on: the traversal ends at the arrival. Any
 * second authentication, or any landing that is not the destination, is an
 * error, never a step to work around.
 */
export async function enterSiatWebSystem(page: Page): Promise<void> {
  await test.step('Reveal the auto-regularização menu on the welcome screen', async () => {
    const welcome = ageatWelcome(page);
    await welcome.expectOpen();
    await welcome.revealAutoRegularizacaoMenu();
  });

  await test.step('Activate the option that leads to SIATWeb', async () => {
    const welcome = ageatWelcome(page);
    await welcome.openSiatWebSystemOption();
  });

  await test.step('Confirm the session reached the SIATWeb system', async () => {
    const destination = siatWebSystem(page);
    await expectArrival(
      page,
      async () => {
        await destination.expectOpen(SIATWEB_ARRIVAL_TIMEOUT_MS);
      },
      (screenText) =>
        new LegacyTraversalError(
          'The session did not arrive at the SIATWeb system after activating the menu ' +
            'option. A second authentication anywhere along the crossing is an error, ' +
            'and so is any landing that is not the destination.',
          screenText,
        ),
    );
  });
}
