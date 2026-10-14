import { expect, test } from '@playwright/test';
import {
  ISSUER_NOTE_CHOICE_FAILURE,
  ISSUER_NOTE_CHOICE_GROUPS,
  findDivergedIssuerNoteChoiceGroup,
  findUnknownIssuerChoiceNames,
  offersAuthorisedIssuerChoice,
} from '../support/nfe-export-issuer-note-choices';
import { UnexpectedFormChoiceError } from '../support/nfe-export-error';

/**
 * The issuer flow's note choices, as arithmetic, with no browser and no portal.
 *
 * This is the same property the destination flow proves for its own table, and it is
 * proved separately on purpose: each flow is owner of the knowledge of its own screen,
 * so a green run of one says nothing about the other, and neither does one test file
 * about the other. What has to hold here is that what the issuer flow states and what
 * it compares the request against cannot disagree with each other or with the form
 * measured for this role — and that is a property of the data, not of a run.
 *
 * Every request body here is **synthetic**. What the reading looks at is the choice
 * fields, so neither an inscription nor a period is needed — and putting a real one in
 * a versioned file is what the AGENTS.md forbids.
 */

/** What the flow marks in a group, as the value the portal posts for that option. */
function authorisedValueOf(group: (typeof ISSUER_NOTE_CHOICE_GROUPS)[number]): string {
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
      ISSUER_NOTE_CHOICE_GROUPS.map((group) => [group.field, authorisedValueOf(group)]),
    ),
    ...overrides,
  });
  return fields;
}

test.describe('the note choices the issuer flow states', () => {
  test('every option of every group has a name and a value', () => {
    // An option without a value could not be told apart from one the portal sent, so
    // the flow would accept whatever came back for it.
    expect(ISSUER_NOTE_CHOICE_GROUPS.length).toBeGreaterThan(0);
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
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
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      const values = group.options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('the choice each group marks is one of its own options', () => {
    // The flow states a name; if the name is not on the form there is nothing to mark,
    // and the run would stop on the first item with a choice that cannot be marked.
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      expect(group.options.map((option) => option.name)).toContain(group.authorised);
    }
  });

  test('the groups are told apart by their row, not by the option name', () => {
    // The reason the row label exists at all, and it is a measurement: `Todas` is an
    // option of both choice groups, so a lookup by name cannot say which group it
    // marked. It fails here if one of the two groups ever stops offering it, which
    // would leave the row label doing a job it is measured for.
    const sharing = ISSUER_NOTE_CHOICE_GROUPS.filter((group) =>
      group.options.some((option) => option.name === group.authorised),
    );
    expect(sharing.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ISSUER_NOTE_CHOICE_GROUPS.map((group) => group.rowLabel)).size).toBe(
      ISSUER_NOTE_CHOICE_GROUPS.length,
    );
    expect(new Set(ISSUER_NOTE_CHOICE_GROUPS.map((group) => group.field)).size).toBe(
      ISSUER_NOTE_CHOICE_GROUPS.length,
    );
  });
});

