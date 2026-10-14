/**
 * Failures raised while reaching and opening the "Consultar/Exportar NF-e"
 * screen of the SIATWeb system.
 *
 * The family lives in its own module, apart from the certificate login and from
 * the legacy traversal, so a red test tells a screen that came out wrong from a
 * lost session or a portal problem. Inside the family there is no base class:
 * what a report shows is the class name and its message, so the name is what
 * carries the stage that failed, and a base under it would only be a category
 * nothing reads.
 */

import {
  type ExportNoteChoiceGroup,
  NOTE_CHOICE_FAILURE,
  type NoteChoiceFailure,
} from './nfe-export-note-choices';

/**
 * The screen arrived without a control the flow needs.
 *
 * Names the controls that were not found, and no others: a screen that renders
 * only part of the form is a different failure from one that renders none of
 * it, and the list is what tells them apart. Raised before the screen is
 * touched, so a control that never rendered is never reported as a control
 * that could not be actuated.
 */
export class MissingExportControlError extends Error {
  constructor(
    /** Human-readable name of each control that was not on the screen. */
    readonly missingControls: readonly string[],
    cause?: unknown,
  ) {
    super(
      `The NF-e export screen opened without controls the flow requires: ` +
        `${missingControls.join(', ')}. The screen arrived in a shape the flow ` +
        `does not know how to use.`,
      { cause },
    );
    this.name = 'MissingExportControlError';
  }
}

/**
 * How a scheduled export is referred to in a failure.
 *
 * A tax inscription and an emission period are fiscal data of a real company, and
 * the AGENTS.md forbids writing them into error messages and logs — which is
 * exactly where a Playwright report puts whatever a failed assertion carries.
 * The position in the configured list is what the person configured and can map
 * back to their own value, and it identifies the export as precisely as the value
 * would, without the value ever leaving the browser.
 */
export interface ScheduledExportReference {
  /**
   * 1-based position in the list configured in E2E_NFE_EXPORT_INSCRIPTIONS, as
   * text: it exists to be quoted in a message, not to be computed with.
   */
  readonly position: string;
}

/**
 * The form does not offer the inscription that was configured.
 *
 * Carries only the count of options the form has, which is a shape and not a
 * company identifier: the names and the numbers behind them stay in the browser.
 */
export class InscriptionNotOfferedError extends Error {
  constructor(
    reference: ScheduledExportReference,
    /** How many inscriptions the form offers. */
    readonly offeredCount: number,
  ) {
    super(
      `The NF-e export form offers ${String(offeredCount)} inscriptions, and none ` +
        `of them is the one at position ${reference.position} of ` +
        `E2E_NFE_EXPORT_INSCRIPTIONS. The value itself is not shown here: it is ` +
        `fiscal data of a real company, and the report is not the place for it.`,
    );
    this.name = 'InscriptionNotOfferedError';
  }
}

/**
 * A choice group did not end up marked with the choice the flow states.
 *
 * "Tipo de nota" and "Status da Nota" decide which notes the exported file brings, and
 * the person authorised `Todas` in both — so the flow marks them itself and then reads
 * back what the group kept. Either the row no longer offers the stated choice, or the
 * marking did not stick, and an export of a set of notes nobody authorised is what
 * either of them would schedule.
 *
 * One class for both, because both are the same typed outcome: a choice that could not
 * be marked. Reused rather than added — the error already said a choice group was not as
 * expected, and this is that same failure now that the flow states the choice instead of
 * waiting for the screen to arrive with it.
 *
 * Two messages, and a `failure` that says which, because the two are not the same thing
 * to whoever has to answer for the run: a group that stopped offering the stated choice
 * is a change on the portal's side, and a marking that did not stick is this
 * automation's. The reason travels with the error so the report can be read without
 * inferring the cause from the wording.
 */
