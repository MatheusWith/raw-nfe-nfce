/**
 * The two choice groups that decide which notes the exported **NFC-e** file brings, as
 * measured on the form the "Consultar/Exportar NFC-e" screen serves.
 *
 * Pure data and two pure readings of a request, apart from the browser on purpose. This
 * is a third table of the same shape as the destination flow's and the issuer flow's,
 * and a third copy rather than a share of either — and the reason is that this is a
 * measurement of a **different screen**, on a different menu branch, with its own form
 * (`consultarNFCeForm`) and its own field values. One constant shared by the three flows
 * would be a single snapshot standing in for three that are allowed to disagree. If the
 * portal changes the form of one branch and not of the others, each flow fails where it
 * competes, instead of one flow marking an option the others validated. Neither module
 * imports a group, an option or a value from another.
 *
 * Measured in spike 08, in the form the portal serves for `Contribuinte como Emitente`
 * on the NFC-e screen:
 *
 * - Both groups arrive marked with the screen's own defaults — `Tipo de nota` =
 *   Saída, `Status da NFC-e` = Ativas. Those were never the flow's choice, and an
 *   export of a different set of notes is not the export the person authorised. The
 *   NFC-e screen arrives on Saída where the NF-e screen arrives on Todas, so one of the
 *   two choices happens to be the default here — and stating it is what keeps a portal
 *   that changes the default from quietly narrowing the file.
 * - Neither group carries `onchange`, an AJAX behaviour or a value-change marker, so
 *   marking one is a client-side action that fires no postback. The value reaches the
 *   server in the scheduling request, in the field named here.
 * - **No option is shared between the two groups.** `Todas` exists only in
 *   `Status da NFC-e`, where the NF-e form carries it in both groups. That is the
 *   measurement that makes this module's documentation different from the others': the
 *   row label still tells the groups apart, but it is no longer the only thing that
 *   can — and the row label is kept because it is what the request is compared against.
 * - The values are **renumbered** relative to the NF-e form: `Saída` posts `1` here
 *   and `2` on the NF-e screen, `Todas` in status posts `2` here and `2` on the NF-e
 *   status group while the NF-e type group's `Todas` posts `0`. A value borrowed from
 *   the other table would compare the request against the wrong option, which is the
 *   failure that has no visible symptom.
 *
 * The person authorised the **emitted and cancelled** notes: `Tipo de nota` =
 * Saída, `Status da NFC-e` = Canceladas. The consequence is not the same in the two
 * groups. In `Tipo de nota` the screen already arrives on Saída, so the flow states a
 * choice that happens to be the default — and that is the whole difference this design
 * exists to make. In `Status da NFC-e` the flow turns the screen's default (Ativas)
 * into the cancelled ones only, so the file narrows to the cancelled notes of the
 * period rather than the active ones.
 *
 * The role radio is **not** here, and that is a decision rather than an omission: the
 * role is not a fiscal parameter, it is what makes the export form exist at all, and
 * the flow states it by marking the screen instead of by declaring it as a choice of
 * the file. The NFC-e screen arrives with `Contribuinte como Emitente` already marked,
 * which is measured and is a fact about the arrival rather than a choice of the file.
 */

/** One option of a choice group, as the person reads it and as the portal posts it. */
export interface NfceNoteChoiceOption {
  /** Accessible name, read from the radio's own `<label for>`. */
  readonly name: string;
  /** What the portal posts for this radio. */
  readonly value: string;
}

/** One choice group of the NFC-e export form. */
export interface NfceNoteChoiceGroup {
  /**
   * Visible label of the row the group sits in, with its colon.
   *
   * What tells the two groups apart, and it has to be the label: the request is
   * compared against the group's own field, and this is the name the report quotes
   * when a group diverges. Read from the outer row of the group in spike 08 — the row
   * the radios sit in carries only the options, so a reading that stopped there would
   * have missed the label.
   */
  readonly rowLabel: string;
  /** Name the field carries in the scheduling request. */
  readonly field: string;
  /** The option the flow marks. */
  readonly authorised: string;
  /** Every option the screen offers, in the order it lists them. */
  readonly options: readonly NfceNoteChoiceOption[];
}

/**
 * The groups, with every option and the value each one posts.
 *
 * The whole option list travels, and not only the authorised name, for two reasons: an
 * option that is missing is a screen that stopped offering what the flow states, and a
 * value that changes is a portal that renumbered its choices — both are failures worth
 * naming rather than a name that quietly stops meaning anything.
 */
export const NFCE_NOTE_CHOICE_GROUPS = [
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
    authorised: 'Canceladas',
    options: [
      { name: 'Ativas', value: '1' },
      { name: 'Canceladas', value: '0' },
      { name: 'Todas', value: '2' },
    ],
  },
] as const satisfies readonly NfceNoteChoiceGroup[];

