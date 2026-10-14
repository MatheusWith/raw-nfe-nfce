/**
 * The two choice groups that decide which notes the exported file brings **for the
 * issuer role**, as measured on the form the screen serves for it.
 *
 * Pure data and two pure readings of a request, apart from the browser on purpose —
 * the same shape the destination flow keeps its own table in, and a second copy of it
 * on purpose: this is a measurement of a **different screen**, and one constant shared
 * by the two flows would be a single snapshot standing in for two that are allowed to
 * disagree. If the portal changes the form of one role and not of the other, the two
 * tables diverge and each flow fails where it competes, instead of one flow marking an
 * option the other validated. Neither module imports a group, an option or a value
 * from the other.
 *
 * Measured in spike 07, in the form the portal serves for `Contribuinte como
 * Emitente`:
 *
 * - Both groups arrive marked with the screen's own defaults — `Tipo de nota` =
 *   Todas, `Status da Nota` = Ativas. Those were never the flow's choice, and an
 *   export of a different set of notes is not the export the person authorised.
 * - Neither group carries `onchange`, an AJAX behaviour or a value-change marker, so
 *   marking one is a client-side action that fires no postback. The value reaches the
 *   server in the scheduling request, in the field named here.
 * - `Todas` is an option of **both** groups, which is why each group has to be told
 *   apart by its row rather than by the option's name.
 * - The row label was read from the form, not inherited from the other role's form:
 *   the label sits in an outer row of the group, not in the row the radios are in.
 *
 * The person authorised `Todas` in both groups, recorded in spike 07 §5 as an express
 * authorisation from whoever answers for the emission. The two consequences are not the
 * same: in `Status da Nota` the flow turns the screen's default (Ativas) into the whole
 * set, so the file widens to cancelled, unused and denied notes along with the active
 * ones; in `Tipo de nota` the screen already arrives on `Todas`, so the flow states a
 * choice that happens to be the default — and that is the whole difference this design
 * exists to make. A default is what the screen sends until somebody says otherwise;
 * here it is what this flow said, so a portal that changes the default would find the
 * flow restating the choice on the next run instead of inheriting the new one.
 *
 * The role radio is **not** here, and that is a decision rather than an omission: the
 * role is not a fiscal parameter, it is what makes the export form exist at all, and
 * the flow states it by marking the screen instead of by declaring it as a choice of
 * the file.
 */

/** One option of a choice group, as the person reads it and as the portal posts it. */
export interface IssuerNoteChoiceOption {
  /** Accessible name, read from the radio's own `<label for>`. */
  readonly name: string;
  /** What the portal posts for this radio. */
  readonly value: string;
}

/** One choice group of the issuer form. */
export interface IssuerNoteChoiceGroup {
  /**
   * Visible label of the row the group sits in, with its colon.
   *
   * What tells the two groups apart, and it has to be the label: `Todas` is an option
   * of both, so the option's own name cannot say which group it belongs to. Read from
   * the outer row of the group in spike 07 — the row the radios sit in carries only
   * the options, so a reading that stopped there would have missed the label.
   */
  readonly rowLabel: string;
  /** Name the field carries in the scheduling request. */
  readonly field: string;
  /** The option the flow marks. */
  readonly authorised: string;
  /** Every option the screen offers, in the order it lists them. */
  readonly options: readonly IssuerNoteChoiceOption[];
}

/**
 * The groups, with every option and the value each one posts.
 *
 * The whole option list travels, and not only the authorised name, for two reasons: an
 * option that is missing is a screen that stopped offering what the flow states, and a
 * value that changes is a portal that renumbered its choices — both are failures worth
 * naming rather than a name that quietly stops meaning anything.
 */
export const ISSUER_NOTE_CHOICE_GROUPS = [
  {
    rowLabel: 'Tipo de nota:',
    field: 'tipoDeNota',
    authorised: 'Todas',
    options: [
      { name: 'Todas', value: '0' },
      { name: 'Entrada', value: '1' },
      { name: 'Saída', value: '2' },
    ],
  },
  {
    rowLabel: 'Status da Nota:',
    field: 'statusNota',
    authorised: 'Todas',
    options: [
      { name: 'Ativas', value: '1' },
      { name: 'Canceladas', value: '0' },
      { name: 'Inutilizadas', value: '3' },
      { name: 'Denegadas', value: '4' },
      { name: 'Todas', value: '2' },
    ],
  },
] as const satisfies readonly IssuerNoteChoiceGroup[];

/**
 * Why the flow refused to mark a group, when it refused.
 *
 * The two are one typed error and **two different failures**: a group that stopped
 * offering the stated choice is a change on the portal's side, while a marking that did
 * not stick is this automation's. Whoever reads the report has to be able to tell them
 * apart without reading the code, so the reason travels with the error instead of the
 * message having to be read twice.
 *
 * Declared here rather than imported, so that this module answers for its own failures
 * without reading the other flow's table. The two copies are the *same* two words on
 * purpose: the error class both flows throw compares against the destination's pair, so
 * a value that drifted apart here would silently send this flow's failure down the
 * other branch of the message — and that is exactly what the unit test of this module
 * proves cannot happen.
 */
export const ISSUER_NOTE_CHOICE_FAILURE = {
  /** The group's row no longer offers the choice the flow states for it. */
  notOffered: 'not-offered',
  /** The row offered the choice and the marking did not stick. */
  notMarked: 'not-marked',
} as const;

export type IssuerNoteChoiceFailure =
  (typeof ISSUER_NOTE_CHOICE_FAILURE)[keyof typeof ISSUER_NOTE_CHOICE_FAILURE];

/**
 * Whether the group's row still offers the choice the flow states for it.
 *
 * The **authorised name only**, and the limit of that is worth stating: an option the
 * portal removed is caught here, as a refusal, and an option it added is caught by the
 * unknown-name guard, which reads the whole list — but a group that quietly dropped some
 * *other* option is seen by neither, and this function cannot see it. The flow states one
 * choice per group and needs that one, so the check is the one it can honestly make.
 */
export function offersAuthorisedIssuerChoice(
  group: IssuerNoteChoiceGroup,
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
 * radios that are not choice groups at all — the three roles do — so the comparison
 * takes the list it is to judge against rather than deciding what that list is.
 *
 * A **multiset** comparison, and that is what `Todas` forces: it is an option of both
 * groups, so the form serves it twice and the known list carries it twice. Each
 * occurrence served consumes one occurrence known, so a label the table does not list is
 * named once however many times the screen repeats it — and a label served *more* often
 * than the table lists it is one radio the flow does not know, which is what a group
 * added by the portal looks like.
 *
 * @param servedNames labels the screen carries, read from the radios' own labels.
 * @param knownNames labels the flow recognises, which is the whole set on the form.
 */
export function findUnknownIssuerChoiceNames(
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
 */
export function findDivergedIssuerNoteChoiceGroup(
  fields: URLSearchParams,
): IssuerNoteChoiceGroup | null {
  const diverged = ISSUER_NOTE_CHOICE_GROUPS.find((group) => {
    const authorised = group.options.find((option) => option.name === group.authorised);
    return fields.get(group.field) !== authorised?.value;
  });

  return diverged ?? null;
}
