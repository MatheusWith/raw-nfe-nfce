import type { Locator, Page, Request, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  ExportRequestWithoutPeriodError,
  ExportRequestWithUnauthorisedNoteChoiceError,
  InscriptionNotOfferedError,
  RejectedFieldValueError,
  UnknownFormChoiceError,
  UnknownRequiredFieldError,
  UnexpectedFormChoiceError,
  type ScheduledExportReference,
} from '../support/nfe-export-error';
import {
  EXPORT_NOTE_CHOICE_GROUPS,
  findDivergedNoteChoiceGroup,
  findUnknownChoiceNames,
  NOTE_CHOICE_FAILURE,
  offersAuthorisedChoice,
  type ExportNoteChoiceGroup,
} from '../support/nfe-export-note-choices';
import type { EmissionPeriod } from '../support/environment';
import { expectScreenReady, type RequiredScreenControl } from '../support/screen-readiness';
import {
  EMISSION_PERIOD_TIMEOUT_MS,
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  INSCRIPTION_RERENDER_TIMEOUT_MS,
} from '../support/timeouts';

/**
 * Accessible name of the radio that turns the screen into the export form.
 *
 * Measured as the only radio with that name. It is a `<label for>`, so both
 * `getByRole` and `getByLabel` resolve it; the role is used because it also
 * proves the control is a radio, which is what has to be marked.
 */
const DESTINATION_RECIPIENT_ROLE_NAME = 'Contribuinte como Destinatário';

/**
 * Button that registers the export request.
 *
 * Measured as `Agendar exportação`, with the lowercase "e" — not the
 * "Agendar Exportação" the original spec named, and not the arrival state's
 * `Exportar` button, which belongs to the single-note form and is never actuated.
 */
const SCHEDULE_EXPORT_BUTTON_NAME = 'Agendar exportação';

/**
 * Server id of the datatable that lists the scheduled exports.
 *
 * Markup addressing, and the reason is measured. The table element itself carries
 * neither id nor class, and its header cells concatenate the column filter the
 * table has — only `Situação`, `ID`, `Data de criação` and `Ações` come out clean.
 * This id is written by hand (the row buttons are `lista-agendamentos:<row>:…`),
 * unlike the `j_idt…` counters, and an id is unique, so it names exactly one table.
 *
 * Scoping matters rather than being tidiness: the table is paginated and the page
 * carries other tables, so a row count taken over the page reports the header bar
 * and the pagination as exports and misreports whether anything was added. Read by
 * the selectors below, so the id is written once.
 */
const SCHEDULED_EXPORTS_TABLE_ID = 'lista-agendamentos';

/**
 * Server id of the first emission date field.
 *
 * Markup addressing, under the same measurement: the field carries a visible label
 * but no `label[for]`, no `aria-label` and no `placeholder`, so no semantic locator
 * can name it. This id is written by hand, unlike the inscription's `j_idt39`,
 * which is a generated counter and shifts between loads.
 */
const EMISSION_START_FIELD_ID = 'dataInicial_input';

/** Server id of the last emission date field, under the same measurement. */
const EMISSION_END_FIELD_ID = 'dataFinal_input';

/**
 * What both emission fields read when the form has just been served again.
 *
 * The two readings are joined so that one comparison decides whether the fields hold
 * the wanted period, hold nothing at all, or hold something else — which is the third
 * case that must not be waited out.
 */
const EMPTY_PERIOD_READING = '|';

/**
 * The two JSF request fields the flow tells one request from another by.
 *
 * Measured on the two requests this screen makes out of the flow: choosing the
 * inscription posts `javax.faces.behavior.event=valueChange` and re-renders the whole
 * form, while the scheduling button — a command, not a value change — carries no
 * `behavior.event` at all; the registration is told from the others by the table it
 * re-renders. Read as the server reads them, through {@link postedFields}, so the reading
 * cannot drift from the body the portal sends, and without naming a generated id that
 * shifts between loads.
 */
const JSF_BEHAVIOUR_EVENT_FIELD = 'javax.faces.behavior.event';
const JSF_PARTIAL_RENDER_FIELD = 'javax.faces.partial.render';

/** Value the behaviour event field carries on a value change (measured). */
const VALUE_CHANGE_EVENT = 'valueChange';