/**
 * Why the flow refused to mark a group, when it refused.
 *
 * **One reason and not the two the NF-e flows carry**, and that is the shape of this
 * screen rather than a shortcut. The NF-e forms tell "the group stopped offering the
 * choice" from "the marking did not stick" by reading back what the group kept with a
 * typed comparison, and a marking that did not stick is a failure this automation owns.
 * Here the read-back is Playwright's own `toBeChecked()` (measured: no group fires a
 * postback, so there is nothing to re-render and wait for), and that assertion fails
 * under its own name with the group's row and the choice in its locator — a second
 * reason carried here would never be reached, and a reason nobody can reach is a reason
 * nobody can trust.
 *
 * The value is declared here rather than imported from the destination flow so that
 * this module answers for its own failures without reading the other flow's table, and
 * it is the *same* word on purpose: the error class this flow throws compares against
 * the destination's pair, so a value that drifted apart here would silently send this
 * flow's refusal down the other branch of the message — and that is exactly what the
 * unit test of this module proves cannot happen.
 */
export const NFCE_NOTE_CHOICE_FAILURE = {
  /** The group's row no longer offers the choice the flow states for it. */
  notOffered: 'not-offered',
} as const;

export type NfceNoteChoiceFailure =
  (typeof NFCE_NOTE_CHOICE_FAILURE)[keyof typeof NFCE_NOTE_CHOICE_FAILURE];

/**
 * Whether the group's row still offers the choice the flow states for it.
 *
 * The **authorised name only**, and the limit of that is worth stating: an option the
 * portal removed is caught here, as a refusal, and an option it added is caught by the
 * unknown-name guard, which reads the whole list — but a group that quietly dropped some
 * *other* option is seen by neither, and this function cannot see it. The flow states one
 * choice per group and needs that one, so the check is the one it can honestly make.
 */
export function offersAuthorisedNfceChoice(
  group: NfceNoteChoiceGroup,
  offeredNames: readonly string[],
): boolean {
  return offeredNames.includes(group.authorised);
}

/**
 * Radio labels the flow does not know, each listed once however often it appears.
 *
 * An option the portal added, and a group the portal added whole, arrive the same way:
 * as names the caller has never heard of. Both are refused rather than ignored, because
 * choosing which notes the exported file brings is not the automation's decision to
 * make — and an option the flow does not know is also an option whose value it could
 * not compare the request against.
 *
 * Which names are known is the caller's answer, not this module's: the form carries
 * radios that are not choice groups at all — the two roles do — so the comparison
 * takes the list it is to judge against rather than deciding what that list is.
 *
 * A **multiset** comparison, and it is needed even though no option of these two groups
 * is shared: the roles and the groups are all read from the same `getByRole('radio')`,
 * so a name served *more* often than the table lists it is one radio the flow does not
 * know, which is what a group added by the portal looks like. Comparing distinct names
 * would let a duplicate through.
 *
 * @param servedNames labels the screen carries, read from the radios' own labels.
 * @param knownNames labels the flow recognises, which is the whole set on the form.
 */
export function findUnknownNfceChoiceNames(
  servedNames: readonly string[],
  knownNames: readonly string[],
): string[] {
  const unmatched = [...knownNames];
  const unknown = new Set<string>();

  for (const name of servedNames) {
    const position = unmatched.indexOf(name);
    if (position === -1) {
      unknown.add(name);
      continue;
    }
    unmatched.splice(position, 1);
  }

  return [...unknown];
}

/**
 * The group whose posted choice is not the one the flow marked, if there is one.
 *
 * Read against the request rather than against the form, because the form can be
 * re-rendered between the reading that filled it and the click that submits it, and
 * only the request says what the destination system received.
 *
 * A field that is absent, and a value that is not one of the measured options, both
 * diverge — and they diverge for the same reason: the flow cannot show that what went
 * out is the note set the person authorised, which is all this reading has to decide.
 * The first group that diverges is the one returned, so the report names one choice
 * rather than a list of them.
 *
 * @param groups the table to compare the request against, defaulting to this flow's
 * own. The parameter exists because the NFC-e page object models **one screen used by
 * two flows**, and its registration step validates whichever table the calling flow
 * handed it — this flow passes nothing and keeps reading its own table, while the
 * every-status flow passes `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS`. The reading itself is
 * one comparison over a shape, so it is written once here instead of once per flow;
 * what each flow owns is its table, which is declared in its own module. Callers that
 * omit the parameter — including this flow's own unit battery — behave exactly as
 * before the parameter existed.
 */
export function findDivergedNfceNoteChoiceGroup(
  fields: URLSearchParams,
  groups: readonly NfceNoteChoiceGroup[] = NFCE_NOTE_CHOICE_GROUPS,
): NfceNoteChoiceGroup | null {
  const diverged = groups.find((group) => {
    const authorised = group.options.find((option) => option.name === group.authorised);
    return fields.get(group.field) !== authorised?.value;
  });

  return diverged ?? null;
}
