/**
 * Failures raised while crossing from the e-AGEAT module into the legacy
 * system and from there to the SIATWeb system.
 *
 * The family lives in its own module, apart from the certificate login and from
 * the export screen, so a red test tells a lost session from a certificate or
 * portal problem. Inside the family there is no base class: what a report shows
 * is the class name and its message, so the name is what carries the stage that
 * failed. A lost session is not a case of a traversal that failed, either — it
 * names its own screen and its own company, so it carries them itself.
 */

/** Bound on the screen text quoted in a failure message, to keep it readable. */
const MAX_SCREEN_TEXT_LENGTH = 300;

/** The crossing landed on a screen the flow does not know. */
export class LegacyTraversalError extends Error {
  constructor(
    message: string,
    /** Visible text of the screen at the moment of the failure. */
    readonly screenText: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'LegacyTraversalError';
  }
}

/**
 * The session did not cross into the legacy system.
 *
 * Carries the screen text at the moment of the failure and the company the
 * session represented, because the company is the first suspect when the same
 * exit, outside a session that can traverse, lands on the "user not identified"
 * screen.
 */
export class LostSessionError extends Error {
  constructor(
    /** Company the session represented when the traversal failed. */
    readonly companyName: string,
    /** Visible text of the screen at the moment of the failure. */
    readonly screenText: string,
    cause?: unknown,
  ) {
    super(
      `The session was lost while crossing from the e-AGEAT module into the legacy ` +
        `system for the company "${companyName}". The company is the first suspect: ` +
        `the same exit, without a session representing a company that can traverse, ` +
        `lands on the "user not identified" screen.` +
        (screenText
          ? `\nScreen at the moment of the failure: ${screenText.slice(0, MAX_SCREEN_TEXT_LENGTH)}`
          : ''),
      { cause },
    );
    this.name = 'LostSessionError';
  }
}