test.describe('reading the choices out of a request', () => {
  test('a request carrying what the flow marked diverges from nothing', () => {
    expect(findDivergedIssuerNoteChoiceGroup(bodyWithAuthorisedChoices())).toBeNull();
  });

  test('a request carrying another option of a group diverges on that group', () => {
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      const other = group.options.find((option) => option.name !== group.authorised);

      expect(other).toBeDefined();
      const diverged = findDivergedIssuerNoteChoiceGroup(
        bodyWithAuthorisedChoices({ [group.field]: other?.value ?? '' }),
      );
      expect(diverged?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request that does not carry a choice at all diverges on that group', () => {
    // A form the portal stopped submitting would otherwise read as "nothing to
    // compare", which is the one answer that must never mean "fine".
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      const fields = bodyWithAuthorisedChoices();
      fields.delete(group.field);

      expect(findDivergedIssuerNoteChoiceGroup(fields)?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request carrying a value the flow does not know diverges', () => {
    // A value outside the measured list is a portal that renumbered its choices, or a
    // request that is not the one the flow asked for. Either way the flow cannot show
    // it is the authorised note set.
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      expect(
        findDivergedIssuerNoteChoiceGroup(bodyWithAuthorisedChoices({ [group.field]: '42' })),
      ).not.toBeNull();
    }
  });

  test('each group is read on its own field, so one diverging does not hide the other', () => {
    const [first, ...rest] = ISSUER_NOTE_CHOICE_GROUPS;
    expect(rest.length).toBeGreaterThan(0);

    const allWrong = bodyWithAuthorisedChoices(
      Object.fromEntries(
        ISSUER_NOTE_CHOICE_GROUPS.map((group) => [
          group.field,
          group.options.find((option) => option.name !== group.authorised)?.value ?? '',
        ]),
      ),
    );
    expect(findDivergedIssuerNoteChoiceGroup(allWrong)?.rowLabel).toBe(first.rowLabel);

    // The second group wrong on its own names the second group, which is what tells
    // the report which choice diverged instead of reporting the first one checked.
    const second = rest[0];
    const secondWrong = bodyWithAuthorisedChoices({
      [second.field]:
        second.options.find((option) => option.name !== second.authorised)?.value ?? '',
    });
    expect(findDivergedIssuerNoteChoiceGroup(secondWrong)?.rowLabel).toBe(second.rowLabel);
  });

  test('what the form sent alongside the choices does not change the reading', () => {
    const fields = bodyWithAuthorisedChoices({ numeroNota: '1' });

    expect(findDivergedIssuerNoteChoiceGroup(fields)).toBeNull();
  });
});

test.describe('a group the form no longer offers the stated choice', () => {
  test('the group is read as not offering the stated choice', () => {
    // The whole option list is compared and not only the authorised name, so a group
    // that quietly lost an option is caught before anything is marked.
    for (const group of ISSUER_NOTE_CHOICE_GROUPS) {
      const withoutAuthorised = group.options
        .filter((option) => option.name !== group.authorised)
        .map((option) => option.name);

      expect(offersAuthorisedIssuerChoice(group, withoutAuthorised)).toBe(false);
      expect(
        offersAuthorisedIssuerChoice(
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
    const [group] = ISSUER_NOTE_CHOICE_GROUPS;

    expect(offersAuthorisedIssuerChoice(group, [])).toBe(false);
    expect(offersAuthorisedIssuerChoice(group, ['Something else'])).toBe(false);
  });
});

test.describe('a choice the flow does not know', () => {
  const knownNames = [
    'Pesquisar SOMENTE pela Chave da NFE',
    'Contribuinte como Emitente',
    'Contribuinte como Destinatário',
    ...ISSUER_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
  ];

  test('an option the portal added is named', () => {
    const unknown = findUnknownIssuerChoiceNames([...knownNames, 'Emitidas no dia'], knownNames);

    expect(unknown).toEqual(['Emitidas no dia']);
  });

  test('a group the portal added brings its own names, and is refused whole', () => {
    // A new group is a new fiscal parameter. It arrives as names the table has never
    // heard of, and leaving it at whatever the screen marks would schedule an export of
    // notes nobody authorised — so every one of its names is named.
    const addedGroup = ['Regime especial', 'Sim', 'Não'];

    expect(findUnknownIssuerChoiceNames([...knownNames, ...addedGroup], knownNames)).toEqual(
      addedGroup,
    );
  });

  test('a name served more often than the table lists it is a radio the flow does not know', () => {
    // Three radios named `Todas` where the table knows two is a third group offering it.
    // Comparing occurrences is what catches that; comparing distinct names would not.
    expect(findUnknownIssuerChoiceNames([...knownNames, 'Todas'], knownNames)).toEqual(['Todas']);
  });

  test('the form the flow knows carries nothing unknown', () => {
    expect(findUnknownIssuerChoiceNames(knownNames, knownNames)).toEqual([]);
  });
});

test.describe('the vocabulary of a refusal', () => {
  // The error class both flows throw decides which of its two messages to write by
  // comparing the reason against the destination flow's pair — so a reason declared
  // here that had drifted to another word would land this flow's refusal on the other
  // branch, and the report would name the opposite fault. The message is the proof
  // that the two pairs still say the same thing.
  const [group] = ISSUER_NOTE_CHOICE_GROUPS;
  const offeredWithoutAuthorised = group.options
    .filter((option) => option.name !== group.authorised)
    .map((option) => option.name)
    .join(', ');

  test("a group that stopped offering the choice is named as the portal's change", () => {
    const error = new UnexpectedFormChoiceError(
      ISSUER_NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredWithoutAuthorised,
    );

    expect(error.failure).toBe(ISSUER_NOTE_CHOICE_FAILURE.notOffered);
    expect(error.message).toContain('does not offer');
    expect(error.message).toContain(group.authorised);
    expect(error.message).toContain(group.rowLabel);
    expect(error.message).toContain('portal');
    expect(error.message).toContain('nothing was scheduled');
  });

  test("a marking that did not stick is named as this automation's, and reads differently", () => {
    const error = new UnexpectedFormChoiceError(
      ISSUER_NOTE_CHOICE_FAILURE.notMarked,
      group,
      group.authorised,
    );
    const notOffered = new UnexpectedFormChoiceError(
      ISSUER_NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredWithoutAuthorised,
    );

    expect(error.failure).toBe(ISSUER_NOTE_CHOICE_FAILURE.notMarked);
    expect(error.message).toContain('did not stick');
    expect(error.message).toContain('authorised');
    expect(error.message).toContain('nothing was scheduled');

    // The two messages have to be tellable apart from each other, or the distinction
    // the failure carries would never reach the report.
    expect(error.message).not.toBe(notOffered.message);
  });
});
