import { expect, test } from '@playwright/test';
import {
  NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS,
  type AllStatusNfceNoteChoiceGroup,
} from '../support/nfce-export-issuer-all-status-note-choices';
import {
  NFCE_NOTE_CHOICE_FAILURE,
  NFCE_NOTE_CHOICE_GROUPS,
  findDivergedNfceNoteChoiceGroup,
  findUnknownNfceChoiceNames,
  offersAuthorisedNfceChoice,
} from '../support/nfce-export-issuer-note-choices';
import { UnexpectedFormChoiceError } from '../support/nfe-export-error';
import { NOTE_CHOICE_FAILURE } from '../support/nfe-export-note-choices';

/**
 * The every-status flow's note choices, as arithmetic, with no browser and no portal.
 *
 * Proved separately from the `Canceladas` battery on purpose — a green run of one says
 * nothing about the other —, and carrying two claims the others do not have, both
 * consequences of the fact that **this flow and the `Canceladas` flow work the same
 * screen**:
 *
 * - **The screen facts of the two tables are pinned equal.** Row labels, fields,
 *   options and posted values are one measurement of one form (spike 08), declared in
 *   two tables so each flow carries its own knowledge. Without this pin the second
 *   declaration could drift away from the first — a renumbering fixed in one table
 *   and not the other would send this flow's request out comparing against a value
 *   the portal no longer posts, and nothing else would notice. What the two tables
 *   are *allowed* to disagree about is what each flow authorises, and that is asserted
 *   below as this flow's own pair.
 * - **The refusal vocabulary is read from the word the page object actually quotes.**
 *   This module declares no failure word of its own: marking lives in the shared NFC-e
 *   page object, which throws with `NFCE_NOTE_CHOICE_FAILURE.notOffered`. The test
 *   builds the error the way the page does — with this flow's group — and checks the
 *   message names this flow's choice, so a word that drifted apart would land the
 *   refusal on the wrong branch of the class and be seen here, without a portal.
 *
 * Like the siblings, the groups share **no option** — `Todas` exists only in
 * `Status da NFC-e` — so the row label, not the option name, tells them apart, and
 * there is no shared option for a "two groups share an option" assertion to hold on.
 *
 * Every request body here is **synthetic**. What the reading looks at is the choice
 * fields, so neither an inscription nor a period is needed — and putting a real one in
 * a versioned file is what the AGENTS.md forbids.
 */

/** What the flow marks in a group, as the value the portal posts for that option. */
function authorisedValueOf(group: AllStatusNfceNoteChoiceGroup): string {
  const authorised = group.options.find((option) => option.name === group.authorised);
  expect(authorised, `"${group.authorised}" is not an option of "${group.rowLabel}"`).toBeDefined();
  return authorised?.value ?? '';
}

/** A request body carrying what the flow marks, plus whatever else a form sends. */
function bodyWithAuthorisedChoices(overrides: Record<string, string> = {}): URLSearchParams {
  // `numeroNota` and not a date: the reading only looks at the choice fields, the
  // field the form always sends alongside them is enough to prove that, and the
  // period this project is configured with is environment data that must not reach
  // a versioned file.
  return new URLSearchParams({
    numeroNota: '',
    ...Object.fromEntries(
      NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.map((group) => [group.field, authorisedValueOf(group)]),
    ),
    ...overrides,
  });
}

