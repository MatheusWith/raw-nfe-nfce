import { expect, test } from '@playwright/test';
import {
  EXPORT_NOTE_CHOICE_GROUPS,
  findDivergedNoteChoiceGroup,
  findUnknownChoiceNames,
  NOTE_CHOICE_FAILURE,
  offersAuthorisedChoice,
} from '../support/nfe-export-note-choices';
import { UnexpectedFormChoiceError } from '../support/nfe-export-error';

/**
 * The note choices of the export, as arithmetic, with no browser and no portal.
 *
 * A run against the portal only ever walks the path where the choices come out right,
 * so it is just as happy with a table whose values drifted from the form as with the
 * measured one. The property that matters is that what the flow states and what it
 * compares the request against cannot disagree with each other or with the measured
 * form, and that is a property of the data, not of a run.
 *
 * Every request body here is **synthetic**. What the reading looks at is the choice
 * fields, so an inscription or a period is not needed — and putting a real one in a
 * versioned file is what the AGENTS.md forbids.
 */

/** A request body carrying what the flow marks, plus whatever else a form sends. */
function bodyWithAuthorisedChoices(overrides: Record<string, string> = {}): URLSearchParams {
  const fields = new URLSearchParams({
    // Present so the body looks like the real one: the reading keys off the choice
    // fields alone, and a body without them is the case the tests below cover on
    // purpose.
    dataInicial_input: '01/01/2026',
    ...Object.fromEntries(
      EXPORT_NOTE_CHOICE_GROUPS.map((group) => [
        group.field,
        group.options.find((option) => option.name === group.authorised)?.value ?? '',
      ]),
    ),
    ...overrides,
  });
  return fields;
}

