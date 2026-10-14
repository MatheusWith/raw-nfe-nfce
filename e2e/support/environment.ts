/**
 * Environment access for the SIATWeb automation.
 *
 * Values come exclusively from environment variables so that no secret or
 * machine-specific path is ever written into versioned code.
 */

const BASE_URL_ENV_VAR = 'E2E_BASE_URL';
const COMPANY_INSCRIPTION_ENV_VAR = 'E2E_COMPANY_INSCRIPTION';
const CERTIFICATE_PASSWORD_ENV_VAR = 'E2E_CERT_PASSWORD';
const CERTIFICATE_SSO_ORIGIN_ENV_VAR = 'E2E_CERT_SSO_ORIGIN';
const NFE_EXPORT_EMISSION_END_ENV_VAR = 'E2E_NFE_EXPORT_EMISSION_END';
const NFE_EXPORT_EMISSION_START_ENV_VAR = 'E2E_NFE_EXPORT_EMISSION_START';
const SIATWEB_SYSTEM_ORIGIN_ENV_VAR = 'E2E_SIATWEB_SYSTEM_ORIGIN';

/**
 * Name of the variable holding the A1 file path.
 *
 * Exported so a failure can point at the variable to fix, instead of echoing a
 * local filesystem path.
 */
export const CERTIFICATE_PATH_ENV_VAR = 'E2E_CERT_PATH';

/**
 * Name of the variable holding the inscriptions to schedule.
 *
 * Private to this module, unlike the certificate path: every refusal it produces
 * is raised from inside the reading that owns the variable, so the name is
 * already in the message it has to name. The value itself can never be echoed,
 * because a state inscription is the fiscal identifier of a real company.
 */
const NFE_EXPORT_INSCRIPTIONS_ENV_VAR = 'E2E_NFE_EXPORT_INSCRIPTIONS';

/**
 * Raised when a variable the automation cannot run without is absent or blank.
 */
export class MissingEnvironmentVariableError extends Error {
  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.name = 'MissingEnvironmentVariableError';
  }
}

/**
 * Raised when a variable is present but its value cannot be used.
 *
 * Distinct from {@link MissingEnvironmentVariableError} on purpose: one asks the
 * person to fill the variable in, the other to correct what they filled in, and
 * conflating them sends the correction to the wrong place.
 */
export class InvalidEnvironmentValueError extends Error {
  constructor(variableName: string, problem: string) {
    super(`Invalid value in environment variable ${variableName}: ${problem}`);
    this.name = 'InvalidEnvironmentValueError';
  }
}

function readRequiredVariable(variableName: string): string {
  const value = process.env[variableName];

  if (value === undefined || value.trim() === '') {
    throw new MissingEnvironmentVariableError(variableName);
  }

  return value;
}

/** Absolute address of the SIATWeb portal under test, without a trailing slash. */
export function getBaseUrl(): string {
  return readRequiredVariable(BASE_URL_ENV_VAR).replace(/\/+$/, '');
}

/**
 * Origin of the SIATWeb system the traversal arrives at, without a trailing
 * slash.
 *
 * The system is served by a *different* origin than the portal, so its arrival
 * URL has to be absolute: a route starting with a slash would resolve to the
 * portal's origin and would never land there. Required, with no default,
 * exactly like every variable the automation cannot run without.
 */
export function getSiatWebSystemOrigin(): string {
  return readRequiredVariable(SIATWEB_SYSTEM_ORIGIN_ENV_VAR).replace(/\/+$/, '');
}

/**
 * Tax inscription of the company the session has to represent.
 *
 * The portal only lets a session cross into the legacy system and on to the
 * SIATWeb system when it represents a company entitled to it, so which company
 * runs is part of the configuration rather than a detail of the test. Required,
 * with no default, and deliberately not written into versioned code: it is the
 * fiscal identifier of a real company.
 */
export function getCompanyInscription(): string {
  return readRequiredVariable(COMPANY_INSCRIPTION_ENV_VAR);
}

/**
 * Absolute path to the A1 certificate file, outside the repository.
 */
export function getCertificatePath(): string {
  return readRequiredVariable(CERTIFICATE_PATH_ENV_VAR);
}

/** Password that unlocks the A1 certificate. */
export function getCertificatePassword(): string {
  return readRequiredVariable(CERTIFICATE_PASSWORD_ENV_VAR);
}

/**
 * Origin of the certificate SSO host that the portal delegates to.
 *
 * The certificate is scoped to this origin alone, so it is never presented to
 * any other host.
 */
export function getCertificateSsoOrigin(): string {
  return readRequiredVariable(CERTIFICATE_SSO_ORIGIN_ENV_VAR).replace(/\/+$/, '');
}

/**
 * Punctuation a tax inscription is written with.
 *
 * The contributor dialog shows it punctuated and the export form's dropdown shows
 * it as bare digits (measured in spike 06), so the person may legitimately paste
 * either form and both have to resolve to the same number. Only the characters
 * that appear as punctuation are removed: anything else left over is a typo, not
 * formatting, and is reported instead of being silently discarded.
 */
const INSCRIPTION_PUNCTUATION = /[.\-/ \t]/g;