/**
 * Punctuation the portal writes inside a number it lists, and the only thing removed
 * before the digits are read. Measured on the table of a real cycle: the cell separates
 * the check digit from the rest of the inscription with a hyphen, so reading the digits
 * as they are written would not find the row that *is* the export the run made — and the
 * proof would report a registered export as missing.
 */
const PUNCTUATION_INSIDE_NUMBER = '-';

/** Label of the row whose cell holds the inscription control, with its colon. */
const INSCRIPTION_ROW_LABEL = 'Inscrição:';

/**
 * Every radio the screen carries once a contributor role is chosen.
 *
 * A multiset rather than a set, because `Todas` is an option of both choice groups —
 * the groups are named in {@link EXPORT_NOTE_CHOICE_GROUPS} and their options are read
 * from there, so the list of what a group offers is written once. It is what lets the
 * flow notice a choice it does not know: a new group or a new option would be a new
 * fiscal parameter, and leaving it at whatever the screen happens to mark would
 * schedule an export nobody authorised.
 */
const MEASURED_CHOICE_NAMES = [
  'Pesquisar SOMENTE pela Chave da NFE',
  'Contribuinte como Emitente',
  DESTINATION_RECIPIENT_ROLE_NAME,
  ...EXPORT_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
] as const;

/**
 * The controls the form has to carry before anything is filled in.
 *
 * The screen does not serve the form until the role is chosen, and it is served by
 * a postback on the same route, so the controls turn up a moment after the radio
 * is marked. Presence is polled rather than counted once, for the reason measured
 * on arrival: a single reading taken at the postback moment reports a screen that
 * never rendered the controls, which is a different and wrong failure.
 */
const FORM_CONTROLS = [
  {
    name: 'the inscription control',
    locator: (page: Page): Locator => inscriptionControl(page),
  },
  {
    name: 'the first emission date field',
    locator: (page: Page): Locator => page.locator(CONTRIBUTOR_FORM_SELECTORS.emissionStartField),
  },
  {
    name: 'the last emission date field',
    locator: (page: Page): Locator => page.locator(CONTRIBUTOR_FORM_SELECTORS.emissionEndField),
  },
  {
    name: 'the schedule export button',
    locator: (page: Page): Locator =>
      page.getByRole('button', { name: SCHEDULE_EXPORT_BUTTON_NAME, exact: true }),
  },
] as const satisfies readonly RequiredScreenControl[];

/** What the wait for the form controls says, in the words of this screen. */
const FORM_CONTROLS_POLL_MESSAGE =
  'The NF-e export form was not served after the contributor role was ' +
  'marked. Nothing was filled in and nothing was scheduled.';

/**
 * Markup the contributor form is addressed by, as measured in spike 06.
 *
 * Grouped here so the raw markup of the screen has a single source of truth, the way
 * the other screens carrying measured markup already keep theirs.
 *
 * Each entry states the measurement that stands in for a semantic locator, because
 * the rule is not "prefer semantic locators" but "when you cannot, say what you
 * measured". Two entries have no measurement to state and say so in place rather than
 * guessing: the spelling a required marker would arrive in, and the element a table
 * cell is. Both are questions for the person rather than defects the flow can hit
 * today — the measured form carries no required marker at all — and an absent
 * reason invites the question, where an invented one looks like an answer.
 */
