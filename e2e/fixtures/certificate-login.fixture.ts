import { readFileSync } from 'node:fs';
import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { siatWebLogin } from '../pages/factories';
import { awaitAuthenticatedSession } from '../support/certificate-authentication-outcome';
import {
  CertificateRejectedError,
  PortalUnavailableError,
} from '../support/certificate-login-error';
import {
  getCertificatePassword,
  getCertificatePath,
  getCertificateSsoOrigin,
  CERTIFICATE_PATH_ENV_VAR,
} from '../support/environment';

interface SiatWebFixtures {
  /** Context able to present the A1 certificate during the TLS handshake. */
  certificateContext: BrowserContext;
  /** Page created in {@link certificateContext}, which is per test. */
  certificatePage: Page;
}

/**
 * Client certificates offered to the browser.
 *
 * Scoped to the certificate SSO host, so the A1 is never presented to any other
 * origin, including the portal itself. The file is read into memory rather than
 * referenced by path, which keeps the passphrase out of any browser argument.
 */
function buildClientCertificates(): NonNullable<BrowserContextOptions['clientCertificates']> {
  const certificatePath = getCertificatePath();
  let pfx: Buffer;

  try {
    pfx = readFileSync(certificatePath);
  } catch (cause) {
    throw new CertificateRejectedError(
      `The A1 certificate could not be read from the path in ${CERTIFICATE_PATH_ENV_VAR}.`,
      cause,
    );
  }

  return [
    {
      origin: getCertificateSsoOrigin(),
      pfx,
      passphrase: getCertificatePassword(),
    },
  ];
}

export const test = base.extend<SiatWebFixtures>({
  certificateContext: async ({ browser }, use) => {
    let context: BrowserContext;

    try {
      context = await browser.newContext({ clientCertificates: buildClientCertificates() });
    } catch (cause) {
      // Playwright reports an unusable PFX while building the context, so the
      // refusal happens before any navigation and is diagnosed here.
      throw new CertificateRejectedError(
        `The browser refused the A1 certificate configured in ${CERTIFICATE_PATH_ENV_VAR}. ` +
          'It may be corrupt, or the password may be wrong.',
        cause,
      );
    }

    await use(context);
    await context.close();
  },

  certificatePage: async ({ certificateContext }, use) => {
    await use(await certificateContext.newPage());
  },
});

export { expect };

/**
 * Signs in to SIATWeb with the A1 certificate.
 *
 * Tests call this explicitly instead of relying on a hook, so authentication
 * appears in the report as named steps and no session is shared between tests.
 */
export async function loginWithCertificate(page: Page): Promise<void> {
  const loginPage = siatWebLogin(page);

  await test.step('Open the SIATWeb login screen', async () => {
    try {
      await loginPage.open();
    } catch (cause) {
      throw new PortalUnavailableError(
        'The SIATWeb login screen could not be opened. The portal may be down.',
        cause,
      );
    }
  });

  await test.step('Confirm the certificate way in is offered', async () => {
    await loginPage.expectCertificateEntryAvailable();
  });

  await test.step('Present the A1 certificate to the certificate SSO host', async () => {
    try {
      await loginPage.startCertificateAuthentication();
    } catch (cause) {
      // The certificate is only presented once the browser reaches the SSO host,
      // so a failure here means the portal was never left, not that the
      // certificate was judged. The classifier below owns that diagnosis.
      throw new PortalUnavailableError(
        'The certificate entry could not be activated, so the browser never reached the certificate SSO host.',
        cause,
      );
    }
  });

  await test.step('Confirm the session is authenticated', async () => {
    await awaitAuthenticatedSession(page);
  });
}
