import { expect, test, type Page } from '@playwright/test';
import { siatWebNfceIssuerForm, siatWebSystem } from '../pages/factories';
import { type EmissionPeriod } from './environment';
import {
  MissingScheduledExportError,
  PortalInternalErrorScreenError,
  type ScheduledExportReference,
} from './nfe-export-error';
import { isOnPath } from './route';
import { NF_EXPORT_SCREEN_TIMEOUT_MS, SCHEDULED_ROW_TIMEOUT_MS } from './timeouts';

/*
 * The scheduling cycle of the **NFC-e** branch: the same list, the same period and
 * the same seam as the two NF-e cycles, walked a third time down another menu branch
 * and against another screen.
 *
 * A third module rather than one cycle parameterised by its screen, and that is the
 * recorded design and not an oversight (ADR 0010, extended by ADR 0011). What each
 * cycle says about the portal and about its own screen is stated in its own module,
 * so that a change on one side cannot quietly become a change on the others:
 *
 * - The **work item** and the **portal's internal error screen** are written here
 *   again, and the reasoning for each is where it is declared. Neither is a borrow
 *   from another cycle: no two cycle modules import each other's code in any place,
 *   which is the structural half of "the cycles are separate", and a few lines of
 *   duplicated shape are the price of a guarantee the compiler would otherwise have
 *   to enforce by hand.
 * - Everything a cycle does — revisit, count, fill, click, prove — is written here
 *   again, because it names the page object of its own screen at every step.
 * - The markup itself lives in the page objects, one object per screen, and never
 *   here: support modules orchestrate screens and do not know markup.
 *
 * What this cycle does **not** share with the NF-e ones is the screen it opens: the
 * walk goes down `Autoatendimento → NFC-e`, the object is the NFC-e form, and the
 * table it reads is `lista-agendamentos-nfce`. The NF-e cycles and this one never
 * read the same table, so neither can mistake the other's rows for its proof.
 *
 * The privacy rule of the whole suite holds here unchanged: a failure is named by
 * the item's **position** in `E2E_NFE_EXPORT_INSCRIPTIONS` and never by its value,
 * because the value is fiscal data of a real company and a Playwright report copies
 * whatever a failed assertion carries.
 */

/**
 * One export to schedule, as this cycle works with it.
 *
 * Declared a third time on purpose, and this is the one place where the cycles name
 * the same thing more than once. It is *not* screen knowledge — it is the configured
 * list, turned into a value and a position — so the tempting move was to read it from
 * another cycle. That was refused for the reason this whole delivery rests on: it
 * would make one cycle's module depend on another's, and nothing else in the flows
 * does. The shape is four lines and there is no behaviour to diverge; if it ever
 * grows any, the right answer is a module of its own rather than a borrow from
 * either cycle.
 *
 * The position travels with the inscription so that everything said about one of
 * them to the person is said without the value: a tax inscription is fiscal data of
 * a real company, and a failed assertion is copied straight into the test report.
 */
export interface ExportToSchedule extends ScheduledExportReference {
  /** The inscription, as bare digits, exactly as the form's dropdown carries it. */
  readonly inscription: string;
}

/**
 * Turns the configured inscriptions into the references this cycle works with.
 *
 * Position comes from the order in the list and travels with every inscription, so
 * that nothing said about one of them to the person has to be said with its value.
 * Written here rather than imported for the reason {@link ExportToSchedule} gives.
 */
export function toExportTargets(inscriptions: readonly string[]): readonly ExportToSchedule[] {
  return inscriptions.map((inscription, index) => ({
    position: String(index + 1),
    inscription,
  }));
}

/**
 * Chooses the issuer role and confirms the form asks for nothing unauthorised.
 *
 * The role is what makes an export form for this branch exist at all, and the screen
 * arrives with it already marked (measured in spike 08) — so the marking states the
 * choice rather than discovering it. Which notes the file brings is a fiscal
 * parameter instead, and it is stated per item, once the inscription is selected —
 * see {@link scheduleExport}.
 */
export async function chooseIssuerRole(page: Page): Promise<void> {
  await test.step('Choose the issuer role and open the export form', async () => {
    await siatWebNfceIssuerForm(page).chooseIssuerRole();
  });

  await test.step('Confirm the form asks for nothing the person has not authorised', async () => {
    await siatWebNfceIssuerForm(page).expectNothingUnauthorisedAsked();
  });
}

/**
 * Writes the emission period again, after the form was served empty under the flow.
 *
 * A step of its own, and named for the cause rather than the symptom, so that the
 * report shows the tolerance was exercised instead of hiding it. Called from inside
 * the step that confirms the period, which is what the flow does with every other
 * composed step in this module.
 */
async function refillEmissionPeriod(page: Page, period: EmissionPeriod): Promise<void> {
  await test.step('Refill the emission period after the form was re-rendered', async () => {
    await siatWebNfceIssuerForm(page).fillEmissionPeriod(period.start, period.end);
  });
}

