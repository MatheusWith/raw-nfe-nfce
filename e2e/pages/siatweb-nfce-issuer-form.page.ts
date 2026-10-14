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
  NFCE_NOTE_CHOICE_FAILURE,
  NFCE_NOTE_CHOICE_GROUPS,
  findDivergedNfceNoteChoiceGroup,
  findUnknownNfceChoiceNames,
  offersAuthorisedNfceChoice,
  type NfceNoteChoiceGroup,
} from '../support/nfce-export-issuer-note-choices';
import type { EmissionPeriod } from '../support/environment';
import {
  expectScreenControlsServed,
  expectScreenReady,
  type RequiredScreenControl,
} from '../support/screen-readiness';
import {
  EMISSION_PERIOD_TIMEOUT_MS,
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  INSCRIPTION_RERENDER_TIMEOUT_MS,
} from '../support/timeouts';

/**
 * Accessible name of the radio that makes this an export form for the issuer.
 *
 * Measured as the only radio with that name on the NFC-e screen, and as a
 * `<label for>`, so both `getByRole` and `getByLabel` resolve it; the role is used
 * because it also proves the control is a radio, which is what has to be marked.
 *
 * The screen **arrives** with this radio already marked (measured in spike 08,
 * `buscaComoId` = `1`), so marking it is a no-op in the normal case. It is marked
 * anyway rather than assumed: the role is not a fiscal parameter, it is what makes
 * the export form exist, and a flow that inherited it from the arrival state would
 * be trusting a default it never chose.
 */
const ISSUER_ROLE_NAME = 'Contribuinte como Emitente';

/**
 * The other role this screen carries, which this flow never marks.
 *
 * Present because the unknown-choice guard has to know **every** radio on the form,
 * not only the ones the flow uses: a radio the flow does not recognise is a radio
 * whose value it could not compare the request against.
 */
const DESTINATION_RECIPIENT_ROLE_NAME = 'Contribuinte como Destinatário';

/**
 * Button that registers the export request.
 *
 * Measured as `Agendar exportação`, with the lowercase "e". It is the only actuation
 * in this flow with a fiscal effect, and it is clicked exactly once per item.
 */
const SCHEDULE_EXPORT_BUTTON_NAME = 'Agendar exportação';

/**
 * Server id of the datatable that lists the scheduled exports of the **NFC-e**
 * screen.
 *
 * Markup addressing, and the reason is measured: this table is a **different table**
 * from the NF-e one (`lista-agendamentos`), with its own rows and its own history of
 * what was scheduled through the NFC-e branch. Addressing the NF-e table from this
 * flow would read rows this flow never created. Written by hand (the row buttons are
 * `lista-agendamentos-nfce:<row>:…`), unlike the `j_idt…` counters, and an id is
 * unique, so it names exactly one table.
 *
 * Scoping matters rather than being tidiness: the table is paginated and the page
 * carries other tables, so a row count taken over the page reports the header bar
 * and the pagination as exports and misreports whether anything was added. Read by
 * the selectors below, so the id is written once.
 */
const SCHEDULED_EXPORTS_TABLE_ID = 'lista-agendamentos-nfce';

/**
 * Server id of the first emission date field.
 *
 * Markup addressing, under the same measurement: the field carries a visible label
 * but no `label[for]`, no `aria-label` and no `placeholder`, so no semantic locator
 * can name it. These ids are written by hand, unlike the inscription's `j_idt39`,
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
 * Measured on the one request this screen was allowed to make out of the flow: the
 * change that chooses the inscription posts `javax.faces.behavior.event=valueChange`
 * and re-renders `consultarNFCeForm` (spike 08 §6). The scheduling button's own
 * request was **not** measured — pressing it registers a real export — and where
 * that leaves an assumption is written where it is used, in
 * {@link isExportRegistrationRequest}. Read as the server reads them, through
 * {@link postedFields}, so the reading cannot drift from the body the portal sends,
 * and without naming a generated id that shifts between loads.
 */
