import { expect, test, type Page } from '@playwright/test';
import { siatWebNfceIssuerForm, siatWebSystem } from '../pages/factories';
import { type EmissionPeriod } from './environment';
import { NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS } from './nfce-export-issuer-all-status-note-choices';
import {
  MissingScheduledExportError,
  PortalInternalErrorScreenError,
  type ScheduledExportReference,
} from './nfe-export-error';
import { isOnPath } from './route';
import {
  NF_EXPORT_SCREEN_TIMEOUT_MS,
  SCHEDULED_CLOSING_WAIT_CHAIN_MS,
  SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS,
  SCHEDULED_ROW_TIMEOUT_MS,
  TEST_DEADLINE_SLACK_MS,
  TRAVERSAL_WAIT_CHAIN_MS,
} from './timeouts';

/*
 * The scheduling cycle of the **NFC-e, every status** flow: the same screen the
 * `Canceladas` cycle works, the same list, the same period, and a different set of
 * notes authorised over it — `Tipo de nota` = Saída, `Status da NFC-e` = Todas.
 *
 * A fourth module rather than a flag on the third, and that is the recorded design
 * (ADR 0012, extending ADR 0010 and ADR 0011). What each cycle says about the portal
 * and about its own screen is stated in its own module, so a change on one side
 * cannot quietly become a change on another: no two cycle modules import each other's
 * code in any place, and a few lines of duplicated shape are the price of that
 * guarantee. The work item (`ExportToSchedule`), the portal's internal error screen
 * (`PORTAL_ERROR_SCREEN_PATH`) and the revisit are declared here again for exactly
 * that reason, each with its reasoning where it is declared.
 *
 * What this cycle does **differently** from the third, and both differences are the
 * point of it:
 *
 * - **The choices are its own.** Every step that states or checks them goes through
 *   the page object's parameterised methods, handed
 *   `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS` — one page object, one screen, two tables.
 * - **The proof of each item is paid by that item**, not by a visit at the end: see
 *   {@link scheduleEveryConfiguredExport}. The closing visit of the other three
 *   cycles does not exist here, and the deadline derives from that shape
 *   ({@link allStatusSchedulingTestDeadlineMs}) instead of from theirs.
 *
 * What it shares with the other three is infrastructure only, imported read-only:
 * the factories, the traversal, `route`, `timeouts`, the environment readers and the
 * typed errors of `nfe-export-error` — which answer for this flow's failures the same
 * way they answer for the others', with no class of its own.
 *
 * The privacy rule of the whole suite holds here unchanged: a failure is named by the
 * item's **position** in `E2E_NFE_EXPORT_INSCRIPTIONS` and never by its value,
 * because the value is fiscal data of a real company and a Playwright report copies
 * whatever a failed assertion carries.
 */

/**
 * One export to schedule, as this cycle works with it.
 *
 * Declared a fourth time, and this is the one place where the cycles name the same
 * thing more than once. It is *not* screen knowledge — it is the configured list,
 * turned into a value and a position — so the tempting move was to read it from
 * another cycle. That was refused for the reason this whole design rests on: it would
 * make one cycle's module depend on another's, and nothing else in the flows does.
 * The shape is four lines and there is no behaviour to diverge; if it ever grows any,
 * the right answer is a module of its own rather than a borrow from either cycle.
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
 * How much time this cycle's shape can legitimately sit inside, for a list of the
 * given size.
 *
 * The same derivation the other cycles' deadline follows — traversal once, per-item
 * term per item, one-off term once, headroom once — with one change that is not a
 * preference but the shape of this cycle: **the closing visit is paid once per item
 * instead of once for the list.** Each item schedules and then proves itself, and its
 * proof needs its own fresh visit, because the table only lists a new row on a new
 * load (measured in spike 06 and repeated in spike 08 — see the note in
 * {@link scheduleEveryConfiguredExport}). Folding that visit into the per-item term
 * and leaving the one-off closing term out is what keeps the figure checkable against
 * the waits this cycle actually makes; a figure describing a shorter run than the one
 * that runs was already wrong once in this suite.
 *
 * The bounds are not re-declared here: every chain it sums is `timeouts.ts`'s, read
 * the same way every other module reads them.
 *
 * @param inscriptionCount how many inscriptions the configured list carries.
 * @throws when the count is not a positive number: a cycle with nothing to schedule
 * would otherwise be granted just enough time to authenticate, and would then fail on
 * a screen it was never going to reach a verdict about.
 */