/**
 * Fills the form for one export and registers the request.
 *
 * The inscription is checked against the options the form actually offers before it
 * is selected, because selecting a value the form does not have leaves the dropdown
 * where it was and the request would then be registered for whichever inscription
 * the screen happened to arrive with.
 *
 * The note choices are stated after that selection, and not before, because the
 * selection is the last thing in the item that re-renders the form (measured:
 * `partial.render` = `consultarNFCeForm`): what is marked afterwards is the version
 * of the form that gets submitted, and what is marked before it is handed back to
 * the screen's own defaults by the re-render.
 */
export async function scheduleExport(
  page: Page,
  target: ExportToSchedule,
  period: EmissionPeriod,
): Promise<void> {
  const form = siatWebNfceIssuerForm(page);

  await test.step(`Check the form offers the inscription at position ${target.position}`, async () => {
    await form.expectInscriptionOffered(target.inscription, target);
  });

  await test.step(`Select the inscription at position ${target.position}`, async () => {
    await form.selectInscription(target.inscription);
    await form.expectInscriptionSelected(target.inscription);
  });

  await test.step('State which notes the exported file must bring', async () => {
    await form.applyAuthorisedNoteChoices();
  });

  await test.step('Fill the emission period and confirm the form kept it', async () => {
    await form.fillEmissionPeriod(period.start, period.end);
    await form.expectEmissionPeriodKept(period.start, period.end, async () => {
      await refillEmissionPeriod(page, period);
    });
  });

  await test.step('Register the export request', async () => {
    await form.scheduleExport(period, target);
  });
}

/**
 * Route of the internal error screen the portal answers with, on the destination
 * system.
 *
 * Measured, and identified by its route rather than by its text: the screen has an
 * address of its own, and a message the portal may reword is not the screen's
 * identity. Each cycle measures the same route and writes it too — no two cycle
 * modules borrow from each other (see the note at the top of this module), so this is
 * a third declaration of one portal fact rather than an oversight, and a change here
 * is a change there.
 */
const PORTAL_ERROR_SCREEN_PATH = '/siatweb/faces/views/comum/erro.xhtml';

/**
 * Fails, by name, when the portal answered with its own internal error screen.
 *
 * Asked once per visit, right after the reload that brings the screen back, because
 * that is where it was measured on the NF-e cycles: the reload came back on the error
 * screen and the flow walked a menu that does not exist there, failing on a control
 * instead of on the portal. One observation and no wait — the reload has already
 * resolved, so the document it loaded is the one on screen.
 *
 * Carries no screen text: the portal's message and its own stack trace are recorded
 * in the spike, and putting a server stack in a test report helps nobody reading
 * which step failed.
 */
function expectPortalIsNotOnItsErrorScreen(page: Page): void {
  const route = page.url();
  if (isOnPath(route, PORTAL_ERROR_SCREEN_PATH)) {
    throw new PortalInternalErrorScreenError(route);
  }
}

/**
 * Returns to the NFC-e export screen for a fresh read of its scheduled exports table.
 *
 * A reload plus the menu walk again, and not a re-read of the current page: the
 * scheduling button answers without refreshing (measured on the NF-e screens), the
 * postback is on the same route so there is no history to go back to, and the form
 * arrives empty on every visit — which is why the table is the only thing to be
 * believed here.
 */
export async function revisitExportScreen(page: Page): Promise<void> {
  await test.step('Reload the export screen', async () => {
    await page.reload();
    expectPortalIsNotOnItsErrorScreen(page);
  });

  await test.step('Dismiss the notice the reload brought the screen back with', async () => {
    // The screen serves the notice on **every** visit, the reload one included, and
    // while it is up the menu behind it cannot be used — the walk below does not get
    // past the first group with it open. Before the walk, therefore, and not only
    // after it. Idempotent, so the same call is harmless on the first item, where the
    // traversal left the menu on top and there is no notice to dismiss.
    await siatWebNfceIssuerForm(page).dismissNotice();
  });

  await siatWebSystem(page).openNfceExportScreen(NF_EXPORT_SCREEN_TIMEOUT_MS);
  await chooseIssuerRole(page);
}

/**
 * How many rows of the NFC-e scheduled exports table already carry the inscription.
 *
 * Read before the request, so that a row left by an earlier run cannot be mistaken
 * for this run's proof. A count and not the list: the rows carry fiscal data of real
 * companies, and a count is all that is compared.
 *
 * Read through this cycle's own page object and this cycle's own table: the NF-e
 * cycles read `lista-agendamentos`, this one reads `lista-agendamentos-nfce`, and
 * neither table has a column saying which cycle scheduled a row.
 */
export async function countScheduledRowsFor(page: Page, target: ExportToSchedule): Promise<number> {
  return await siatWebNfceIssuerForm(page).countScheduledRowsFor(target.inscription);
}

