/**
 * The two choice groups that decide which notes the exported **NFC-e, every status**
 * file brings, on the same form the "Consultar/Exportar NFC-e" screen serves.
 *
 * A fourth table of the same shape as the three that already exist, and a data-only
 * one: no function and no refusal word is declared here, and both facts are decisions
 * rather than omissions (see the end of this note).
 *
 * **One screen, one measurement, two declarations.** This flow and the `Canceladas`
 * flow (`nfce-export-issuer-note-choices.ts`) work the same screen, measured once in
 * spike 08 — same row labels, same fields, same options, same posted values. The two
 * tables therefore describe the *same* measurement, and the unit test of this module
 * pins them equal on exactly those fields, so the second declaration cannot drift away
 * from the first or from the portal without a red that needs no portal to be seen.
 * What differs, and the only thing, is what each flow **authorises** — and that is per
 * flow, not per screen: the knowledge that separates the flows lives in their tables,
 * while the logic that reads any table lives parameterised, in the page object they
 * both talk to. This is the same-screen extension of the rule ADR 0010 and ADR 0011
 * state for two screens: a flow states its own choices instead of inheriting them.
 *
 * The person authorised the file of **every status**: `Tipo de nota` = Saída,
 * `Status da NFC-e` = `Todas`. The two consequences are not the same:
 *
 * - In `Tipo de nota` the screen already arrives on Saída (measured in spike 08), so
 *   the flow states a choice that happens to be the default — and stating it is what
 *   keeps a portal that changes the default from quietly narrowing the file. The
 *   `Canceladas` flow states the same group; here the two flows agree.
 * - In `Status da NFC-e` the flow turns the screen's default (Ativas) into **all**
 *   statuses, widening the file past cancelled, and it is the group where this flow
 *   diverges from its sibling: the `Canceladas` flow posts `0` here, this one posts
 *   `2`. A table borrowed from that flow would narrow the file to the cancelled notes
 *   — the failure that has no visible symptom, because the request goes out fine and
 *   only the file says otherwise.
 *
 * Measured facts this table repeats from spike 08, on purpose, as this flow's own
 * declaration of them:
 *
 * - Neither group carries `onchange`, an AJAX behaviour or a value-change marker, so
 *   marking one is a client-side action that fires no postback; the value reaches the
 *   server in the scheduling request, in the field named here.
 * - **No option is shared between the two groups.** `Todas` exists only in
 *   `Status da NFC-e`, so the row label — not the option name — tells the groups apart,
 *   and it is the label the request comparison quotes.
 * - The values are **renumbered** relative to the NF-e form: `Saída` posts `1` here
 *   and `2` on the NF-e type group. A value borrowed from another table would compare
 *   the request against the wrong option.
 *
 * The role radio is **not** here, for the same reason it is absent from every sibling
 * table: the role is not a fiscal parameter, it is what makes the export form exist,
 * and this screen arrives with `Contribuinte como Emitente` already marked (measured).
 *
 * **Why data only.** Marking a group and reading a request are done by the shared NFC-e
 * page object, whose methods now take the groups as a parameter — the shape the two
 * flows of this screen agreed on, so that one page models one screen and each flow
 * hands it its own table. A refusal word declared here would be a value nothing reads:
 * the marking quotes `NFCE_NOTE_CHOICE_FAILURE` from the sibling module, and the two
 * words are the same `'not-offered'` on purpose, because the error class picks its
 * message by comparing against that pair. The unit test pins the word the error class
 * actually receives, against this flow's group, so the branch cannot rot either.
 */

/** One option of a choice group, as the person reads it and as the portal posts it. */
export interface AllStatusNfceNoteChoiceOption {
  /** Accessible name, read from the radio's own `<label for>`. */
  readonly name: string;
  /** What the portal posts for this radio. */
  readonly value: string;
}

/** One choice group of the NFC-e export form, as this flow states it. */
export interface AllStatusNfceNoteChoiceGroup {
  /**
   * Visible label of the row the group sits in, with its colon.
   *
   * What tells the two groups apart, and what the refusal and the divergence report
   * quote. Read from the outer row of the group in spike 08 — the row the radios sit
   * in carries only the options, so a reading that stopped there would have missed
   * the label.
   */
  readonly rowLabel: string;
  /** Name the field carries in the scheduling request. */
  readonly field: string;
  /** The option the flow marks. */
  readonly authorised: string;
  /** Every option the screen offers, in the order it lists them. */
  readonly options: readonly AllStatusNfceNoteChoiceOption[];
}

/**
 * The groups, with every option and the value each one posts.
 *
 * The whole option list travels, and not only the authorised name, for the reason the
 * siblings give and one of this flow's own: an option that is missing is a screen that
 * stopped offering what the flow states, and a value that changes is a portal that
 * renumbered its choices — and this flow's posted values (`Saída` = `1`, `Todas` =
 * `2`) are checked against **this** list, never against a sibling's.
 */
export const NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS = [
  {
    rowLabel: 'Tipo de nota:',
    field: 'tipoDeNota',
    authorised: 'Saída',
    options: [
      { name: 'Entrada', value: '0' },
      { name: 'Saída', value: '1' },
    ],
  },
  {
    rowLabel: 'Status da NFC-e:',
    field: 'statusNota',
    authorised: 'Todas',
    options: [
      { name: 'Ativas', value: '1' },
      { name: 'Canceladas', value: '0' },
      { name: 'Todas', value: '2' },
    ],
  },
] as const satisfies readonly AllStatusNfceNoteChoiceGroup[];