const CONTRIBUTOR_FORM_SELECTORS = {
  /**
   * A row of the form, carrying the label the person reads in one cell and the
   * control in the next.
   *
   * Measured: the form is built as rows, and a `tr` narrowed by the exact visible
   * label is the one relation common to both containers the fields are split across
   * (spike 06, "O formulário de destinatário"). No semantic locator replaces it — the
   * form exposes no group, no landmark and no list to be the container. The label is
   * checked for uniqueness where it is used, so a portal that adds a second row with
   * the same label fails instead of quietly matching two.
   */
  row: 'tr',

  /**
   * The inscription control, inside the row its own label identifies.
   *
   * Measured: the inscription carries no `label[for]`, no `aria-label` and no
   * `placeholder` (spike 06), so neither `getByLabel` nor `getByRole` can name it,
   * and its server id `j_idt39` is a generated counter that shifts between loads
   * (spike 06). The row is the only stable relation left, and this is the only
   * `select` in it.
   */
  inscriptionSelect: 'select',

  /**
   * How a field would mark itself required.
   *
   * **Justification pending.** The measured form carries no required marker anywhere
   * (spike 06), so which spelling the portal would use if it added one was never
   * observed. Both attribute forms are written here on the strength of HTML rather
   * than of a measurement — the outcome is safe either way, but the shape is an
   * assumption and is labelled as one.
   */
  requiredField: '[required], [aria-required="true"]',

  /**
   * Wrapper the scheduled exports table is rendered in, by its server id.
   *
   * Measured: the table element itself carries neither id nor class, and its header
   * cells concatenate the column filter the table has, so only `Situação`, `ID`,
   * `Data de criação` and `Ações` come out clean (spike 06). This id is written by
   * hand, unlike the `j_idt…` counters the portal generates, so it does not shift.
   *
   * Scoping is not tidiness: the table is paginated and the page carries others, so a
   * count taken over the page reports the header bar and the pagination as exports
   * and misreports whether anything was added (measured — counting whole-page
   * `table tbody tr` returned the form's own row and reported a false success).
   */
  scheduledExportsWrapper: `#${SCHEDULED_EXPORTS_TABLE_ID}`,

  /**
   * A data row of that table.
   *
   * Measured for the reason given above: the count has to exclude the header bar and
   * the pagination, which only a row scoped inside the wrapper does.
   */
  scheduledExportsRow: 'table tbody tr',

  /**
   * The element carrying one column's value inside a row.
   *
   * **Justification pending.** Spike 06 records which columns the table carries, not
   * which element holds a column's value. `td` is written here on the strength of
   * what a table is rather than of a measurement — ask before trusting the shape.
   */
  scheduledExportsCell: 'td',

  /**
   * Containers the form's own fields live in.
   *
   * Measured, and the reason is measured too: the fields are **not** under one
   * parent. The inscription sits in a table with no id inside `span#altExterno`,
   * while the company name, the note number and the two dates sit in
   * `table#formularioPanel` inside `span#panel-dados`, and the common ancestor is a
   * `div` with no id at all (spike 06). A check scoped to one of them would cover
   * half the form and pass while missing the other half — which is exactly the defect
   * the first attempt at this flow had, where it skipped the inscription in silence.
   * No semantic locator replaces it: a span with no role is not one.
   */
  formFieldContainers: ['#altExterno', '#panel-dados'],

  /**
   * Server id of the first emission date field.
   *
   * Markup addressing, under the same measurement: the field carries a visible label
   * but no `label[for]`, no `aria-label` and no `placeholder`, so no semantic locator
   * can name it. This id is written by hand, unlike the inscription's `j_idt39`,
   * which is a generated counter and shifts between loads.
   */
  emissionStartField: `#${EMISSION_START_FIELD_ID}`,

  /** Server id of the last emission date field, under the same measurement. */
  emissionEndField: `#${EMISSION_END_FIELD_ID}`,
} as const;

/**
 * The row carrying a given visible label, inside the form's own containers.
 *
 * Scoped to the containers the fields live in, and not to the page, because of a
 * measured collision: the Info dialog stays in the DOM hidden and writes the same
 * labels with the same colons, so a page-wide lookup matched each labelled row twice
 * — the form's row and the dialog's. The uniqueness check at the call site then
 * failed, which is the right failure but the wrong reason: the two rows are
 * different things, not the same label twice.
 *
 * Both containers are named in {@link CONTRIBUTOR_FORM_SELECTORS.formFieldContainers}
 * under the same measurement, and a row under either one is a row of this form, so
 * scoping costs no coverage. The label keeps its colons for the reason spike 06 gave:
 * they are what stops "Data de Emissão Inicial" from also matching the dialog's
 * homonymous field.
 */
function labelledRow(page: Page, label: string): Locator {
  return page
    .locator(CONTRIBUTOR_FORM_SELECTORS.formFieldContainers.join(', '))
    .locator(CONTRIBUTOR_FORM_SELECTORS.row)
    .filter({ has: page.getByText(label, { exact: true }) });
}

/** The row of the inscription control. */
function inscriptionRow(page: Page): Locator {
  return labelledRow(page, INSCRIPTION_ROW_LABEL);
}

/** The inscription control of the form, which the flow reads, selects and checks. */
function inscriptionControl(page: Page): Locator {
  return inscriptionRow(page).locator(CONTRIBUTOR_FORM_SELECTORS.inscriptionSelect);
}