/**
 * Waits until the table carries more rows for the inscription than it did, and
 * returns how many it carries.
 *
 * The wait is paced by the row count itself, never by elapsed time, and the
 * threshold is what turns "a row exists" into "this run added one": an earlier run
 * of the same inscription leaves a row behind, and a test that only looked for
 * presence would pass on that row with the request never having worked.
 *
 * **The limitation of this proof is written rather than worked around:** the table
 * carries no cycle column, so a row is not attributable to this cycle — a schedule
 * made outside the automation between the two readings would satisfy it. Nothing is
 * read to get around that, because nothing on the screen can say it. The one thing
 * this proof does buy over the NF-e cycles is the table itself: this row is a row of
 * the NFC-e screen, so it is at least attributable to the NFC-e branch.
 *
 * @param requiredRowCount the count the table had to exceed, read before the click.
 */
export async function waitForScheduledRow(
  page: Page,
  target: ExportToSchedule,
  requiredRowCount: number,
): Promise<number> {
  const form = siatWebNfceIssuerForm(page);

  try {
    await expect
      .poll(async () => await form.countScheduledRowsFor(target.inscription), {
        timeout: SCHEDULED_ROW_TIMEOUT_MS,
        message:
          'The NFC-e scheduled exports table did not gain a row for the inscription ' +
          'scheduled in this run. The request was not registered, or the rows do ' +
          'not carry that inscription.',
      })
      .toBeGreaterThan(requiredRowCount);
  } catch (cause) {
    throw new MissingScheduledExportError(
      target,
      requiredRowCount + 1,
      await form.countScheduledRowsFor(target.inscription),
      cause,
    );
  }

  return await form.countScheduledRowsFor(target.inscription);
}

/**
 * Schedules the export of every configured inscription as the issuer on the NFC-e
 * screen, in the configured order.
 *
 * One session, one crossing of the screen per inscription, and one closing visit:
 * the screen is opened again before each item — the previous item consumed the one
 * that was open, and the form arrives empty on every visit anyway — and opened once
 * more at the end, because the table only lists a new row on the next load and the
 * same closing visit reads the proof of every item.
 *
 * A failure does not interrupt the list. Each item's error is kept, the next one is
 * attempted, and the first error is raised again at the end rather than being
 * reported as a failure of the whole cycle: the person reads the report to learn what
 * was already scheduled in production, and every item's steps are in it either way.
 * An item whose scheduling already failed is not waited for afterwards, because there
 * is no row coming for a request that was never registered.
 *
 * @returns how many items the cycle completed, so the caller can say so without
 * reading the steps.
 */
export async function scheduleEveryConfiguredExport(
  page: Page,
  targets: readonly ExportToSchedule[],
  period: EmissionPeriod,
): Promise<number> {
  const failures: unknown[] = [];
  /** Only the items whose request went through, so only they have a row coming. */
  const scheduled: { target: ExportToSchedule; rowsBefore: number }[] = [];

  for (const target of targets) {
    await test.step(`Schedule the export of the inscription at position ${target.position} of ${String(targets.length)}`, async () => {
      try {
        // The revisit also opens the form, by choosing the role the screen needs before
        // the flow asks it anything. Every item starts this way, the first one included:
        // the arrival at the destination system leaves the menu, not this screen.
        await revisitExportScreen(page);

        // Counted before the request, so that a row left by an earlier cycle cannot
        // stand in for this cycle's proof. A count only, never the row contents.
        const rowsBefore = await countScheduledRowsFor(page, target);

        await scheduleExport(page, target, period);
        scheduled.push({ target, rowsBefore });
      } catch (failure) {
        failures.push(failure);
      }
    });
  }

  await test.step('Confirm a new row for every scheduled inscription', async () => {
    // One visit for the whole cycle, so that the table is read once, as the portal
    // serves it.
    await revisitExportScreen(page);

    for (const { target, rowsBefore } of scheduled) {
      try {
        const rowsAfter = await waitForScheduledRow(page, target, rowsBefore);
        // Proof, item by item: this cycle added a row for this inscription. The pair of
        // counts is what the report carries, and a count is not fiscal data.
        expect(rowsAfter, `rows for position ${target.position}`).toBeGreaterThan(rowsBefore);
      } catch (failure) {
        failures.push(failure);
      }
    }
  });

  const [firstFailure] = failures;
  if (firstFailure instanceof Error) {
    // Raised as it was raised: it is a typed error carrying the phase that failed, and
    // wrapping it would replace that with a summary the report cannot act on.
    throw firstFailure;
  }
  if (firstFailure !== undefined) {
    // Every step in this module fails with an error. A bare value reaching here would
    // lose its message if rethrown, and stringifying an object would report
    // "[object Object]" instead of anything true.
    throw new Error('The scheduling cycle met a failure that was not an error.', {
      cause: firstFailure,
    });
  }

  return scheduled.length;
}