test.describe('the note choices the flow states', () => {
  test('every option of every group has a name and a value', () => {
    // An option without a value could not be told apart from one the portal sent, so
    // the flow would accept whatever came back for it.
    for (const group of EXPORT_NOTE_CHOICE_GROUPS) {
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
    for (const group of EXPORT_NOTE_CHOICE_GROUPS) {
      const values = group.options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('the choice each group marks is one of its own options', () => {
    // The flow states a name; if the name is not on the form there is nothing to mark,
    // and the run would stop on the first item with a choice that cannot be marked.
    for (const group of EXPORT_NOTE_CHOICE_GROUPS) {
      expect(group.options.map((option) => option.name)).toContain(group.authorised);
    }
  });

  test('the groups are told apart by their row, not by the option name', () => {
    // The reason the row label exists at all, and it is a measurement: `Todas` is an
    // option of both groups, so a lookup by name cannot say which group it marked.
    // It fails here if one of the two groups ever stops offering it, which would leave
    // the row label doing a job it is measured for.
    const sharing = EXPORT_NOTE_CHOICE_GROUPS.filter((group) =>
      group.options.some((option) => option.name === group.authorised),
    );
    expect(sharing).toHaveLength(2);
    expect(new Set(EXPORT_NOTE_CHOICE_GROUPS.map((group) => group.rowLabel)).size).toBe(
      EXPORT_NOTE_CHOICE_GROUPS.length,
    );
  });
});

test.describe('reading the choices out of a request', () => {
  test('a request carrying what the flow marked diverges from nothing', () => {
    expect(findDivergedNoteChoiceGroup(bodyWithAuthorisedChoices())).toBeNull();
  });

  test('a request carrying another option of a group diverges on that group', () => {
    const statusGroup = EXPORT_NOTE_CHOICE_GROUPS[1];
    const other = statusGroup.options.find((option) => option.name !== statusGroup.authorised);

    expect(other).toBeDefined();
    const diverged = findDivergedNoteChoiceGroup(
      bodyWithAuthorisedChoices({ [statusGroup.field]: other?.value ?? '' }),
    );
    expect(diverged?.rowLabel).toBe(statusGroup.rowLabel);
  });

  test('a request that does not carry a choice at all diverges on that group', () => {
    // A form the portal stopped submitting would otherwise read as "nothing to
    // compare", which is the one answer that must never mean "fine".
    for (const group of EXPORT_NOTE_CHOICE_GROUPS) {
      const fields = bodyWithAuthorisedChoices();
      fields.delete(group.field);

      expect(findDivergedNoteChoiceGroup(fields)?.rowLabel).toBe(group.rowLabel);
    }
  });

  test('a request carrying a value the flow does not know diverges', () => {
    // A value outside the measured list is a portal that renumbered its choices, or a
    // request that is not the one the flow asked for. Either way the flow cannot show
    // it is the authorised note set.
    const group = EXPORT_NOTE_CHOICE_GROUPS[0];

    expect(
      findDivergedNoteChoiceGroup(bodyWithAuthorisedChoices({ [group.field]: '42' })),
    ).not.toBeNull();
  });

  test('each group is read on its own field, so one diverging does not hide the other', () => {
    const [type, status] = EXPORT_NOTE_CHOICE_GROUPS;

    const bothWrong = bodyWithAuthorisedChoices({ [type.field]: '1', [status.field]: '1' });
    expect(findDivergedNoteChoiceGroup(bothWrong)?.rowLabel).toBe(type.rowLabel);

    // Status wrong on its own names status, which is what tells the report which choice
    // diverged instead of reporting the first one checked.
    const statusWrong = bodyWithAuthorisedChoices({ [status.field]: '1' });
    expect(findDivergedNoteChoiceGroup(statusWrong)?.rowLabel).toBe(status.rowLabel);
  });

  test('what the form sent alongside the choices does not change the reading', () => {
    const fields = bodyWithAuthorisedChoices({ dataFinal_input: '31/01/2026' });

    expect(findDivergedNoteChoiceGroup(fields)).toBeNull();
  });
});

test.describe('a group the form no longer offers the stated choice', () => {
  const group = EXPORT_NOTE_CHOICE_GROUPS[1];
  // The row without the option the flow states, as the portal would serve it.
  const offeredNames = group.options
    .filter((option) => option.name !== group.authorised)
    .map((option) => option.name);

  test('the group is read as not offering the stated choice', () => {
    // The whole option list is compared and not only the authorised name, so a group
    // that quietly lost its option is caught before anything is marked.
    expect(offersAuthorisedChoice(group, offeredNames)).toBe(false);
    expect(
      offersAuthorisedChoice(
        group,
        group.options.map((option) => option.name),
      ),
    ).toBe(true);
  });

  test('the failure says the portal stopped offering it, and nothing was scheduled', () => {
    const error = new UnexpectedFormChoiceError(
      NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredNames.join(', '),
    );

    // Named as what it is — a change on the portal's side — because that is the
    // difference from a marking that did not stick, which is this automation's, and the
    // two are one error class on purpose.
    expect(error.message).toContain('does not offer');
    expect(error.message).toContain(group.authorised);
    expect(error.message).toContain(group.rowLabel);
    expect(error.message).toContain('portal');
    expect(error.message).toContain('nothing was scheduled');
    expect(error.failure).toBe(NOTE_CHOICE_FAILURE.notOffered);
  });

  test('a marking that did not stick reads differently, and says whose fault it is', () => {
    const marked = group.options.find((option) => option.name !== group.authorised);
    const error = new UnexpectedFormChoiceError(
      NOTE_CHOICE_FAILURE.notMarked,
      group,
      marked?.name ?? '',
    );

    expect(error.message).toContain('did not stick');
    expect(error.message).toContain('authorised');
    expect(error.message).toContain('nothing was scheduled');
    expect(error.failure).toBe(NOTE_CHOICE_FAILURE.notMarked);

    // The two messages have to be tellable apart from each other, or the distinction
    // the failure carries would never reach the report.
    const notOffered = new UnexpectedFormChoiceError(
      NOTE_CHOICE_FAILURE.notOffered,
      group,
      offeredNames.join(', '),
    );
    expect(error.message).not.toBe(notOffered.message);
  });
});

test.describe('a choice the flow does not know', () => {
  const knownNames = [
    'Pesquisar SOMENTE pela Chave da NFE',
    'Contribuinte como Emitente',
    'Destinatário',
    ...EXPORT_NOTE_CHOICE_GROUPS.flatMap((group) => group.options.map((option) => option.name)),
  ];

  test('an option the portal added is named', () => {
    const unknown = findUnknownChoiceNames([...knownNames, 'Emitidas no dia'], knownNames);

    expect(unknown).toEqual(['Emitidas no dia']);
  });

  test('a group the portal added brings its own names, and is refused whole', () => {
    // A new group is a new fiscal parameter. It arrives as names the table has never
    // heard of, and leaving it at whatever the screen marks would schedule an export of
    // notes nobody authorised — so every one of its names is named.
    const addedGroup = ['Regime especial', 'Sim', 'Não'];

    expect(findUnknownChoiceNames([...knownNames, ...addedGroup], knownNames)).toEqual(addedGroup);
  });

  test('a name served more often than the table lists it is a radio the flow does not know', () => {
    // Three radios named `Todas` where the table knows two is a third group offering it.
    // Comparing occurrences is what catches that; comparing distinct names would not.
    expect(findUnknownChoiceNames([...knownNames, 'Todas'], knownNames)).toEqual(['Todas']);
  });

  test('the form the flow knows carries nothing unknown', () => {
    expect(findUnknownChoiceNames(knownNames, knownNames)).toEqual([]);
  });
});