/** The data rows of the scheduled exports table, and only of that one. */
function scheduledExportsRows(page: Page): Locator {
  return page
    .locator(CONTRIBUTOR_FORM_SELECTORS.scheduledExportsWrapper)
    .locator(CONTRIBUTOR_FORM_SELECTORS.scheduledExportsRow);
}

/**
 * Fields of a form-encoded request, read as the server reads them.
 *
 * The screen's requests are form-encoded and the emission fields are named by the ids
 * this page object already addresses them by, so reading a request needs no markup of
 * its own and cannot drift from the fields it checks.
 */
function postedFields(request: Request): URLSearchParams {
  return new URLSearchParams(request.postData() ?? '');
}

/** Tells the postback a value change fires from the request the button makes. */
function isValueChangePostback(response: Response): boolean {
  return (
    response.request().method() === 'POST' &&
    postedFields(response.request()).get(JSF_BEHAVIOUR_EVENT_FIELD) === VALUE_CHANGE_EVENT
  );
}

/**
 * Tells the request that registers the export from the screen's other requests.
 *
 * Measured: the button's request re-renders the scheduled exports table, and no other
 * request on the screen does — the value change that chooses the inscription re-renders
 * the form and carries the table only as a filter parameter, which is why the marker is
 * read from {@link JSF_PARTIAL_RENDER_FIELD} and not from the body as a whole.
 */
function isExportRegistrationRequest(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    (postedFields(request).get(JSF_PARTIAL_RENDER_FIELD) ?? '').includes(SCHEDULED_EXPORTS_TABLE_ID)
  );
}

/**
 * Public contract of the contributor form of the NF-e export screen.
 *
 * Consumers depend on this contract rather than on the page object implementation,
 * so the object can be swapped without touching them.
 *
 * The reads that decide something come as `expect…` methods that raise the typed
 * failure, and not as bare booleans the caller has to test: a step that branches on
 * a reading is a step whose failure is an anonymous `Error`, and the phase a red
 * test failed in is exactly what has to be legible in the report.
 */
export interface SiatWebNfeContributorFormPageContract {
  /**
   * Marks the destination-recipient role and confirms the form it opens.
   *
   * The role is what makes the export form exist at all; which notes the file brings is
   * a fiscal parameter, and that is
   * {@link SiatWebNfeContributorFormPageContract.applyAuthorisedNoteChoices}.
   */
  chooseDestinationRecipientRole(): Promise<void>;

  /**
   * Confirms the form is open and usable, before anything is filled in.
   *
   * @param timeoutMs bound on the form being served after the role is marked.
   */
  expectUsable(timeoutMs?: number): Promise<void>;

  /**
   * Fails, before any export is scheduled, when the form carries a choice the flow
   * does not know or asks for a field it was not authorised to fill.
   *
   * Says nothing about how a known choice is marked: the flow states that itself, per
   * group, once it has selected the inscription — see
   * {@link SiatWebNfeContributorFormPageContract.applyAuthorisedNoteChoices}.
   */
  expectNothingUnauthorisedAsked(): Promise<void>;

  /**
   * Marks, in each note choice group, the choice the person authorised, and confirms
   * each group kept it.
   *
   * Stated rather than inherited, which is the whole point: the screen arrives with
   * its own defaults (`Tipo de nota` = Todas, `Status da Nota` = Ativas), and an
   * export of a different set of notes is not the export that was authorised. The
   * person authorised `Todas` in both groups, so the exported file brings the active,
   * cancelled, unused and denied notes of the period rather than the active ones only.
   *
   * Called **after** the inscription is selected, because that selection is the last
   * thing in the item that re-renders the form (measured): marking after it puts the
   * choices on the version of the form that will be submitted. Marking fires no
   * postback of its own — neither group carries an `onchange`, an AJAX behaviour or a
   * value-change marker (measured) — so there is nothing to wait for, and
   * {@link SiatWebNfeContributorFormPageContract.scheduleExport} checks the values on
   * the request that goes out.
   */
  applyAuthorisedNoteChoices(): Promise<void>;

  /**
   * Fails when the form does not offer the inscription.
   *
   * Checked before the selection, because selecting a value the form does not have
   * leaves the dropdown where it was and the request would then be registered for
   * whichever inscription the screen happened to arrive with — a real export for
   * the wrong company.
   */
  expectInscriptionOffered(inscription: string, reference: ScheduledExportReference): Promise<void>;