export class UnexpectedFormChoiceError extends Error {
  constructor(
    /** Which of the two failures the group turned out to be. */
    readonly failure: NoteChoiceFailure,
    /** The group the flow was stating a choice for. */
    readonly group: Pick<ExportNoteChoiceGroup, 'rowLabel' | 'authorised'>,
    /** What the group offers at all, or what it has marked. */
    readonly actualChoice: string,
  ) {
    super(
      failure === NOTE_CHOICE_FAILURE.notOffered
        ? `The NF-e export form does not offer "${group.authorised}" on ` +
            `"${group.rowLabel}" — it offers "${actualChoice}". A group that stopped ` +
            `offering the stated choice is a change on the portal's side, so nothing ` +
            `was scheduled.`
        : `The NF-e export form has "${actualChoice}" marked on "${group.rowLabel}" ` +
            `after the flow marked "${group.authorised}". The marking did not stick, ` +
            `so the export would cover a different set of notes than the one ` +
            `authorised, and nothing was scheduled.`,
    );
    this.name = 'UnexpectedFormChoiceError';
  }
}

/**
 * The form carries a choice the flow does not know.
 *
 * Choosing a fiscal parameter is the person's decision and not the automation's,
 * so a choice that is not one of the measured ones stops the run before the first
 * export instead of being left at whatever the screen happens to mark.
 */
export class UnknownFormChoiceError extends Error {
  constructor(
    /** Labels of the choices that are not part of the measured form. */
    readonly unknownChoices: readonly string[],
  ) {
    super(
      `The NF-e export form carries choices the flow does not know: ` +
        `${unknownChoices.join(', ')}. Choosing a fiscal parameter is the ` +
        `person's decision, so nothing was scheduled.`,
    );
    this.name = 'UnknownFormChoiceError';
  }
}

/**
 * The form asks for a field the flow is not authorised to fill.
 *
 * The measured form carries no required marker at all (spike 06), so a field that
 * suddenly is one is a field the portal added, and filling it or leaving it empty
 * would both be a decision about a fiscal parameter. The run stops before the first
 * export instead, naming the server ids it found — ids are names the server
 * invented, while a field's value would be fiscal data.
 */
export class UnknownRequiredFieldError extends Error {
  constructor(
    /** Server ids of the fields the screen marks as required. */
    readonly requiredFieldIds: readonly string[],
  ) {
    super(
      `The NF-e export form marks fields as required that the measured form does ` +
        `not have: ${requiredFieldIds.join(', ')}. Filling them, or not filling ` +
        `them, would be a decision about a fiscal parameter, so nothing was ` +
        `scheduled.`,
    );
    this.name = 'UnknownRequiredFieldError';
  }
}

/**
 * The portal answered with its own internal error screen.
 *
 * Measured after the scheduling actions of a full cycle: the reload that revisits
 * the export screen came back on `views/comum/erro.xhtml`, carrying the portal's own
 * message — "Ocorreu um erro interno e sua operação foi cancelada" — over a
 * database failure on its side (`ORA-01924`, a sequence that does not exist or is
 * not granted). The screen has no menu and no form, so a flow that kept walking it
 * would report a control that is not there instead of a portal that refused.
 *
 * Named for that reason. Nothing here retries: the failure is the portal's, and
 * whether the request behind it was registered is exactly what the report cannot
 * answer — the cycle's row-count proof is what answers it, and only if the cycle
 * gets as far as its closing visit.
 */
export class PortalInternalErrorScreenError extends Error {
  constructor(
    /** Route the portal answered on, as it names itself in the address bar. */
    readonly route: string,
    cause?: unknown,
  ) {
    super(
      `The portal answered with its internal error screen at ${route}, which carries ` +
        `no menu and no export form. The failure is on the portal's side and this ` +
        `flow does not retry it: whether the export request was registered is not ` +
        `answerable from here.`,
      { cause },
    );
    this.name = 'PortalInternalErrorScreenError';
  }
}

/**
 * The export request went out without the configured period.
 *
 * Measured in two executions of the cycle: the request the scheduling button sent
 * carried both emission fields empty, once right after the first click of a run and
 * once between two others. The cause is a race and not a portal defect — choosing the
 * inscription fires a postback that re-renders the whole form and empties the period,
 * and in the failing items that re-render landed between the check that read the
 * fields and the click that submitted them, so the check saw the period and the
 * request did not carry it.
 *
 * What this error buys is that such a request is never silent. It cannot undo what was
 * sent: the export is registered in the destination system, and the row it produced has
 * to be discarded there. What it does is name the item, so the person reading the
 * report learns that an export covering no period at all was registered.
 *
 * The period is not echoed, for the same reason the field-value error does not echo it:
 * it is real fiscal data.
 */
