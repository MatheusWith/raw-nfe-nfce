import { expect, test } from '@playwright/test';
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
 * The NFC-e flow's note choices, as arithmetic, with no browser and no portal.
 *
 * This is the same property the NF-e flows prove for their own tables, and it is
 * proved separately on purpose: each flow is owner of the knowledge of its own screen,
 * so a green run of one says nothing about the others, and neither does one test file
 * about another. What has to hold here is that what this flow states and what it
 * compares the request against cannot disagree with each other or with the form
 * measured for the NFC-e screen — and that is a property of the data, not of a run.
 *
 * Two things differ from the NF-e batteries, and both are measurements rather than
 * omissions:
 *
 * - **No option is shared between the two groups.** `Todas` exists only in
 *   `Status da NFC-e`, so the assertion the NF-e tests make — that two groups share
 *   an option and are therefore told apart by their row — has nothing to hold on
 *   here. What the row label still has to be is *distinct*, because it is the name
 *   the refusal and the divergence report quote.
 * - **The vocabulary section carries one reason, not two.** This flow reads the
 *   marking back with `toBeChecked()`, so "the marking did not stick" surfaces under
 *   Playwright's own assertion and never reaches this module. A second word here
 *   would be a branch nothing can take.
 *
 * Every request body here is **synthetic**. What the reading looks at is the choice
 * fields, so neither an inscription nor a period is needed — and putting a real one in
 * a versioned file is what the AGENTS.md forbids.
 */

/** What the flow marks in a group, as the value the portal posts for that option. */
function authorisedValueOf(group: (typeof NFCE_NOTE_CHOICE_GROUPS)[number]): string {
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
  const fields = new URLSearchParams({
    numeroNota: '',
    ...Object.fromEntries(
      NFCE_NOTE_CHOICE_GROUPS.map((group) => [group.field, authorisedValueOf(group)]),
    ),
    ...overrides,
  });
  return fields;
}

test.describe('the note choices the NFC-e flow states', () => {
  test('every option of every group has a name and a value', () => {
    // An option without a value could not be told apart from one the portal sent, so
    // the flow would accept whatever came back for it.
    expect(NFCE_NOTE_CHOICE_GROUPS.length).toBeGreaterThan(0);
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
      for (const option of group.options) {
        expect(option.name).not.toBe('');
        expect(option.value).not.toBe('');
      }
    }
  });

  test('no option of a group posts the same value as another', () => {
    // Two names sharing a value would make the wire reading unable to say which one
    // the request carried.
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      const values = group.options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('the choice each group marks is one of its own options', () => {
    // The flow states a name; if the name is not on the form there is nothing to mark,
    // and the run would stop on the first item with a choice that cannot be marked.
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      expect(group.options.map((option) => option.name)).toContain(group.authorised);
    }
  });

  test('the groups are told apart by their row and by their own field', () => {
    // The row label is what a refusal and a divergence report quote, and the field is
    // what the request is read on: either repeating itself would let one group stand
    // in for the other. This is where the NF-e batteries assert that two groups share
    // an option — and here they do not: `Todas` exists only in `Status da NFC-e`
    // (measured in spike 08), so there is no shared option for the row label to be
    // needed for. It is kept because it names the group, not because nothing else
    // could.
    expect(new Set(NFCE_NOTE_CHOICE_GROUPS.map((group) => group.rowLabel)).size).toBe(
      NFCE_NOTE_CHOICE_GROUPS.length,
    );
    expect(new Set(NFCE_NOTE_CHOICE_GROUPS.map((group) => group.field)).size).toBe(
      NFCE_NOTE_CHOICE_GROUPS.length,
    );
  });

  test('no option of one group is an option of the other', () => {
    // The measurement this flow rests on, stated where a violation would be caught
    // before a portal visit: if the NFC-e form ever offered an option in both groups,
    // the multiset below would be the only thing telling a duplicate serving from a
    // group the flow does not know, and it would still be worth being told here
    // rather than during a run against production.
    const [first, second] = NFCE_NOTE_CHOICE_GROUPS;
    const firstNames = first.options.map((option) => option.name);

    for (const option of second.options) {
      expect(firstNames).not.toContain(option.name);
    }
  });
});