  /**
   * How many inscriptions the form offers.
   *
   * A count and not the list: the options are fiscal data of real companies, and
   * the count is all a refusal message needs to say.
   */
  countOfferedInscriptions(): Promise<number>;

  /**
   * Selects the inscription by its number, never by its position in the list, and
   * returns when the form that selection re-renders is in place.
   *
   * The wait belongs to the selection and not to the caller because the period is
   * written into the form this postback leaves behind: returning earlier writes into a
   * form that is about to be replaced, and the request then goes out with no period.
   */
  selectInscription(inscription: string): Promise<void>;

  /**
   * Fails when the form did not take the inscription that was selected.
   *
   * Re-read inside the page, because the "Razão Social" field never fills in
   * (measured): the dropdown's own value is the only evidence that the screen read
   * the selection, and it arrives pre-filled, so nothing about it can be assumed
   * about the choice that was just made.
   */
  expectInscriptionSelected(inscription: string): Promise<void>;

  /** Fills both emission date fields with the configured period. */
  fillEmissionPeriod(start: string, end: string): Promise<void>;

  /**
   * Confirms the form kept the period, and writes it again when the form was served
   * again after it was first written.
   *
   * Two different failures hide behind one wrong reading, and this keeps them apart.
   *
   * The inscription's own change event posts to the same screen it is on and re-renders
   * the whole form panel (measured: the selection posted, the period was written into
   * the panel being replaced, and the response arrived empty). Fields that read **empty**
   * are that re-render, and the period is written again — `onFormRerendered` is invoked
   * so the caller can record it in the report. Fields that read **anything other than
   * the configured period** are a field rewriting its input, which is a defect and
   * fails at once, without a retry: a period other than the configured one is an export
   * nobody authorised.
   *
   * @param onFormRerendered invoked once, when a re-render emptied the period, so that
   * the flow can record the write that follows. It is not called when the form kept
   * what it was given.
   */
  expectEmissionPeriodKept(
    start: string,
    end: string,
    onFormRerendered: () => Promise<void>,
  ): Promise<void>;

  /**
   * Registers the export request, exactly once, and confirms the period left the
   * browser inside it.
   *
   * The period is compared against the request that went out, not against the form:
   * the form can be re-rendered between the check that read it and the click that
   * submits it, and only the request says what the destination system received.
   *
   * @param reference how the export is named in the failure, taken because a request
   * that went out with no period is the one failure here that nothing downstream would
   * notice, and a report that does not say which item it was cannot act on it.
   */
  scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;

  /**
   * How many rows of the scheduled exports table carry the inscription, decided
   * inside the page.
   *
   * A row counts when the inscription appears as a complete run of digits in one
   * of its cells, once the punctuation the portal writes inside the number is
   * removed — it separates the check digit from the rest (measured: the cell reads
   * `NNNNNNNNN-D`, not `NNNNNNNNND`; the digits themselves are fiscal data and are
   * not written here), and reading the digits as they are written counts the export
   * this run made as
   * missing. Everything else the cell carries still does not matter: a cell with
   * more than one number still matches on one of them, and one inscription cannot
   * be mistaken for another that starts with the same digits.
   */
  countScheduledRowsFor(inscription: string): Promise<number>;
}

/**
 * The contributor form of the "Consultar/Exportar NF-e" screen.
 *
 * Separate from the arrival screen on purpose: the arrival models that the screen
 * opened on its search-by-key form, and this one models what that form becomes
 * once a contributor role is chosen. Both address the same page and neither
 * reaches into the other.
 */
export class SiatWebNfeContributorFormPage implements SiatWebNfeContributorFormPageContract {
  constructor(private readonly page: Page) {}

  async chooseDestinationRecipientRole(): Promise<void> {
    const role = this.page.getByRole('radio', {
      name: DESTINATION_RECIPIENT_ROLE_NAME,
      exact: true,
    });
    await expect(role).toBeVisible();
    await role.check();
    // Marking the role is a postback and the form is served by it. Polling the
    // form's own controls is the observable post-condition: there is no instant at
    // which "the role is marked" and "the form is there" may be assumed together.
    await this.expectUsable();
  }

  async expectUsable(timeoutMs?: number): Promise<void> {
    // The arrival proof for this form: marking the role is a postback and the form is
    // served by it, so there is no instant at which "the role is marked" and "the
    // form is there" may be assumed together.
    await expectScreenReady(this.page, FORM_CONTROLS, timeoutMs, FORM_CONTROLS_POLL_MESSAGE);
  }