test.describe('the note choices the every-status flow states', () => {
  test('every option of every group has a name and a value', () => {
    // An option without a value could not be told apart from one the portal sent, so
    // the flow would accept whatever came back for it.
    expect(NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.length).toBeGreaterThan(0);
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
      for (const option of group.options) {
        expect(option.name).not.toBe('');
        expect(option.value).not.toBe('');
      }
    }
  });

  test('the flow states Saída for the type and Todas for the status', () => {
    // The whole difference this flow exists for, written as data: the type agrees
    // with the screen's default (and with the sibling flow's choice), the status
    // widens to every status (`statusNota` = `2`) where the screen arrives on Ativas
    // and the sibling flow posts `0`. A table edited into something else would be a
    // different export authorised under this flow's name.
    const [typeGroup, statusGroup] = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS;

    expect(typeGroup.authorised).toBe('Saída');
    expect(statusGroup.authorised).toBe('Todas');
    expect(authorisedValueOf(statusGroup)).toBe('2');
    expect(authorisedValueOf(typeGroup)).toBe('1');
  });

  test('no option of a group posts the same value as another', () => {
    // Two names sharing a value would make the wire reading unable to say which one
    // the request carried.
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      const values = group.options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('the choice each group marks is one of its own options', () => {
    // The flow states a name; if the name is not on the form there is nothing to mark,
    // and the run would stop on the first item with a choice that cannot be marked.
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      expect(group.options.map((option) => option.name)).toContain(group.authorised);
    }
  });

  test('the groups are told apart by their row and by their own field', () => {
    // The row label is what a refusal and a divergence report quote, and the field is
    // what the request is read on: either repeating itself would let one group stand
    // in for the other. No option of the two groups is shared (asserted below), so the
    // row label is kept because it names the group, not because nothing else could.
    expect(new Set(NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.map((group) => group.rowLabel)).size).toBe(
      NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.length,
    );
    expect(new Set(NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.map((group) => group.field)).size).toBe(
      NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.length,
    );
  });

  test('no option of one group is an option of the other', () => {
    // The measurement this flow rests on, stated where a violation would be caught
    // before a portal visit: if the NFC-e form ever offered an option in both groups,
    // the multiset below would be the only thing telling a duplicate serving from a
    // group the flow does not know, and it would still be worth being told here
    // rather than during a run against production.
    const [first, second] = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS;
    const firstNames = first.options.map((option) => option.name);

    for (const option of second.options) {
      expect(firstNames).not.toContain(option.name);
    }
  });

  test('its screen facts match the Canceladas flow table of the same screen', () => {
    // One screen, one measurement (spike 08), two declarations. Row labels, fields,
    // options and posted values must agree across the two tables; only what each flow
    // authorises may differ. Without this pin, fixing a portal change in one table
    // and not the other would be invisible until the wire reading failed — after the
    // click, with the export already registered. The equality below covers the count
    // of groups as well: arrays of different lengths are never equal.
    const screenFacts = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.map((group) => ({
      rowLabel: group.rowLabel,
      field: group.field,
      options: group.options,
    }));
    const siblingScreenFacts = NFCE_NOTE_CHOICE_GROUPS.map((group) => ({
      rowLabel: group.rowLabel,
      field: group.field,
      options: group.options,
    }));

    expect(screenFacts).toEqual(siblingScreenFacts);
  });
});

test.describe('reading the choices out of a request', () => {
  test('a request carrying what the flow marked diverges from nothing', () => {
    expect(
      findDivergedNfceNoteChoiceGroup(
        bodyWithAuthorisedChoices(),
        NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS,
      ),
    ).toBeNull();
  });

  test('a request carrying another option of a group diverges on that group', () => {
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      const other = group.options.find((option) => option.name !== group.authorised);

      expect(other).toBeDefined();
      const diverged = findDivergedNfceNoteChoiceGroup(
        bodyWithAuthorisedChoices({ [group.field]: other?.value ?? '' }),
        NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS,
      );
      expect(diverged?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request that does not carry a choice at all diverges on that group', () => {
    // A form the portal stopped submitting would otherwise read as "nothing to
    // compare", which is the one answer that must never mean "fine".
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      const fields = bodyWithAuthorisedChoices();
      fields.delete(group.field);

      expect(
        findDivergedNfceNoteChoiceGroup(fields, NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS)?.rowLabel,
      ).toBe(group.rowLabel);
    }
  });

  test('a request carrying a value the flow does not know diverges', () => {
    // A value outside the measured list is a portal that renumbered its choices, or a
    // request that is not the one the flow asked for. Either way the flow cannot show
    // it is the authorised note set. This is also the reading that would catch a
    // table's values edited out of sync with what the portal posts.
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      expect(
        findDivergedNfceNoteChoiceGroup(
          bodyWithAuthorisedChoices({ [group.field]: '42' }),
          NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS,
        ),
      ).not.toBeNull();
    }
  });

  test("the status the sibling flow posts is not this flow's status", () => {
    // The one value that separates the two flows of this screen, checked the way the
    // request will be: `Canceladas` posts `0`, this flow posts `2`. Accepting the
    // sibling's value here would narrow the file to the cancelled notes with the
    // request going out perfectly well — the failure with no visible symptom.
    const statusGroup = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS[1];
    const siblingStatus = NFCE_NOTE_CHOICE_GROUPS[1];

    const requestCarryingSiblingStatus = bodyWithAuthorisedChoices({
      [statusGroup.field]:
        siblingStatus.options.find((option) => option.name === siblingStatus.authorised)?.value ??
        '',
    });

    expect(
      findDivergedNfceNoteChoiceGroup(
        requestCarryingSiblingStatus,
        NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS,
      )?.rowLabel,
    ).toBe(statusGroup.rowLabel);
  });

  test('each group is read on its own field, so one diverging does not hide the other', () => {
    const [first, ...rest] = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS;
    expect(rest.length).toBeGreaterThan(0);

    const allWrong = bodyWithAuthorisedChoices(
      Object.fromEntries(
        NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.map((group) => [
          group.field,
          group.options.find((option) => option.name !== group.authorised)?.value ?? '',
        ]),
      ),
    );
    expect(
      findDivergedNfceNoteChoiceGroup(allWrong, NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS)?.rowLabel,
    ).toBe(first.rowLabel);

    // The second group wrong on its own names the second group, which is what tells
    // the report which choice diverged instead of reporting the first one checked.
    const second = rest[0];
    const secondWrong = bodyWithAuthorisedChoices({
      [second.field]:
        second.options.find((option) => option.name !== second.authorised)?.value ?? '',
    });
    expect(
      findDivergedNfceNoteChoiceGroup(secondWrong, NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS)?.rowLabel,
    ).toBe(second.rowLabel);
  });

  test('what the form sent alongside the choices does not change the reading', () => {
    const fields = bodyWithAuthorisedChoices({ numeroNota: '1' });

    expect(findDivergedNfceNoteChoiceGroup(fields, NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS)).toBeNull();
  });
});

