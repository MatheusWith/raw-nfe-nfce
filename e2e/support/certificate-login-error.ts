/**
 * Failures that the SIATWeb login can produce.
 *
 * The family lives in its own module, apart from the traversal and the export
 * screen, so a red test tells a certificate the portal refused from a portal that
 * is not answering. Inside the family there is no base class: what a report shows
 * is the class name and its message, so the name is what carries the stage that
 * failed, and a base under it would only be a category nothing reads.
 */

/** The certificate could not be read, or the portal refused it. */
export class CertificateRejectedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'CertificateRejectedError';
  }
}

/** The portal itself did not answer as expected, independent of the certificate. */
export class PortalUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'PortalUnavailableError';
  }
}

/** The portal presented a step after the certificate that the login does not map yet. */
export class UnmappedAuthenticationStepError extends Error {
  constructor(
    message: string,
    readonly visibleText: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'UnmappedAuthenticationStepError';
  }
}