const JSF_BEHAVIOUR_EVENT_FIELD = 'javax.faces.behavior.event';
const JSF_PARTIAL_RENDER_FIELD = 'javax.faces.partial.render';

/** Value the behaviour event field carries on a value change (measured). */
const VALUE_CHANGE_EVENT = 'valueChange';

/**
 * Punctuation the portal writes inside a number it lists, and the only thing removed
 * before the digits are read. Measured on the table of a real cycle of the NF-e
 * screens: the cell separates the check digit from the rest of the inscription with a
 * hyphen, so reading the digits as they are written would not find the row that *is*
 * the export the run made — and the proof would report a registered export as missing.
 */
const PUNCTUATION_INSIDE_NUMBER = '-';

/**
 * Label of the row whose cell holds the inscription control, **with its two colons**.
 *
 * Measured in spike 08: the NFC-e form writes `Inscrição::`, where the NF-e form
 * writes `Inscrição:`. The row is the only stable relation to the control — it has no
 * `label[for]`, no `aria-label` and no `placeholder`, and its server id `j_idt39` is a
 * generated counter — so a label copied from the other form would find no row at all
 * and the cycle would fail on a screen that works.
 */
const INSCRIPTION_ROW_LABEL = 'Inscrição::';

/**
 * Label of the row that says the screen is the **NFC-e** export form and not the
 * NF-e one.
 *
 * The arrival proof, and deliberately declared here instead of read from
 * `NFCE_NOTE_CHOICE_GROUPS`: the two screens serve the same field ids
 * (`dataInicial_input`, `dataFinal_input`), the same containers (`#altExterno`,
 * `#panel-dados`) and the same button name, so the form controls alone say "an export
 * form" rather than *this* one. The choices table records the same text as the status
 * group's row label, and deriving the arrival marker from that table would make the
 * proof circular — a flow whose table recorded the wrong label would then "arrive" on
 * the wrong screen and pass. Two declarations of one measured string, and the reason
 * they are not one is that a proof has to be independent of what it proves.
 */
const STATUS_ROW_LABEL = 'Status da NFC-e:';

/** Button that dismisses the notice the screen opens with (measured: the only one). */
const NOTICE_ACKNOWLEDGEMENT_NAME = 'Entendi';

/**
 * Every radio the NFC-e screen carries, whether or not this flow marks it.
 *
 * A multiset rather than a set, because the comparison it feeds counts occurrences
 * and not distinct names. Two roles plus every option of both choice groups — the
 * roles are written here because they are not choice groups and so are not in
 * {@link NFCE_NOTE_CHOICE_GROUPS}, and the options are read from there so that the
 * list of what a group offers is written once. It is what lets the flow notice a
 * choice it does not know: a new group or a new option would be a new fiscal
 * parameter, and leaving it at whatever the screen happens to mark would schedule an
 * export nobody authorised.
 */
const MEASURED_ROLE_NAMES = [ISSUER_ROLE_NAME, DESTINATION_RECIPIENT_ROLE_NAME] as const;

const MEASURED_CHOICE_NAMES = [
  ...MEASURED_ROLE_NAMES,
  ...NFCE_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
] as const;

/**
 * The controls the form has to carry before anything is filled in.
 *
 * Measured on arrival: the screen does **not** open on a search-by-key form the way
 * the NF-e screen does — the export form is what it serves — so these are present
 * from the first moment the screen is on it. They are polled rather than counted once
 * anyway, for the reason that has already cost this project a wrong failure: a single
 * reading taken at the wrong moment reports a screen that never rendered the controls,
 * which is a different and wrong failure.
 */
