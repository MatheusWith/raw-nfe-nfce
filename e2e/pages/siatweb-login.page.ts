import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Path of the unauthenticated application panel, which doubles as the login screen.
 *
 * Exported because the authentication outcome classifier has to recognise the
 * same route to tell the login screen apart from a session being established.
 */
export const LOGIN_PATH = '/painel-aplicacoes';

/** Visible label of the control that starts certificate authentication. */
const CERTIFICATE_ENTRY_NAME = 'CERTIFICADO DIGITAL';

/**
 * Public contract of the SIATWeb login screen.
 *
 * No arrival operation, and deliberately so: nothing on this screen marks the login
 * apart from a session still being established, which is served from the path above
 * it. An operation invented to fill the gap would claim a distinction the screen
 * cannot make. {@link SiatWebLoginPageContract.open} is the arrival proof instead —
 * it navigates and then proves the certificate way in is on the screen — and
 * {@link SiatWebLoginPageContract.expectCertificateEntryAvailable} is the readiness
 * check that follows it.
 *
 * Consumers depend on this contract rather than on the page object
 * implementation, so the object can be swapped without touching them.
 */
export interface SiatWebLoginPageContract {
  /** Control that starts certificate authentication. */
  readonly certificateEntry: Locator;

  open(): Promise<void>;

  /** Confirms the certificate way in is offered before anything is clicked. */
  expectCertificateEntryAvailable(): Promise<void>;

  startCertificateAuthentication(): Promise<void>;
}

/**
 * The SIATWeb login screen.
 *
 * It offers two independent ways in, separated by an "OU" divider: a
 * "CERTIFICADO DIGITAL" block that delegates to the certificate SSO host, and a
 * CPF/CNPJ plus password form. This page object models only the certificate
 * way in.
 */
export class SiatWebLoginPage implements SiatWebLoginPageContract {
  constructor(private readonly page: Page) {}

  /**
   * Control that starts certificate authentication. The portal renders it as a
   * submit input inside a clickable wrapper, so it is addressed by its visible
   * label rather than by its tag.
   */
  get certificateEntry(): Locator {
    return this.page.getByRole('button', { name: CERTIFICATE_ENTRY_NAME });
  }

  async open(): Promise<void> {
    await this.page.goto(LOGIN_PATH);
    await expect(this.certificateEntry).toBeVisible();
  }

  /** Confirms the certificate way in is offered before anything is clicked. */
  async expectCertificateEntryAvailable(): Promise<void> {
    await expect(this.certificateEntry).toBeEnabled();
  }

  async startCertificateAuthentication(): Promise<void> {
    await this.certificateEntry.click();
  }
}
