import type { Locator, Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  ExportRequestWithoutPeriodError,
  ExportRequestWithUnauthorisedNoteChoiceError,
  UnknownFormChoiceError,
  UnknownRequiredFieldError,
  UnexpectedFormChoiceError,
  type ScheduledExportReference,
} from '../support/nfe-export-error';
import {
  findDivergedIssuerNoteChoiceGroup,
  findUnknownIssuerChoiceNames,
  ISSUER_NOTE_CHOICE_FAILURE,
  ISSUER_NOTE_CHOICE_GROUPS,
  offersAuthorisedIssuerChoice,
  type IssuerNoteChoiceGroup,
} from '../support/nfe-export-issuer-note-choices';
import type { EmissionPeriod } from '../support/environment';
import {
  expectScreenControlsServed,
  type RequiredScreenControl,
} from '../support/screen-readiness';
import {
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
} from '../support/timeouts';
import type { SiatWebNfeContributorFormPageContract } from './siatweb-nfe-contributor-form.page';

/**
 * Accessible name of the radio that turns the screen into the export form for the
 * issuer role.
 *
 * Measured in spike 07 as the second option of the `buscaComoId` group, posting
 * `1`, with a `<label for>` of its own — so the role is addressable by semantic
 * locator with exact matching on the name the person reads, and the role locator
 * also proves the control being marked is a radio.
 */
const ISSUER_ROLE_NAME = 'Contribuinte como Emitente';

/**
 * Button that registers the export request.
 *
 * Measured twice, once per role form (spike 06 and spike 07), and the same in both:
 * `Agendar exportação`, with the lowercase "e". It is not the arrival state's
 * `Exportar` button, which belongs to the single-note form and is never actuated.
 */
const SCHEDULE_EXPORT_BUTTON_NAME = 'Agendar exportação';

/**
 * Server id of the datatable that lists the scheduled exports.
 *
 * Same measurement as the destination form's, and declared again rather than
 * imported: the two page objects are two readings of two screen states, and this
 * page object answers for what it addresses (see the note on the selectors below).
 * The id is written by hand, unlike the `j_idt…` counters, so it does not shift.
 */
const SCHEDULED_EXPORTS_TABLE_ID = 'lista-agendamentos';

/**
 * Server ids of the emission date fields, which are also the names the request
 * carries them under.
 *
 * Measured in spike 07 on the issuer form: the fields carry a visible label but no
 * `label[for]`, no `aria-label` and no `placeholder`, so no semantic locator can
 * name them, and the ids are written by hand. They double as the request field
 * names, which is why reading the posted period needs no markup of its own.
 */
const EMISSION_START_FIELD_ID = 'dataInicial_input';
const EMISSION_END_FIELD_ID = 'dataFinal_input';

/**
 * JSF request field whose value says which fragment a request re-renders.
 *
 * Read as the server reads it, through {@link postedFields}, so the reading cannot
 * drift from the body the portal sends and no generated id has to be named.
 */
const JSF_PARTIAL_RENDER_FIELD = 'javax.faces.partial.render';

/**
 * Every radio the screen carries on arrival, whether or not a role has been chosen.
 *
 * A multiset rather than a set, because `Todas` is an option of both choice groups —
 * the groups are read from {@link ISSUER_NOTE_CHOICE_GROUPS}, so what a group offers
 * is written once. A new role, a new group or a new option is a new fiscal
 * parameter, and leaving it at whatever the screen happens to mark would schedule an
 * export nobody authorised.
 *
 * The three roles are this form's own measurement (spike 07, `buscaComoId`), written
 * out rather than borrowed from the destination flow's page object: neither page
 * reads the other's knowledge, and the whole point of measuring this form was not to
 * assume it was the same one.
 */
const MEASURED_ROLE_NAMES = [
  'Pesquisar SOMENTE pela Chave da NFE',
  ISSUER_ROLE_NAME,
  'Contribuinte como Destinatário',
] as const;