const FORM_CONTROLS = [
  {
    name: 'the inscription control',
    locator: (page: Page): Locator => inscriptionControl(page),
  },
  {
    name: 'the first emission date field',
    locator: (page: Page): Locator => page.locator(ISSUER_FORM_SELECTORS.emissionStartField),
  },
  {
    name: 'the last emission date field',
    locator: (page: Page): Locator => page.locator(ISSUER_FORM_SELECTORS.emissionEndField),
  },
  {
    name: 'the schedule export button',
    locator: (page: Page): Locator =>
      page.getByRole('button', { name: SCHEDULE_EXPORT_BUTTON_NAME, exact: true }),
  },
] as const satisfies readonly RequiredScreenControl[];

/** What the wait for the arrival controls says, in the words of this screen. */
const ARRIVAL_CONTROLS_POLL_MESSAGE =
  'The NFC-e export screen did not serve the controls the flow requires. ' +
  'The screen arrived in a shape the flow does not know how to use.';

/** What the wait for the form controls says, in the words of this screen. */
const FORM_CONTROLS_POLL_MESSAGE =
  'The NFC-e export form was not served with the controls the flow requires. ' +
  'Nothing was filled in and nothing was scheduled.';

/**
 * Markup the NFC-e issuer form is addressed by, as measured in spike 08.
 *
 * Grouped here so the raw markup of the screen has a single source of truth, the way
 * the other screens carrying measured markup already keep theirs.
 *
 * Each entry states the measurement that stands in for a semantic locator, because
 * the rule is not "prefer semantic locators" but "when you cannot, say what you
 * measured". Two entries have no measurement to state and say so in place rather than
 * guessing: the spelling a required marker would arrive in, and the element a table
 * cell is. Both are questions for the person rather than defects the flow can hit
 * today — the measured form carries no required marker at all — and an absent reason
 * invites the question, where an invented one looks like an answer.
 */