test.describe('reading the choices out of a request', () => {
  test('a request carrying what the flow marked diverges from nothing', () => {
    expect(findDivergedNfceNoteChoiceGroup(bodyWithAuthorisedChoices())).toBeNull();
  });

  test('a request carrying another option of a group diverges on that group', () => {
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      const other = group.options.find((option) => option.name !== group.authorised);

      expect(other).toBeDefined();
      const diverged = findDivergedNfceNoteChoiceGroup(
        bodyWithAuthorisedChoices({ [group.field]: other?.value ?? '' }),
      );
      expect(diverged?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request that does not carry a choice at all diverges on that group', () => {
    // A form the portal stopped submitting would otherwise read as "nothing to
    // compare", which is the one answer that must never mean "fine".
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      const fields = bodyWithAuthorisedChoices();
      fields.delete(group.field);

      expect(findDivergedNfceNoteChoiceGroup(fields)?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request carrying a value the flow does not know diverges', () => {
    // A value outside the measured list is a portal that renumbered its choices, or a
    // request that is not the one the flow asked for. Either way the flow cannot show
    // it is the authorised note set. The values are renumbered relative to the NF-e
    // form, so this is the reading that would catch a table borrowed from there.
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
      expect(
        findDivergedNfceNoteChoiceGroup(bodyWithAuthorisedChoices({ [group.field]: '42' })),
      ).not.toBeNull();
    }
  });

  test('each group is read on its own field, so one diverging does not hide the other', () => {
    const [first, ...rest] = NFCE_NOTE_CHOICE_GROUPS;
    expect(rest.length).toBeGreaterThan(0);

    const allWrong = bodyWithAuthorisedChoices(
      Object.fromEntries(
        NFCE_NOTE_CHOICE_GROUPS.map((group) => [
          group.field,
          group.options.find((option) => option.name !== group.authorised)?.value ?? '',
        ]),
      ),
    );
    expect(findDivergedNfceNoteChoiceGroup(allWrong)?.rowLabel).toBe(first.rowLabel);

    // The second group wrong on its own names the second group, which is what tells
    // the report which choice diverged instead of reporting the first one checked.
    const second = rest[0];
    const secondWrong = bodyWithAuthorisedChoices({
      [second.field]:
        second.options.find((option) => option.name !== second.authorised)?.value ?? '',
    });
    expect(findDivergedNfceNoteChoiceGroup(secondWrong)?.rowLabel).toBe(second.rowLabel);
  });

  test('what the form sent alongside the choices does not change the reading', () => {
    const fields = bodyWithAuthorisedChoices({ numeroNota: '1' });

    expect(findDivergedNfceNoteChoiceGroup(fields)).toBeNull();
  });
});

test.describe('a group the form no longer offers the stated choice', () => {
  test('the group is read as not offering the stated choice', () => {
    // The whole option list is compared and not only the authorised name, so a group
    // that quietly lost an option is caught before anything is marked.
    for (const group of NFCE_NOTE_CHOICE_GROUPS) {
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
    }
  });

  test('an option the row never offered is read the same way as one it lost', () => {
    // A screen that offers a different set entirely is not a screen offering the
    // stated choice, and the reading has no way — and needs no way — to tell the two
    // apart: both stop the run before anything is marked.
    const [group] = NFCE_NOTE_CHOICE_GROUPS;

    expect(offersAuthorisedNfceChoice(group, [])).toBe(false);
    expect(offersAuthorisedNfceChoice(group, ['Something else'])).toBe(false);
  });
});

test.describe('a choice the flow does not know', () => {
  // Two roles and the options of both groups: the NFC-e form carries no search-by-key
  // role, so the set is one radio shorter than the NF-e form's, and a guard that
  // borrowed the NF-e list would call that missing radio unknown on every run.
  const knownNames = [
    'Contribuinte como Emitente',
    'Contribuinte como Destinatário',
    ...NFCE_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
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
  // The error class this flow throws decides which of its two messages to write by
  // comparing the reason against the destination flow's pair — so a reason declared
  // here that had drifted to another word would land this flow's refusal on the other
  // branch, and the report would name the opposite fault. The message is the proof
  // that the two pairs still say the same thing: the assertions below only hold on
  // the branch taken when the word matches, and the other branch writes "did not
  // stick" instead.
  const [group] = NFCE_NOTE_CHOICE_GROUPS;
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
    // The only reason this module can carry is the one above, but the class still has
    // two messages, and the distinction the failure carries has to reach the report
    // either way. Comparing against the other message is what shows the two are still
    // tellable apart without a second reason being invented here to test it.
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