/** {@link MEASURED_ROLE_NAMES} plus every option of this form's own choice groups. */
const MEASURED_ISSUER_CHOICE_NAMES = [
  ...MEASURED_ROLE_NAMES,
  ...ISSUER_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
] as const;

/**
 * The one control this screen has to carry before the export form can be opened.
 *
 * The three role radios are served with the arrival state (spike 07), so this is the
 * shape check that runs before anything is marked rather than a wait for a postback.
 */
const ISSUER_ROLE_CONTROLS = [
  {
    name: 'the issuer role radio',
    locator: (page: Page): Locator =>
      page.getByRole('radio', { name: ISSUER_ROLE_NAME, exact: true }),
  },
] as const satisfies readonly RequiredScreenControl[];

/** What the wait for the role radio says, in the words of this screen. */
const ISSUER_ROLE_POLL_MESSAGE =
  'The NF-e export screen did not serve the "Contribuinte como Emitente" role ' +
  'radio, so the export form could not be opened. Nothing was marked and ' +
  'nothing was scheduled.';

/**
 * Markup the issuer form is addressed by, as measured in spike 07.
 *
 * **The same three entries the destination form's page object carries, declared a
 * second time — on purpose, and the reason is the boundary between the two page
 * objects rather than a wish to repeat.** Markup lives in page objects and nowhere
 * else (referência técnica, "Seletores"), so sharing it would mean one page object
 * importing the other's implementation — which the two page objects are explicitly
 * not allowed to do. The alternative, a support module holding markup, would break
 * the same rule from the other side: support modules orchestrate screens and do not
 * know markup.
 *
 * So each page object declares what it addresses, each cites its own measurement,
 * and a change to the screen's markup is fixed in the two places that address it.
 * Spike 07 re-measured these three entries on the issuer form and found them
 * identical to spike 06's; that is a measurement of two states of one screen, not a
 * fact the code is allowed to assume.
 *
 * Each entry states the measurement that stands in for a semantic locator, because
 * the rule is not "prefer semantic locators" but "when you cannot, say what you
 * measured". The `requiredField` entry has no measurement to state and says so in
 * place rather than guessing: the issuer form carries no required marker either.
 */
const ISSUER_FORM_SELECTORS = {
  /**
   * A row of the form, carrying the label the person reads in one cell and the
   * control in the next.
   *
   * Measured in spike 07: the form is built as rows, and the row carrying a group's
   * label is an **outer** row — the radios sit in a row of their own that carries
   * only the options. A `tr` narrowed by the exact visible label is the one relation
   * common to both containers the fields are split across, and it lands on the outer
   * row, which contains the radios as descendants. No semantic locator replaces it:
   * the form exposes no group, no landmark and no list to be the container. The label
   * is checked for uniqueness where it is used, so a portal that adds a second row
   * with the same label fails instead of quietly matching two.
   */
  row: 'tr',

  /**
   * Containers the form's own fields live in.
   *
   * Measured in spike 07, and the reason is measured too: the fields are not under
   * one parent — the inscription sits in a table with no id inside `span#altExterno`,
   * while the company name, the note number, the dates and the choice groups sit in
   * `table#formularioPanel` inside `span#panel-dados`. Scoping to them rather than to
   * the page is what keeps the hidden Info dialog, which stays in the DOM and writes
   * the same labels with the same colons, from matching twice. No semantic locator
   * replaces it: a span with no role is not one.
   */
  formFieldContainers: ['#altExterno', '#panel-dados'],

  /**
   * How a field would mark itself required.
   *
   * **Justification pending.** Spike 07 measured no required marker anywhere on this
   * form either, so which spelling the portal would use if it added one was never
   * observed. Both attribute forms are written here on the strength of HTML rather
   * than of a measurement — the outcome is safe either way, but the shape is an
   * assumption and is labelled as one.
   */
  requiredField: '[required], [aria-required="true"]',
} as const;

/**
 * The row carrying a given visible label, inside the form's own containers.
 *
 * Scoped to the containers for the measurement given above, under the same
 * measurement as the destination form's copy of this function: a page-wide lookup
 * matches the form's row and the hidden Info dialog's homonymous one.
 */