export function allStatusSchedulingTestDeadlineMs(inscriptionCount: number): number {
  if (!Number.isInteger(inscriptionCount) || inscriptionCount < 1) {
    throw new RangeError(
      `The all-status scheduling cycle deadline needs a positive number of ` +
        `inscriptions, and ${String(inscriptionCount)} is not one. The list of ` +
        `inscriptions in E2E_NFE_EXPORT_INSCRIPTIONS arrived with a size the cycle ` +
        `cannot schedule.`,
    );
  }

  const traversalChainMs = TRAVERSAL_WAIT_CHAIN_MS.reduce((total, bound) => total + bound, 0);

  return (
    traversalChainMs +
    inscriptionCount * SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS +
    inscriptionCount * SCHEDULED_CLOSING_WAIT_CHAIN_MS +
    TEST_DEADLINE_SLACK_MS
  );
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
 *
 * The table handed to the two choice steps is **this flow's own** — `Saída` and
 * `Todas` — and never the `Canceladas` flow's: the two flows share the screen and the
 * page object, and differ precisely in what those two steps state and what the
 * registration step compares the request against.
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
    await form.applyNoteChoices(NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS);
  });

  await test.step('Fill the emission period and confirm the form kept it', async () => {
    await form.fillEmissionPeriod(period.start, period.end);
    await form.expectEmissionPeriodKept(period.start, period.end, async () => {
      await refillEmissionPeriod(page, period);
    });
  });

  await test.step('Register the export request', async () => {
    await form.scheduleExportValidated(period, target, NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS);
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
 * a fourth declaration of one portal fact rather than an oversight, and a change here
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
 * scheduling button answers without refreshing (measured), the postback is on the
 * same route so there is no history to go back to, and the form arrives empty on
 * every visit — which is why the table is the only thing to be believed here.
 *
 * This cycle calls it **twice per item**: before the item fills the screen, as the
 * other cycles do, and again after the item's click, because the row that proves the
 * request only enters the listing on a new load (measured — see
 * {@link scheduleEveryConfiguredExport}). The second call is that item's own proof
 * visit; it is not a closing visit, because nothing after it reads another item's
 * rows.
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
 * This flow and the `Canceladas` flow read the **same** table — `lista-agendamentos-nfce`
 * — which is a difference from every pair of cycles before this one: the NF-e cycles
 * and the NFC-e one never read the same table, and these two do. Neither table has a
 * column saying which flow scheduled a row, so the count proves that *a* row was
 * added for the inscription and not that this flow added it; the limitation is
 * written where the proof is made and in ADR 0012, not worked around here.
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
 * carries no flow column, so a row is not attributable to this cycle — a schedule
 * made outside the automation between the two readings would satisfy it. Nothing is
 * read to get around that, because nothing on the screen can say it.
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
 * screen, with every status, in the configured order — and proves each item before
 * the next one starts.
 *
 * One session, and per inscription: a visit that opens the screen, the count read
 * before the click, the fill and the single click, then **the item's own proof
 * visit** and the wait for its row. The closing visit the other three cycles pay once
 * at the end does not exist here, and the reason is a measurement rather than a
 * preference: `Agendar exportação` answers without refreshing and **the table only
 * lists a new row on the next load of the screen** (measured in spike 06 on the NF-e
 * screen, in the section "A tabela só lista depois de uma nova visita", and the NFC-e
 * cycle reads its table the same way). A poll pointed at the page that just clicked
 * would therefore wait out its whole bound and report, with correctness, that nothing
 * was scheduled. So the visit that reads each item's proof is paid by that item,
 * immediately after its own click — which is also what keeps the proof *per item*
 * instead of a batch at the end: every inscription is proved by a visit made for it,
 * and a failure between items is named where it happened.
 *
 * A failure does not interrupt the list. Each item's error is kept, the next one is
 * attempted, and the first error is raised again at the end rather than being
 * reported as a failure of the whole cycle: the person reads the report to learn what
 * was already scheduled in production, and every item's steps are in it either way.
 * An item whose scheduling already failed still gets no proof visit wasted on it —
 * the failure short-circuits to the next item — because there is no row coming for a
 * request that was never registered.
 *
 * @returns how many items the cycle scheduled **and proved**, so the caller can say
 * so without reading the steps.
 */
export async function scheduleEveryConfiguredExport(
  page: Page,
  targets: readonly ExportToSchedule[],
  period: EmissionPeriod,
): Promise<number> {
  const failures: unknown[] = [];
  /** Items that were scheduled **and** proved, so the return value means both. */
  let provedCount = 0;

  for (const target of targets) {
    await test.step(`Schedule the export of the inscription at position ${target.position} of ${String(targets.length)}`, async () => {
      try {
        // This item's visit onto the screen. Every item starts this way, the first
        // one included: the arrival at the destination system leaves the menu, not
        // this screen, and a later item must not inherit the state a failed previous
        // one was left in.
        await revisitExportScreen(page);

        // Counted before the request, so that a row left by an earlier cycle cannot
        // stand in for this cycle's proof. A count only, never the row contents.
        const rowsBefore = await countScheduledRowsFor(page, target);

        await scheduleExport(page, target, period);

        // This item's proof, paid by this item: a fresh visit, because the row only
        // enters the listing on a new load, and then the count paced by the count
        // itself. The pair of counts is what the report carries, and a count is not
        // fiscal data.
        await revisitExportScreen(page);
        const rowsAfter = await waitForScheduledRow(page, target, rowsBefore);
        expect(rowsAfter, `rows for position ${target.position}`).toBeGreaterThan(rowsBefore);
        provedCount += 1;
      } catch (failure) {
        failures.push(failure);
      }
    });
  }

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

  return provedCount;
}