const ISSUER_FORM_SELECTORS = {
  /**
   * A row of the form, carrying the label the person reads in one cell and the
   * control in the next.
   *
   * Measured: the form is built as rows, and a `tr` narrowed by the exact visible
   * label is the one relation common to both containers the fields are split across
   * (spike 08, "O formulário"). No semantic locator replaces it — the form exposes no
   * group, no landmark and no list to be the container. The label is checked for
   * uniqueness where it is used, so a portal that adds a second row with the same
   * label fails instead of quietly matching two.
   */
  row: 'tr',

  /**
   * The inscription control, inside the row its own label identifies.
   *
   * Measured: the inscription carries no `label[for]`, no `aria-label` and no
   * `placeholder` (spike 08), so neither `getByLabel` nor `getByRole` can name it,
   * and its server id `j_idt39` is a generated counter that shifts between loads
   * (spike 08). The row is the only stable relation left, and this is the only
   * `select` in it.
   */
  inscriptionSelect: 'select',

  /**
   * How a field would mark itself required.
   *
   * **Justification pending.** The measured form carries no required marker anywhere
   * (spike 08: `requiredMarkers` came back empty), so which spelling the portal would
   * use if it added one was never observed. Both attribute forms are written here on
   * the strength of HTML rather than of a measurement — the outcome is safe either
   * way, but the shape is an assumption and is labelled as one.
   */
  requiredField: '[required], [aria-required="true"]',

  /**
   * Wrapper the scheduled exports table is rendered in, by its server id.
   *
   * Measured: the wrapper carries the id `lista-agendamentos-nfce`, written by hand
   * unlike the `j_idt…` counters the portal generates, so it does not shift.
   *
   * Scoping is not tidiness: the table is paginated and the page carries others, so a
   * count taken over the page reports the header bar and the pagination as exports
   * and misreports whether anything was added.
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
   * **Justification pending.** Spike 08 records which columns the table carries
   * (`ID`, `Situação`, `Data de criação`, `Data processamento`, `CNPJ`, `IE`,
   * `Ações`), not which element holds a column's value. `td` is written here on the
   * strength of what a table is rather than of a measurement — ask before trusting
   * the shape.
   */
  scheduledExportsCell: 'td',

  /**
   * Containers the form's own fields live in.
   *
   * Measured, and the reason is measured too: the fields are **not** under one
   * parent. The inscription sits in a table with no id inside `span#altExterno`,
   * while the note number, the two dates and the choice groups sit in
   * `table#formularioPanel` inside `span#panel-dados` (spike 08). A check scoped to
   * one of them would cover half the form and pass while missing the other half.
   * Scoping also keeps the lookup off the hidden `Info` dialog, which writes the same
   * labels with the same colons and would otherwise match each labelled row twice. No
   * semantic locator replaces it: a span with no role is not one.
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
 * — the form's row and the dialog's. Both containers are named in
 * {@link ISSUER_FORM_SELECTORS.formFieldContainers} under the same measurement, and a
 * row under either one is a row of this form, so scoping costs no coverage.
 */
function labelledRow(page: Page, label: string): Locator {
  return page
    .locator(ISSUER_FORM_SELECTORS.formFieldContainers.join(', '))
    .locator(ISSUER_FORM_SELECTORS.row)
    .filter({ has: page.getByText(label, { exact: true }) });
}

/** The row of the inscription control. */
function inscriptionRow(page: Page): Locator {
  return labelledRow(page, INSCRIPTION_ROW_LABEL);
}

/** The inscription control of the form, which the flow reads, selects and checks. */
function inscriptionControl(page: Page): Locator {
  return inscriptionRow(page).locator(ISSUER_FORM_SELECTORS.inscriptionSelect);
}

/** The data rows of the NFC-e scheduled exports table, and only of that one. */
function scheduledExportsRows(page: Page): Locator {
  return page
    .locator(ISSUER_FORM_SELECTORS.scheduledExportsWrapper)
    .locator(ISSUER_FORM_SELECTORS.scheduledExportsRow);
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
 * The marker is read off the button itself, and not off an analogy with the NF-e
 * screen: the rendered `onclick` of `Agendar exportação` carries
 * `update:'j_idt62 consultarNFCeForm lista-agendamentos-nfce'`, so the id of the
 * table the click re-renders is a fact of the markup (spike 08 §7, "O pedido medido
 * em produção"). Pressing the button registers a real export, which is why neither
 * probe ever recorded its body by hand — the reading came from the markup instead of
 * from a press.
 *
 * The first authorized run of this cycle confirmed it in production: the request that
 * went out carried this same `javax.faces.partial.render`, together with the
 * configured period and the authorised note choices, and was answered 200. The body
 * is still not read by the automation — the row count is the proof — but the marker
 * is measured now, and 200 alone proves nothing: the portal answers 200 to a request
 * it refuses as a repeat of a scheduling that already exists.
 *
 * The failure this produces if the portal disagrees is written down rather than
 * anticipated away: a mismatch fails **after** the click, with the export already
 * registered. The Playwright trace keeps the body that went out, which is what
 * reveals it.
 */
function isExportRegistrationRequest(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    (postedFields(request).get(JSF_PARTIAL_RENDER_FIELD) ?? '').includes(SCHEDULED_EXPORTS_TABLE_ID)
  );
}

/**
 * Public contract of the NFC-e export form of the "Consultar/Exportar NFC-e" screen.
 *
 * Consumers depend on this contract rather than on the page object implementation,
 * so the object can be swapped without touching them.
 *
 * One object for the whole screen, and no delegation to a form of its own: the NF-e
 * flow splits arrival from form because that screen opens on a search-by-key state
 * that becomes the form only once a role is chosen. This screen **arrives** on the
 * form (measured in spike 08), so there is no intermediate state to model and one
 * object models the screen from arrival to registration.
 *
 * The reads that decide something come as `expect…` methods that raise the typed
 * failure, and not as bare booleans the caller has to test: a step that branches on
 * a reading is a step whose failure is an anonymous `Error`, and the phase a red
 * test failed in is exactly what has to be legible in the report.
 */
export interface SiatWebNfceIssuerFormPageContract {
  /**
   * Confirms the screen arrived on the NFC-e export form.
   *
   * Two things, because either alone is weaker than the proof: the form's controls
   * are served, **and** the row naming the document is on the screen. The controls
   * alone say "an export form", and this screen serves the same field ids, the same
   * containers and the same button name as the NF-e one.
   *
   * @param timeoutMs bound on the screen being served; defaults to the Playwright
   * assertion timeout.
   */
  expectOpen(timeoutMs?: number): Promise<void>;

  /**
   * Confirms the form is open and usable, before anything is filled in.
   *
   * @param timeoutMs bound on the form being served.
   */
  expectUsable(timeoutMs?: number): Promise<void>;

  /** Acknowledges the notice, on any opening where the screen shows one. */
  dismissNotice(): Promise<void>;

  /**
   * Marks the issuer role and confirms the form it is meant to open.
   *
   * The screen already arrives with it marked (measured), so the marking is
   * idempotent: what is being stated is that this flow exports as the issuer, not
   * what the arrival happened to leave behind. Which notes the file brings is a
   * fiscal parameter instead, and that is
   * {@link SiatWebNfceIssuerFormPageContract.applyAuthorisedNoteChoices}.
   */
  chooseIssuerRole(): Promise<void>;

  /**
   * Fails, before any export is scheduled, when the form carries a choice the flow
   * does not know or asks for a field it was not authorised to fill.
   *
   * Says nothing about how a known choice is marked: the flow states that itself, per
   * group, once it has selected the inscription — see
   * {@link SiatWebNfceIssuerFormPageContract.applyAuthorisedNoteChoices}.
   */
  expectNothingUnauthorisedAsked(): Promise<void>;

  /**
   * Marks, in each choice group, the choice the person authorised, and confirms each
   * group kept it.
   *
   * Stated rather than inherited, which is the whole point: the screen arrives with
   * `Tipo de nota` = Saída and `Status da NFC-e` = **Ativas**, and the authorised
   * export is of the **cancelled** notes. The second group therefore diverges from the
   * arrival, and the first one happens to agree — which is the difference between
   * agreeing by accident and having been chosen.
   *
   * Called **after** the inscription is selected, because that selection is the last
   * thing in the item that re-renders the form (measured: `partial.render` =
   * `consultarNFCeForm`): marking after it puts the choices on the version of the form
   * that will be submitted, and marking before it would leave the re-render to hand
   * the screen's defaults back to the request. Marking fires no postback of its own —
   * neither group carries an `onchange`, an AJAX behaviour or a value-change marker
   * (measured) — so there is nothing to wait for, and the read-back is the assertion
   * on each radio. {@link SiatWebNfceIssuerFormPageContract.scheduleExport} then
   * checks the values on the request that goes out.
   *
   * A thin statement of {@link SiatWebNfceIssuerFormPageContract.applyNoteChoices}
   * with this screen's own table, so that the two flows of this screen share one
   * marking implementation and differ only in the table they pass.
   */
  applyAuthorisedNoteChoices(): Promise<void>;

  /**
   * Marks, in each of the **given** choice groups, the choice that table authorises,
   * and confirms each group kept it.
   *
   * The table travels as a parameter because this one page models one screen that two
   * flows work with different authorisations: the `Canceladas` flow hands it
   * `NFCE_NOTE_CHOICE_GROUPS`, the every-status flow hands it
   * `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS`. The marking itself — find the row by its
   * label, refuse a group that no longer offers the choice, mark by role and exact
   * name, read it back — is one implementation over one shape, and both flows get it
   * from here. Which choice is authorised, and which values the portal posts for it,
   * remain each flow's own table, declared in its own module.
   *
   * The ordering rule of the sibling method holds unchanged: called **after** the
   * inscription is selected, on the version of the form that will be submitted.
   *
   * @param groups the choice groups to state, one authorised option per group.
   */
  applyNoteChoices(groups: readonly NfceNoteChoiceGroup[]): Promise<void>;

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
   * Selects the inscription by its number, never by its position in the list, and
   * returns when the form that selection re-renders is in place.
   *
   * The wait belongs to the selection and not to the caller because the period and the
   * note choices are both written into the form this postback leaves behind: returning
   * earlier writes into a form that is about to be replaced, and the request then goes
   * out with the screen's own defaults.
   */
  selectInscription(inscription: string): Promise<void>;

  /**
   * Fails when the form did not take the inscription that was selected.
   *
   * Re-read inside the page, because the dropdown's own value is the only evidence
   * that the screen read the selection, and it arrives on a placeholder, so nothing
   * about it can be assumed about the choice that was just made.
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
   * the form panel (measured). Fields that read **empty** are that re-render, and the
   * period is written again — `onFormRerendered` is invoked so the caller can record it
   * in the report. Fields that read **anything other than the configured period** are a
   * field rewriting its input, which is a defect and fails at once, without a retry: a
   * period other than the configured one is an export nobody authorised.
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
   * Registers the export request, exactly once, and confirms the period and the note
   * choices left the browser inside it.
   *
   * The period and the choices are compared against the request that went out, not
   * against the form: the form can be re-rendered between the check that read it and
   * the click that submits it, and only the request says what the destination system
   * received.
   *
   * @param reference how the export is named in the failure, taken because a request
   * that went out with no period or with the wrong notes is the one failure here that
   * nothing downstream would notice, and a report that does not say which item it was
   * cannot act on it.
   *
   * A thin statement of
   * {@link SiatWebNfceIssuerFormPageContract.scheduleExportValidated} with this
   * screen's own table, so that the two flows of this screen share one registration
   * step and differ only in the table they pass.
   */
  scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;

  /**
   * Registers the export request, exactly once, and confirms the period and the
   * choices of the **given** table left the browser inside it.
   *
   * The same registration step as
   * {@link SiatWebNfceIssuerFormPageContract.scheduleExport}, with the table to compare
   * the request against passed in instead of fixed: one screen, two flows, each
   * authorising a different set of notes, and the wire reading is one comparison over
   * one shape. Everything else is unchanged — once and only once, no retry, the
   * request armed before the click, the period compared on the way out, and a
   * divergence failing **after** the click with the export already registered, which
   * the Playwright trace answers for by keeping the body that went out.
   *
   * @param period the emission period the request has to carry.
   * @param reference how the export is named in the failure.
   * @param groups the flow's own choice groups to compare the request against.
   */
  scheduleExportValidated(
    period: EmissionPeriod,
    reference: ScheduledExportReference,
    groups: readonly NfceNoteChoiceGroup[],
  ): Promise<void>;

  /**
   * How many rows of the scheduled exports table carry the inscription, decided
   * inside the page.
   *
   * A row counts when the inscription appears as a complete run of digits in one
   * of its cells, once the punctuation the portal writes inside the number is
   * removed — it separates the check digit from the rest (measured), and reading the
   * digits as they are written counts the export this run made as missing. Everything
   * else the cell carries still does not matter: a cell with more than one number
   * still matches on one of them, and one inscription cannot be mistaken for another
   * that starts with the same digits.
   */
  countScheduledRowsFor(inscription: string): Promise<number>;
}

/**
 * The export form of the "Consultar/Exportar NFC-e" screen.
 *
 * A third page object, and a sibling rather than a variant of the NF-e ones: this is
 * another screen on another menu branch, with its own `form`, its own choice groups,
 * its own inscription row label and its own scheduled exports table. Nothing here
 * imports screen knowledge from an NF-e page object, and the duplication is the point
 * — see ADR 0011.
 */
export class SiatWebNfceIssuerFormPage implements SiatWebNfceIssuerFormPageContract {
  constructor(private readonly page: Page) {}

  get noticeAcknowledgement(): Locator {
    return this.page.getByRole('button', { name: NOTICE_ACKNOWLEDGEMENT_NAME, exact: true });
  }

  async expectOpen(timeoutMs?: number): Promise<void> {
    await expectScreenControlsServed(
      this.page,
      FORM_CONTROLS,
      timeoutMs,
      ARRIVAL_CONTROLS_POLL_MESSAGE,
    );
    await expect(labelledRow(this.page, STATUS_ROW_LABEL)).toBeVisible({ timeout: timeoutMs });
  }

  async expectUsable(timeoutMs?: number): Promise<void> {
    await expectScreenReady(this.page, FORM_CONTROLS, timeoutMs, FORM_CONTROLS_POLL_MESSAGE);
  }

  async dismissNotice(): Promise<void> {
    const acknowledgement = this.noticeAcknowledgement;
    // Measured: the notice is a modal dialog, so it is either on the screen or not,
    // with no partial state in between. While it is up the form behind it is not
    // usable, so it has to go before anything else is claimed; when the portal does
    // not show it there is nothing to dismiss and the assertion below still holds.
    if (await acknowledgement.isVisible()) {
      await acknowledgement.click();
    }
    await expect(acknowledgement).toBeHidden();
  }

  async chooseIssuerRole(): Promise<void> {
    const role = this.page.getByRole('radio', { name: ISSUER_ROLE_NAME, exact: true });
    await expect(role).toBeVisible();
    // Idempotent: the screen arrives with this radio already marked (measured), so
    // the click does nothing in the normal case. What the step states is that this
    // flow exports as the issuer — the role is not a fiscal parameter, it is what
    // makes the export form exist.
    await role.check();
    await this.expectUsable();
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
    await this.applyNoteChoices(NFCE_NOTE_CHOICE_GROUPS);
  }

  async applyNoteChoices(groups: readonly NfceNoteChoiceGroup[]): Promise<void> {
    for (const group of groups) {
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

  async selectInscription(inscription: string): Promise<void> {
    // Armed before the selection, because the postback is what the selection fires and
    // a listener armed after it can miss it. Awaited on the body, not on the headers:
    // the form is replaced by the response being parsed and applied, and the period and
    // the note choices are written after that.
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
      throw new RejectedFieldValueError(INSCRIPTION_ROW_LABEL);
    }

    // This says one thing only: the dropdown took the inscription. It deliberately
    // says nothing about the form having settled — selecting the inscription fires a
    // postback that re-renders the panel, and the period and the note choices are
    // written afterwards, into the form that postback leaves behind. See
    // {@link SiatWebNfceIssuerFormPageContract.applyAuthorisedNoteChoices}.
  }

  async fillEmissionPeriod(start: string, end: string): Promise<void> {
    // Filled rather than typed: the fields carry a datepicker, and typing would let
    // a mask interpret the value one keystroke at a time. The values are the ones
    // the screen shows, so there is nothing for a mask to rewrite.
    await this.page.locator(ISSUER_FORM_SELECTORS.emissionStartField).fill(start);
    await this.page.locator(ISSUER_FORM_SELECTORS.emissionEndField).fill(end);
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
            message: 'The NFC-e export form did not settle on the configured emission period',
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
    await this.scheduleExportValidated(period, reference, NFCE_NOTE_CHOICE_GROUPS);
  }

  async scheduleExportValidated(
    period: EmissionPeriod,
    reference: ScheduledExportReference,
    groups: readonly NfceNoteChoiceGroup[],
  ): Promise<void> {
    // Once, and only once: every click on this button is a real request in the
    // destination system, so there is no retry and no "just in case" here.
    //
    // Armed before the click, so the request cannot be missed, and read afterwards
    // against the configured period and the choices of the table the calling flow
    // passed. A period the form held and the request did not carry is a real export
    // registered for no period at all, and a request that does not carry the
    // authorised choices is a real export of notes nobody asked for; they are the two
    // failures here that nothing downstream would notice.
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

    const diverged = findDivergedNfceNoteChoiceGroup(fields, groups);
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
        // lists: the cell reads the digits with a hyphen before the check digit, and not
        // as one run, so the punctuation goes before the runs of digits are read. Without
        // it the row that *is* the export this run made is not counted, and the proof
        // reports a registered export as missing. Nothing else is removed, so a cell
        // carrying two numbers still matches on one of them.
        const carriesInscription = (cell: string | null | undefined): boolean =>
          (cell?.replaceAll(punctuation, '').match(/\d+/g) ?? []).some((run) => run === digits);
        return rows.filter((row) =>
          Array.from(row.querySelectorAll(cellSelector)).some((cell) =>
            carriesInscription(cell.textContent),
          ),
        ).length;
      },
      [inscription, ISSUER_FORM_SELECTORS.scheduledExportsCell, PUNCTUATION_INSIDE_NUMBER] as const,
    );
  }

  /**
   * Marks one group's authorised choice and confirms the group kept it.
   *
   * The group is found by its row label, which is the label the request comparison and
   * the refusal message quote. The row's options are read before the marking, because
   * "the screen does not offer this choice any more" is a portal change and is the one
   * refusal this module has a word for (measured: no group fires a postback, so there
   * is no re-render to survive and the read-back is the whole post-condition).
   *
   * The read-back is Playwright's own `toBeChecked()` and not a second reading of a
   * request: marking is a client-side action here (measured — neither group carries
   * `onchange`, an AJAX behaviour or a value-change marker), so the radio's own state
   * is the observable that says the marking stuck, and it is read under the standard
   * assertion bound rather than once.
   */
  private async markChoice(group: NfceNoteChoiceGroup): Promise<void> {
    const row = labelledRow(this.page, group.rowLabel);
    // Web-first with a bound of its own: a count read too early would report a form
    // that never rendered the row.
    await expect(row).toHaveCount(1, { timeout: FORM_CONTROLS_TIMEOUT_MS });

    const offered = await this.radioChoiceNames(row.getByRole('radio'));
    if (!offersAuthorisedNfceChoice(group, offered)) {
      throw new UnexpectedFormChoiceError(
        NFCE_NOTE_CHOICE_FAILURE.notOffered,
        group,
        offered.join(', '),
      );
    }

    // By role and accessible name, which the radio's own `<label for>` provides
    // (measured): the radios are the only controls of this screen that carry one, so
    // the role also proves what is being marked is a radio of this row.
    const choice = row.getByRole('radio', { name: group.authorised, exact: true });
    await choice.check();
    await expect(choice).toBeChecked();
  }

  /**
   * How many inscriptions the form offers.
   *
   * A count and not the list: the options are fiscal data of real companies, and the
   * count is all a refusal message needs to say. Private because only the refusal
   * above needs it, and nothing outside this object asks.
   */
  private async countOfferedInscriptions(): Promise<number> {
    return await inscriptionControl(this.page).evaluate(
      (element) => (element as HTMLSelectElement).options.length,
    );
  }

  /**
   * Radio labels the flow does not know, each listed once however often it appears.
   *
   * The page reads the names and the module compares them: which names exist is the
   * portal's answer, and which of them the flow recognises is this table's.
   */
  private async unknownChoiceNames(): Promise<string[]> {
    return findUnknownNfceChoiceNames(
      await this.radioChoiceNames(this.page.getByRole('radio')),
      MEASURED_CHOICE_NAMES,
    );
  }

  /**
   * Server ids of the form fields the screen marks as required.
   *
   * The measured form carries no required marker anywhere (spike 08), so any hit is
   * a field the flow was not authorised to fill, and filling it — or not filling it
   * — would be a decision about a fiscal parameter that is not the automation's to
   * make. Ids are reported, not values: an id is a name the server invented, while
   * the field's value would be fiscal data.
   */
  private async requiredFieldIds(): Promise<string[]> {
    const marked = await this.page
      .locator(ISSUER_FORM_SELECTORS.formFieldContainers.join(', '))
      .locator(ISSUER_FORM_SELECTORS.requiredField)
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
}