test.describe('a group the form no longer offers the stated choice', () => {
  test('the group is read as not offering the stated choice', () => {
    // The reading is the shared page object's — parameterised by groups — so it is
    // exercised with this flow's table: a group that quietly lost an option, or that
    // offers a different set entirely, is caught before anything is marked.
    for (const group of NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS) {
      const withoutAuthorised = group.options
        .filter((option) => option.name !== group.authorised)
        .map((option) => option.name);

      expect(offersAuthorisedNfceChoice(group, withoutAuthorised)).toBe(false);
      expect(
        offersAuthorisedNfceChoice(
          group,
          group.options.map((option) => option.name),
        ),
      ).toBe(true);
      expect(offersAuthorisedNfceChoice(group, [])).toBe(false);
      expect(offersAuthorisedNfceChoice(group, ['Something else'])).toBe(false);
    }
  });
});

test.describe('a choice the flow does not know', () => {
  // Two roles and the options of both groups: the NFC-e form carries no search-by-key
  // role, so the set is one radio shorter than the NF-e form's, and a guard that
  // borrowed the NF-e list would call that missing radio unknown on every run.
  const knownNames = [
    'Contribuinte como Emitente',
    'Contribuinte como Destinatário',
    ...NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS.flatMap((group) =>
      group.options.map((option) => option.name),
    ),
  ];

  test('an option the portal added is named', () => {
    const unknown = findUnknownNfceChoiceNames([...knownNames, 'Emitidas no dia'], knownNames);

    expect(unknown).toEqual(['Emitidas no dia']);
  });

  test('a group the portal added brings its own names, and is refused whole', () => {
    // A new group is a new fiscal parameter. It arrives as names the table has never
    // heard of, and leaving it at whatever the screen marks would schedule an export of
    // notes nobody authorised — so every one of its names is named.
    const addedGroup = ['Regime especial', 'Sim', 'Não'];

    expect(findUnknownNfceChoiceNames([...knownNames, ...addedGroup], knownNames)).toEqual(
      addedGroup,
    );
  });

  test('a name served more often than the table lists it is a radio the flow does not know', () => {
    // `Todas` is an option of the status group alone here, so the table lists it once.
    // Two radios served where one is known is a group the flow does not know offering
    // it — comparing occurrences is what catches that, and comparing distinct names
    // would let the duplicate through.
    expect(findUnknownNfceChoiceNames([...knownNames, 'Todas'], knownNames)).toEqual(['Todas']);
  });

  test('the form the flow knows carries nothing unknown', () => {
    expect(findUnknownNfceChoiceNames(knownNames, knownNames)).toEqual([]);
  });
});

test.describe('the vocabulary of a refusal', () => {
  // The error class decides which of its two messages to write by comparing the reason
  // against the destination flow's pair — and the reason the page object throws with is
  // `NFCE_NOTE_CHOICE_FAILURE.notOffered` from the sibling module, the same word this
  // flow's marking path receives. The error below is built the way the page builds it,
  // against **this** flow's group, so the message has to name this flow's choice
  // (`Todas`) and its row label for the assertions to hold — a reason or a group that
  // drifted would land on the other branch and be seen here, without a portal.
  const [group] = NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS;
  const offeredWithoutAuthorised = group.options
    .filter((option) => option.name !== group.authorised)
    .map((option) => option.name)
    .join(', ');

  test("a group that stopped offering the choice is named as the portal's change", () => {
    const error = new UnexpectedFormChoiceError(
      NFCE_NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredWithoutAuthorised,
    );

    expect(error.failure).toBe(NFCE_NOTE_CHOICE_FAILURE.notOffered);
    expect(error.message).toContain('does not offer');
    expect(error.message).toContain(group.authorised);
    expect(error.message).toContain(group.rowLabel);
    expect(error.message).toContain('portal');
    expect(error.message).toContain('nothing was scheduled');
  });

  test('the refusal reads differently from a marking that did not stick', () => {
    // The marking is read back with `toBeChecked()`, so "did not stick" never reaches
    // this module — but the class still has two messages, and the distinction the
    // failure carries has to reach the report either way. Comparing against the other
    // message is what shows the two are still tellable apart without a second reason
    // being invented here to test it.
    const notOffered = new UnexpectedFormChoiceError(
      NFCE_NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredWithoutAuthorised,
    );
    const notMarked = new UnexpectedFormChoiceError(
      NOTE_CHOICE_FAILURE.notMarked,
      group,
      group.authorised,
    );

    expect(notOffered.message).not.toBe(notMarked.message);
    expect(notMarked.message).toContain('did not stick');
  });
});