export class ExportRequestWithoutPeriodError extends Error {
  constructor(reference: ScheduledExportReference, cause?: unknown) {
    super(
      `The export request for the inscription at position ${reference.position} of ` +
        `E2E_NFE_EXPORT_INSCRIPTIONS went out with an empty emission period, so the ` +
        `export that was registered covers no period at all. The request cannot be ` +
        `withdrawn from here: the row has to be discarded in the destination system.`,
      { cause },
    );
    this.name = 'ExportRequestWithoutPeriodError';
  }
}

/**
 * The request registered an export of a note set nobody authorised.
 *
 * The flow marks the note choices on the form and reads back what the group kept, and
 * then — separately, because a form can be re-rendered between the reading that filled
 * it and the click that submits it — checks the request that actually went out. This
 * is that second check failing, and it is the only failure here that nobody downstream
 * would notice: the row appears, the portal answers 200, and the file that comes out
 * later covers a set of notes that was never the one authorised.
 *
 * Carries the group's label and the choice the flow states, and not what the request
 * carried: the posted value is a fiscal parameter of a real export, and the report is
 * not the place for it.
 */
export class ExportRequestWithUnauthorisedNoteChoiceError extends Error {
  constructor(
    reference: ScheduledExportReference,
    /** Label of the choice group, as the screen shows it. */
    readonly choiceName: string,
    /** The choice the flow marked on the form. */
    readonly authorisedChoice: string,
  ) {
    super(
      `The export request for the inscription at position ${reference.position} of ` +
        `E2E_NFE_EXPORT_INSCRIPTIONS went out without "${authorisedChoice}" marked ` +
        `on "${choiceName}", so what was registered may cover a different set of ` +
        `notes than the one authorised.`,
    );
    this.name = 'ExportRequestWithUnauthorisedNoteChoiceError';
  }
}

/**
 * A field did not keep the value that was typed into it.
 *
 * The emission fields carry a datepicker, and a mask that rewrote what was typed
 * would otherwise only be noticed after the submission. The value is not echoed:
 * the period is real fiscal data, and the person configured it.
 */
export class RejectedFieldValueError extends Error {
  constructor(
    /** Label of the field, as the screen shows it. */
    readonly fieldName: string,
    /** The wait that gave up, kept so the report can name what it was waiting for. */
    cause?: unknown,
  ) {
    super(
      `The NF-e export form did not keep the value typed into "${fieldName}". ` +
        `A field that rewrites what is typed into it would schedule a period ` +
        `other than the configured one, so nothing was scheduled.`,
      { cause },
    );
    this.name = 'RejectedFieldValueError';
  }
}

/**
 * The scheduled export of an inscription is absent from the table.
 *
 * Raised only after the screen has been revisited, because the scheduling button
 * answers without refreshing and the new row exists only on the next load
 * (measured in spike 06). Naming the position and not the inscription keeps the
 * report free of fiscal data.
 *
 * Carries the counts it was waiting on, because "no row" and "the row was already
 * there before this run" are different failures and only the counts tell them
 * apart.
 */
export class MissingScheduledExportError extends Error {
  constructor(
    reference: ScheduledExportReference,
    /** Rows the table had to reach for the wait to be satisfied. */
    readonly requiredRowCount: number,
    /** Rows the table actually carries for this inscription. */
    readonly observedRowCount: number,
    cause?: unknown,
  ) {
    super(
      `The scheduled exports table has ${String(observedRowCount)} rows for the ` +
        `inscription at position ${reference.position} of ` +
        `E2E_NFE_EXPORT_INSCRIPTIONS, after the screen was revisited, and ` +
        `${String(requiredRowCount)} were required. The export was not registered ` +
        `by this run, or the rows do not carry that inscription.`,
      { cause },
    );
    this.name = 'MissingScheduledExportError';
  }
}