/**
 * Inscriptions whose export is to be scheduled, in the configured order.
 *
 * The order is the person's (spec requirement 20) and the scheduling follows it as
 * given, so the list is returned exactly as configured and never sorted.
 *
 * Returned as bare digits, matching what the form's dropdown carries, so the
 * comparison against the dropdown is a comparison of two identical shapes.
 *
 * The tuple type states what the reading already guarantees — a blank variable and
 * an empty item are both refused — so that a caller cannot forget to handle a list
 * with nothing in it.
 *
 * @throws MissingEnvironmentVariableError when the variable is absent or blank.
 * @throws InvalidEnvironmentValueError when the list is empty, an item is empty,
 * still carries non-digits after punctuation removal, or repeats an earlier one.
 */
export function getNfeExportInscriptions(): [string, ...string[]] {
  const rawList = readRequiredVariable(NFE_EXPORT_INSCRIPTIONS_ENV_VAR);
  const items = rawList.split(',');
  let inscriptions: [string, ...string[]] | undefined;
  // Positions are kept as text because a message has to name the item the person
  // has to fix, and the position is a place in a list, never a computed value.
  const firstPositionByInscription = new Map<string, string>();

  for (const [index, item] of items.entries()) {
    const position = String(index + 1);
    const digits = item.replace(INSCRIPTION_PUNCTUATION, '');

    if (digits === '') {
      throw new InvalidEnvironmentValueError(
        NFE_EXPORT_INSCRIPTIONS_ENV_VAR,
        `item ${position} is empty. Separate the inscriptions with commas.`,
      );
    }

    if (/\D/.test(digits)) {
      throw new InvalidEnvironmentValueError(
        NFE_EXPORT_INSCRIPTIONS_ENV_VAR,
        `item ${position} is not a tax inscription: it still has characters other than digits and punctuation.`,
      );
    }

    const firstPosition = firstPositionByInscription.get(digits);
    if (firstPosition !== undefined) {
      throw new InvalidEnvironmentValueError(
        NFE_EXPORT_INSCRIPTIONS_ENV_VAR,
        `item ${position} repeats item ${firstPosition}. Scheduling the same inscription twice would schedule the same export twice.`,
      );
    }

    firstPositionByInscription.set(digits, position);
    inscriptions = inscriptions === undefined ? [digits] : [...inscriptions, digits];
  }

  if (inscriptions === undefined) {
    throw new InvalidEnvironmentValueError(
      NFE_EXPORT_INSCRIPTIONS_ENV_VAR,
      'the list is empty, so there is no inscription to schedule.',
    );
  }

  return inscriptions;
}

/** Emission period the exports cover, as the form's own dd/mm/yyyy format. */
export interface EmissionPeriod {
  /** First emission date, in dd/mm/yyyy. */
  readonly start: string;

  /** Last emission date, in dd/mm/yyyy. */
  readonly end: string;
}

/**
 * Format the emission form displays and the person configures it in.
 *
 * Anchored and digit-counted so a malformed value is refused here, where the
 * variable is named, instead of being typed into the form and refused there.
 */
const EMISSION_DATE_FORMAT = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * A calendar date already proved to exist, as its UTC instant.
 *
 * The date is checked by round-tripping the parts through a UTC instant, which
 * rejects a day the calendar does not have (31/02 becomes 03/03) without any
 * timezone being able to shift the result.
 */
function parseEmissionDate(variableName: string, value: string): number {
  const parts = EMISSION_DATE_FORMAT.exec(value);

  if (parts === null) {
    throw new InvalidEnvironmentValueError(variableName, `"${value}" is not in dd/mm/yyyy format.`);
  }

  const [, dayText, monthText, yearText] = parts;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const instant = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(instant);

  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new InvalidEnvironmentValueError(
      variableName,
      `"${value}" is not a date the calendar has.`,
    );
  }

  return instant;
}

/**
 * Emission period every inscription of the list is scheduled for.
 *
 * The same pair of dates covers the whole list (spec requirement 24), so a
 * single period is read once. Both dates are required and neither has a
 * default: an invented period would schedule, in production, an export nobody
 * asked for.
 *
 * @throws MissingEnvironmentVariableError when either variable is absent.
 * @throws InvalidEnvironmentValueError when a date is malformed, is not a real
 * date, or the end date precedes the start date.
 */
export function getEmissionPeriod(): EmissionPeriod {
  const start = readRequiredVariable(NFE_EXPORT_EMISSION_START_ENV_VAR).trim();
  const end = readRequiredVariable(NFE_EXPORT_EMISSION_END_ENV_VAR).trim();

  const startInstant = parseEmissionDate(NFE_EXPORT_EMISSION_START_ENV_VAR, start);
  const endInstant = parseEmissionDate(NFE_EXPORT_EMISSION_END_ENV_VAR, end);

  if (endInstant < startInstant) {
    throw new InvalidEnvironmentValueError(
      NFE_EXPORT_EMISSION_END_ENV_VAR,
      `"${end}" precedes the start date "${start}". The period the person configured cannot be scheduled.`,
    );
  }

  return { start, end };
}