  async expectNothingUnauthorisedAsked(): Promise<void> {
    const unknownChoices = await this.unknownChoiceNames();
    if (unknownChoices.length > 0) {
      throw new UnknownFormChoiceError(unknownChoices);
    }

    const requiredFields = await this.requiredFieldIds();
    if (requiredFields.length > 0) {
      throw new UnknownRequiredFieldError(requiredFields);
    }
  }

  async applyAuthorisedNoteChoices(): Promise<void> {
    for (const group of EXPORT_NOTE_CHOICE_GROUPS) {
      await this.markChoice(group);
    }
  }

  async expectInscriptionOffered(
    inscription: string,
    reference: ScheduledExportReference,
  ): Promise<void> {
    const offered = await inscriptionControl(this.page).evaluate(
      (element, digits) =>
        Array.from((element as HTMLSelectElement).options).some(
          (option) => option.value === digits,
        ),
      inscription,
    );

    if (!offered) {
      throw new InscriptionNotOfferedError(reference, await this.countOfferedInscriptions());
    }
  }

  async countOfferedInscriptions(): Promise<number> {
    return await inscriptionControl(this.page).evaluate(
      (element) => (element as HTMLSelectElement).options.length,
    );
  }

  async selectInscription(inscription: string): Promise<void> {
    // Armed before the selection, because the postback is what the selection fires and
    // a listener armed after it can miss it. Awaited on the body, not on the headers:
    // the form is replaced by the response being parsed and applied, and the period is
    // written after that. Measured: the re-render landed after the check that read the
    // fields in two of four items, and those requests went out with an empty period.
    const rerenderResponse = this.page.waitForResponse(isValueChangePostback, {
      timeout: INSCRIPTION_RERENDER_TIMEOUT_MS,
    });
    await inscriptionControl(this.page).selectOption({ value: inscription });
    const response = await rerenderResponse;
    await response.finished();
  }

  async expectInscriptionSelected(inscription: string): Promise<void> {
    const selected = await inscriptionControl(this.page).evaluate(
      (element, digits) => (element as HTMLSelectElement).value === digits,
      inscription,
    );

    if (!selected) {
      throw new RejectedFieldValueError('Inscrição:');
    }

    // This says one thing only: the dropdown took the inscription. It deliberately
    // says nothing about the form having settled — selecting the inscription fires a
    // postback that re-renders the whole panel, and the period is written afterwards,
    // into the form that postback leaves behind. See
    // {@link SiatWebNfeContributorFormPageContract.expectEmissionPeriodKept}.
  }

  async fillEmissionPeriod(start: string, end: string): Promise<void> {
    // Filled rather than typed: the fields carry a datepicker, and typing would let
    // a mask interpret the value one keystroke at a time. The values are the ones
    // the screen shows, so there is nothing for a mask to rewrite.
    await this.page.locator(CONTRIBUTOR_FORM_SELECTORS.emissionStartField).fill(start);
    await this.page.locator(CONTRIBUTOR_FORM_SELECTORS.emissionEndField).fill(end);
  }