function labelledRow(page: Page, label: string): Locator {
  return page
    .locator(ISSUER_FORM_SELECTORS.formFieldContainers.join(', '))
    .locator(ISSUER_FORM_SELECTORS.row)
    .filter({ has: page.getByText(label, { exact: true }) });
}

/**
 * Fields of a form-encoded request, read as the server reads them.
 *
 * Duplicated from the destination form's page object, and consciously: this page
 * object checks the request its own click sends, so it needs the reading and would
 * otherwise have to reach into the other page object for it. If the portal changes
 * what a request body looks like, the fix is made in both.
 */
function postedFields(request: Request): URLSearchParams {
  return new URLSearchParams(request.postData() ?? '');
}

/**
 * Tells the request that registers the export from the screen's other requests.
 *
 * Same measurement as the destination form's, re-declared here for the reason
 * {@link postedFields} gives: the button's request re-renders the scheduled exports
 * table and no other request on the screen does, while the value change that chooses
 * the inscription re-renders the form and carries the table only as a filter
 * parameter.
 */
function isExportRegistrationRequest(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    (postedFields(request).get(JSF_PARTIAL_RENDER_FIELD) ?? '').includes(SCHEDULED_EXPORTS_TABLE_ID)
  );
}

/**
 * Public contract of the issuer form of the NF-e export screen.
 *
 * Consumers depend on this contract rather than on the page object implementation,
 * so the object can be swapped without touching them.
 *
 * What it declares is deliberately uneven: four operations are this page object's
 * own — the role, the guard against what it does not know, the choices of the file
 * and the click that registers it — and the other seven are delegated to the
 * contributor form's contract, because they are the same seven for both roles (same
 * screen, same panel, same table, same period) and writing them twice would duplicate
 * what does not diverge.
 */
export interface SiatWebNfeIssuerFormPageContract {
  /**
   * Marks the issuer role and confirms the form it opens.
   *
   * The role is what makes the export form exist at all; which notes the file brings
   * is a fiscal parameter, and that is
   * {@link SiatWebNfeIssuerFormPageContract.applyAuthorisedNoteChoices}.
   *
   * Fails with a named control when the role radio is not on the screen: a screen
   * without it cannot open the export form at all, and the report has to say that
   * rather than show an assertion against a locator nobody picked.
   */
  chooseIssuerRole(): Promise<void>;

  /**
   * Confirms the form is open and usable, before anything is filled in.
   *
   * Delegated: the proof is the form's own controls turning up, which is the same
   * claim for both roles.
   *
   * @param timeoutMs bound on the form being served after the role is marked.
   */
  expectUsable(timeoutMs?: number): Promise<void>;

  /**
   * Fails, before any export is scheduled, when the form carries a choice this flow
   * does not know or asks for a field it was not authorised to fill.
   *
   * The known set is {@link MEASURED_ISSUER_CHOICE_NAMES} — this flow's own reading
   * of this form — and never the other flow's: two flows validating each other's
   * screen would be one measurement standing in for two that are allowed to disagree.
   */
  expectNothingUnauthorisedAsked(): Promise<void>;

  /**
   * Marks, in each note choice group, the choice the person authorised, and confirms
   * each group kept it.
   *
   * Stated rather than inherited, which is the whole point: this form arrives with
   * `Tipo de nota` = Todas and `Status da Nota` = Ativas, and an export of a
   * different set of notes is not the export that was authorised.
   *
   * Called **after** the inscription is selected, because that selection is the last
   * thing in the item that re-renders the form (measured in spike 06 and again in
   * spike 07): marking after it puts the choices on the version of the form that will
   * be submitted. Marking fires no postback of its own, so there is nothing to wait
   * for, and {@link SiatWebNfeIssuerFormPageContract.scheduleExport} checks the values
   * on the request that goes out.
   */
  applyAuthorisedNoteChoices(): Promise<void>;

  /**
   * Fails when the form does not offer the inscription.
   *
   * @param reference how the export is named in the failure, never the value.
   */
  expectInscriptionOffered(inscription: string, reference: ScheduledExportReference): Promise<void>;