  /**
   * Confirms the form kept the period, writing it again after a re-render.
   *
   * Web-first, and this is the point of the assertion rather than a detail of it: the
   * fields carry a datepicker, and the datepicker rewrites what was typed into them
   * from its own parser once it has settled. Read straight after `fill`, the check
   * raced that rewrite and reported a form that had kept the value perfectly well as
   * one that had mangled it — and a field that really does rewrite its input schedules
   * a period other than the configured one, so the assertion has to wait for the
   * rewrite to finish before it can tell the two cases apart.
   *
   * The re-render the inscription's own change event fires is told apart from that, by
   * what it leaves behind: an emptied form. The callback runs once, and only then — a
   * form that keeps emptying is not re-written again inside the same bound, because
   * that is no longer a race to wait out but a screen behaving in a way the flow does
   * not know.
   *
   * The values compared are the ones the screen shows, punctuation included, which is
   * what the rewrite produces and what {@link fillEmissionPeriod} writes.
   */
  async expectEmissionPeriodKept(
    start: string,
    end: string,
    onFormRerendered: () => Promise<void>,
  ): Promise<void> {
    const readPeriod = async (): Promise<string | null> =>
      this.page.evaluate(
        ([startId, endId]) => {
          const startField = document.getElementById(startId) as HTMLInputElement | null;
          const endField = document.getElementById(endId) as HTMLInputElement | null;
          if (startField === null || endField === null) {
            return null;
          }
          return `${startField.value}|${endField.value}`;
        },
        [EMISSION_START_FIELD_ID, EMISSION_END_FIELD_ID] as const,
      );

    const wanted = `${start}|${end}`;
    let wroteAgainAfterRerender = false;

    try {
      await expect
        .poll(
          async (): Promise<string | null> => {
            const reading = await readPeriod();

            // A field holding something other than the period is rewriting what was
            // written into it. That is a defect, not a race, and it fails here instead
            // of being waited out. `null` — fields the form does not carry at all — is
            // not that case and is left to the bound, because the write that follows
            // needs the fields to exist and would fail on them.
            if (reading !== null && reading !== wanted && reading !== EMPTY_PERIOD_READING) {
              throw new RejectedFieldValueError(
                'Data de Emissão Inicial and Data de Emissão Final',
              );
            }

            if (reading === EMPTY_PERIOD_READING && !wroteAgainAfterRerender) {
              wroteAgainAfterRerender = true;
              await onFormRerendered();
            }

            return reading;
          },
          {
            timeout: EMISSION_PERIOD_TIMEOUT_MS,
            // The configured period is left out of this on purpose: a poll that fails is
            // copied into the report verbatim, and the emission period of a real company
            // is fiscal data. The two field names below already say which screen and
            // which fields to open, and the values are in the environment file of the
            // person reading the report.
            message: 'The NF-e export form did not settle on the configured emission period',
          },
        )
        .toBe(wanted);
    } catch (cause) {
      // A field that rewrote the period surfaces as its own error and passes through
      // untouched, so the report says which failure happened instead of naming the
      // wrong one.
      if (cause instanceof RejectedFieldValueError) {
        throw cause;
      }
      throw new RejectedFieldValueError('Data de Emissão Inicial and Data de Emissão Final', cause);
    }
  }

  async scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void> {
    // Once, and only once: every click on this button is a real request in the
    // destination system, so there is no retry and no "just in case" here.
    //
    // Armed before the click, so the request cannot be missed, and read afterwards
    // against the configured period and the note choices the flow marked. A period the
    // form held and the request did not carry is a real export registered for no period
    // at all, and a request that does not carry the authorised choices is a real export
    // of notes nobody asked for; they are the two failures here that nothing
    // downstream would notice.
    const registration = this.page.waitForRequest(isExportRegistrationRequest, {
      timeout: EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
    });

    await this.page.getByRole('button', { name: SCHEDULE_EXPORT_BUTTON_NAME, exact: true }).click();

    const sent = await registration;
    const fields = postedFields(sent);
    if (
      fields.get(EMISSION_START_FIELD_ID) !== period.start ||
      fields.get(EMISSION_END_FIELD_ID) !== period.end
    ) {
      throw new ExportRequestWithoutPeriodError(reference);
    }

    const diverged = findDivergedNoteChoiceGroup(fields);
    if (diverged !== null) {
      throw new ExportRequestWithUnauthorisedNoteChoiceError(
        reference,
        diverged.rowLabel,
        diverged.authorised,
      );
    }
  }

  async countScheduledRowsFor(inscription: string): Promise<number> {
    // The selector and the punctuation travel as arguments because the callback runs
    // inside the page, where a module constant is not in scope.
    return await scheduledExportsRows(this.page).evaluateAll(
      (rows, [digits, cellSelector, punctuation]) => {
        // The portal separates the check digit from the rest of the inscription it
        // lists — measured on the table of a real cycle: the cell reads the digits
        // with a hyphen before the check digit, and not as one run, so the punctuation
        // goes before the runs of digits are read. Without it the row that *is* the
        // export this run made is not counted, and the proof reports a registered
        // export as missing. Nothing else is removed, so a cell carrying two numbers
        // still matches on one of them.
        const carriesInscription = (cell: string | null | undefined): boolean =>
          (cell?.replaceAll(punctuation, '').match(/\d+/g) ?? []).some((run) => run === digits);
        return rows.filter((row) =>
          Array.from(row.querySelectorAll(cellSelector)).some((cell) =>
            carriesInscription(cell.textContent),
          ),
        ).length;
      },
      [
        inscription,
        CONTRIBUTOR_FORM_SELECTORS.scheduledExportsCell,
        PUNCTUATION_INSIDE_NUMBER,
      ] as const,
    );
  }