  /**
   * Selects the inscription by its number and returns when the form that selection
   * re-renders is in place.
   */
  selectInscription(inscription: string): Promise<void>;

  /** Fails when the form did not take the inscription that was selected. */
  expectInscriptionSelected(inscription: string): Promise<void>;

  /** Fills both emission date fields with the configured period. */
  fillEmissionPeriod(start: string, end: string): Promise<void>;

  /**
   * Confirms the form kept the period, and writes it again when the form was served
   * again after it was first written.
   *
   * @param onFormRerendered invoked once, when a re-render emptied the period, so
   * that the flow can record the write that follows.
   */
  expectEmissionPeriodKept(
    start: string,
    end: string,
    onFormRerendered: () => Promise<void>,
  ): Promise<void>;

  /**
   * Registers the export request, exactly once, and confirms the period and the note
   * choices left the browser in the same reading.
   *
   * Both are compared against the request that went out and not against the form:
   * the form can be re-rendered between the check that read it and the click that
   * submits it, and only the request says what the destination system received.
   *
   * @param reference how the export is named in the failure, taken because a request
   * that went out wrong is the one failure here that nothing downstream would
   * notice, and a report that does not say which item it was cannot act on it.
   */
  scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;

  /**
   * How many rows of the scheduled exports table carry the inscription, decided
   * inside the delegated page object.
   */
  countScheduledRowsFor(inscription: string): Promise<number>;
}

/**
 * The issuer form of the "Consultar/Exportar NF-e" screen.
 *
 * The same screen the contributor form page object models, addressed for the role
 * this flow schedules under. The boundary between the two is the point of the class:
 * the four operations whose knowledge belongs to this flow — which role, which
 * choices, what it refuses, and the click — are here, and the seven that are the
 * same for both roles are delegated to a contributor form contract injected by the
 * factory, which is the only place a page object is ever constructed.
 *
 * Delegation by composition, not inheritance: this class implements its own contract
 * and holds the other page object through its contract, so neither page object
 * depends on the other's implementation and neither can be swapped without the other
 * noticing.
 */
export class SiatWebNfeIssuerFormPage implements SiatWebNfeIssuerFormPageContract {
  constructor(
    private readonly page: Page,
    private readonly contributorForm: SiatWebNfeContributorFormPageContract,
  ) {}

  async chooseIssuerRole(): Promise<void> {
    // The role radios are served with the arrival state, so this is a shape check
    // taken before anything is marked — and, when the screen arrived without them, a
    // `MissingExportControlError` naming the control, which is a screen that cannot
    // open the export form at all rather than an assertion against a locator nobody
    // picked. The wait inside is web-first for the same reason every other wait here
    // is: a screen served by a postback turns its controls up a moment late.
    await expectScreenControlsServed(
      this.page,
      ISSUER_ROLE_CONTROLS,
      undefined,
      ISSUER_ROLE_POLL_MESSAGE,
    );

    // By role and accessible name with exact matching: the radio's own `<label for>`
    // provides the name (measured), so the role also proves what is being marked is
    // a radio rather than some other control that happens to read the same.
    await this.page.getByRole('radio', { name: ISSUER_ROLE_NAME, exact: true }).check();

    // Marking the role is a postback and the form is served by it. Polling the
    // form's own controls is the observable post-condition: there is no instant at
    // which "the role is marked" and "the form is there" may be assumed together.
    await this.expectUsable();
  }

  async expectUsable(timeoutMs?: number): Promise<void> {
    await this.contributorForm.expectUsable(timeoutMs);
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
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      await this.markChoice(group);
    }
  }

  async expectInscriptionOffered(
    inscription: string,
    reference: ScheduledExportReference,
  ): Promise<void> {
    await this.contributorForm.expectInscriptionOffered(inscription, reference);
  }

  async selectInscription(inscription: string): Promise<void> {
    await this.contributorForm.selectInscription(inscription);
  }

  async expectInscriptionSelected(inscription: string): Promise<void> {
    await this.contributorForm.expectInscriptionSelected(inscription);
  }

  async fillEmissionPeriod(start: string, end: string): Promise<void> {
    await this.contributorForm.fillEmissionPeriod(start, end);
  }

  async expectEmissionPeriodKept(
    start: string,
    end: string,
    onFormRerendered: () => Promise<void>,
  ): Promise<void> {
    await this.contributorForm.expectEmissionPeriodKept(start, end, onFormRerendered);
  }

  async scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void> {
    // Once, and only once: every click on this button is a real request in the
    // destination system, so there is no retry and no "just in case" here.
    //
    // Armed before the click, so the request cannot be missed, and read afterwards
    // against the configured period and the note choices this flow marked. Both
    // readings belong here rather than to the delegated page object because they
    // compare against *this* flow's statements — a period the form held and the
    // request did not carry is a real export registered for no period at all, and a
    // request that does not carry the authorised choices is a real export of notes
    // nobody asked for; they are the two failures here that nothing downstream would
    // notice.
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

    const diverged = findDivergedIssuerNoteChoiceGroup(fields);
    if (diverged !== null) {
      throw new ExportRequestWithUnauthorisedNoteChoiceError(
        reference,
        diverged.rowLabel,
        diverged.authorised,
      );
    }
  }

  async countScheduledRowsFor(inscription: string): Promise<number> {
    return await this.contributorForm.countScheduledRowsFor(inscription);
  }

  /**
   * Marks one group's authorised choice and confirms the group kept it.
   *
   * The group is found by its row label because `Todas` is an option of **both**
   * groups (measured), so a lookup by the option's name could not tell them apart;
   * and the label sits in an **outer** row of the group, not in the row the radios
   * are in (measured, cell by cell, in spike 07) — so the row this finds is the one
   * that contains the radios as descendants, while the row they sit in carries only
   * the options and would have lost the label.
   *
   * The group's options are read before the marking, because "the screen does not
   * offer this choice any more" and "the marking did not stick" are different
   * failures that happen to deserve the same typed error, and the first is a portal
   * that changed while the second is a screen that did what it was asked.
   *
   * Marking is a click and nothing after it: no group carries an `onchange`, an AJAX
   * behaviour or a value-change marker (measured), so there is no postback to await
   * and no re-render to survive — the reading right below is the whole post-condition.
   */
  private async markChoice(group: IssuerNoteChoiceGroup): Promise<void> {
    const row = labelledRow(this.page, group.rowLabel);
    // Web-first with a bound of its own: the form arrives on a postback, so the row
    // can be absent for a moment after the role is marked, and a count read straight
    // away would report that as a form that never rendered it.
    await expect(row).toHaveCount(1, { timeout: FORM_CONTROLS_TIMEOUT_MS });

    const offered = await this.radioChoiceNames(row.getByRole('radio'));
    if (!offersAuthorisedIssuerChoice(group, offered)) {
      throw new UnexpectedFormChoiceError(
        ISSUER_NOTE_CHOICE_FAILURE.notOffered,
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
      throw new UnexpectedFormChoiceError(
        ISSUER_NOTE_CHOICE_FAILURE.notMarked,
        group,
        marked.join(', '),
      );
    }
  }

  /**
   * Radio labels the flow does not know, each listed once however often it appears.
   *
   * The page reads the names and the module compares them: which names exist is the
   * portal's answer, and which of them this flow recognises is this table's.
   */
  private async unknownChoiceNames(): Promise<string[]> {
    return findUnknownIssuerChoiceNames(
      await this.radioChoiceNames(this.page.getByRole('radio')),
      MEASURED_ISSUER_CHOICE_NAMES,
    );
  }

  /**
   * Server ids of the form fields the screen marks as required.
   *
   * This form carries no required marker anywhere (spike 07), so any hit is a field
   * the flow was not authorised to fill, and filling it — or not filling it — would
   * be a decision about a fiscal parameter that is not the automation's to make. Ids
   * are reported, not values: an id is a name the server invented, while the field's
   * value would be fiscal data.
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