  /**
   * Marks one group's authorised choice and confirms the group kept it.
   *
   * The group is found by its row label because `Todas` is an option of **both** groups
   * (measured), so a lookup by the option's name could not tell them apart; and the row
   * label is a `<span>` in a cell rather than a `<label>`, so it has no accessible name
   * of its own to match — the text is the only semantic relation left, and its
   * uniqueness is checked rather than assumed.
   *
   * The group's options are read before the marking, because "the screen does not offer
   * this choice any more" and "the marking did not stick" are different failures that
   * happen to deserve the same typed error, and the first is a portal that changed
   * while the second is a screen that did what it was asked and still lost the choice.
   *
   * Marking is a click and nothing after it: no group carries an `onchange`, an AJAX
   * behaviour or a value-change marker (measured), so there is no postback to await and
   * no re-render to survive — the reading right below is the whole post-condition.
   */
  private async markChoice(group: ExportNoteChoiceGroup): Promise<void> {
    const row = labelledRow(this.page, group.rowLabel);
    // Web-first with a bound of its own: the form arrives on a postback, so the row
    // can be absent for a moment after the role is marked, and a count read straight
    // away would report that as a form that never rendered it.
    await expect(row).toHaveCount(1, { timeout: FORM_CONTROLS_TIMEOUT_MS });

    const offered = await this.radioChoiceNames(row.getByRole('radio'));
    if (!offersAuthorisedChoice(group, offered)) {
      throw new UnexpectedFormChoiceError(
        NOTE_CHOICE_FAILURE.notOffered,
        group,
        offered.join(', '),
      );
    }

    // By role and accessible name, which the radio's own `<label for>` provides
    // (measured): the radios are the only controls of this screen that carry one, so
    // the role also proves what is being marked is a radio of this row.
    await row.getByRole('radio', { name: group.authorised, exact: true }).check();

    const marked = await this.markedChoiceNames(row);
    if (!marked.includes(group.authorised)) {
      throw new UnexpectedFormChoiceError(NOTE_CHOICE_FAILURE.notMarked, group, marked.join(', '));
    }
  }

  /**
   * Radio labels the flow does not know, each listed once however often it appears.
   *
   * The page reads the names and the module compares them: which names exist is the
   * portal's answer, and which of them the flow recognises is this table's.
   */
  private async unknownChoiceNames(): Promise<string[]> {
    return findUnknownChoiceNames(
      await this.radioChoiceNames(this.page.getByRole('radio')),
      MEASURED_CHOICE_NAMES,
    );
  }

  /**
   * Server ids of the form fields the screen marks as required.
   *
   * The measured form carries no required marker anywhere (spike 06), so any hit is
   * a field the flow was not authorised to fill, and filling it — or not filling it
   * — would be a decision about a fiscal parameter that is not the automation's to
   * make. Ids are reported, not values: an id is a name the server invented, while
   * the field's value would be fiscal data.
   */
  private async requiredFieldIds(): Promise<string[]> {
    const marked = await this.page
      .locator(CONTRIBUTOR_FORM_SELECTORS.formFieldContainers.join(', '))
      .locator(CONTRIBUTOR_FORM_SELECTORS.requiredField)
      .evaluateAll((fields) => fields.map((field) => field.id || field.tagName.toLowerCase()));

    return [...new Set(marked)];
  }

  /**
   * Labels of the radios a container carries, read from their own `<label for>`.
   *
   * The label text is read inside the page because there is no other way to ask a
   * browser what the accessible name of a radio is, and the radios are the only
   * controls of this screen that carry a `<label for>` (measured), so the first
   * label is the one naming the radio.
   */
  private async radioChoiceNames(radios: Locator): Promise<string[]> {
    return await radios.evaluateAll((elements) =>
      elements.map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent.trim() ?? ''),
    );
  }

  /** Labels of the radios that are marked within a container. */
  private async markedChoiceNames(container: Locator): Promise<string[]> {
    const names = await container
      .getByRole('radio')
      .evaluateAll((radios) =>
        radios
          .filter((radio) => (radio as HTMLInputElement).checked)
          .map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent.trim() ?? ''),
      );
    return names;
  }
}
