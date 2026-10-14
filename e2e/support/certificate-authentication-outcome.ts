import { expect, type Page } from '@playwright/test';
import { LOGIN_PATH } from '../pages/siatweb-login.page';
import { siatWebApplicationPanel, siatWebLogin } from '../pages/factories';
import {
  UnmappedAuthenticationStepError,
  CertificateRejectedError,
  PortalUnavailableError,
} from './certificate-login-error';
import { getCertificateSsoOrigin } from './environment';
import { isOnPath } from './route';
import { CERTIFICATE_HANDOFF_TIMEOUT_MS, CERTIFICATE_SSO_SETTLE_TIMEOUT_MS } from './timeouts';

const CERTIFICATE_ERROR_PATH = '/painel-aplicacoes/certificado-erro';

/** Element whose visible text is the screen as the person reads it. */
const DOCUMENT_BODY = 'body';

/** Where the browser is in the certificate hand-off. */
type AuthenticationOutcome =
  'on-login-screen' | 'in-certificate-sso' | 'refused' | 'establishing-session' | 'authenticated';

function isSettled(outcome: AuthenticationOutcome): boolean {
  return outcome === 'refused' || outcome === 'authenticated';
}

/**
 * Tells the login screen apart from the authenticated panel.
 *
 * Both are served under `/painel-aplicacoes`, the login screen on that path and
 * the panel one below it, so only an exact comparison of the path tells them
 * apart — a prefix would accept both. The certificate entry is checked as well,
 * because the portal only offers it while nobody is signed in.
 */
async function isOnLoginScreen(page: Page): Promise<boolean> {
  if (!isOnPath(page.url(), LOGIN_PATH)) {
    return false;
  }

  try {
    const loginPage = siatWebLogin(page);
    return await loginPage.certificateEntry.isVisible();
  } catch {
    // The document is mid-navigation, so the screen cannot be told apart yet.
    return true;
  }
}

async function isApplicationPanelRendered(page: Page): Promise<boolean> {
  try {
    const panel = siatWebApplicationPanel(page);
    return await panel.isRendered();
  } catch {
    // The document is mid-navigation, so the panel cannot be told apart yet.
    return false;
  }
}

async function classifyOutcome(page: Page): Promise<AuthenticationOutcome> {
  const url = page.url();

  if (isOnPath(url, CERTIFICATE_ERROR_PATH)) {
    return 'refused';
  }

  if (url.startsWith(getCertificateSsoOrigin())) {
    return 'in-certificate-sso';
  }

  if (await isOnLoginScreen(page)) {
    return 'on-login-screen';
  }

  if (await isApplicationPanelRendered(page)) {
    return 'authenticated';
  }

  // Neither a known dead end nor a finished session. The certificate is already
  // accepted on this route: the portal answers the authorization code before it
  // can list the modules, serving a loading shell in the meantime.
  return 'establishing-session';
}

/**
 * Reads the visible text of the current screen, staying useful even when the
 * document is mid-navigation.
 */
export async function readVisibleText(page: Page): Promise<string> {
  try {
    return await page.locator(DOCUMENT_BODY).innerText();
  } catch (cause) {
    return `(the page could not be read: ${String(cause)})`;
  }
}

/**
 * Polls until the hand-off settles or the bound elapses, then reports the last
 * classification.
 *
 * A timeout is not fatal here: the classification afterwards names the exact
 * state the browser stayed in, which is more useful than a bare timeout.
 */
async function pollUntilSettled(page: Page, timeout: number): Promise<AuthenticationOutcome> {
  try {
    await expect.poll(async () => isSettled(await classifyOutcome(page)), { timeout }).toBe(true);
  } catch {
    // Reported by the classification below.
  }

  return classifyOutcome(page);
}

function raiseForRefusal(): never {
  throw new CertificateRejectedError(
    'The portal refused the certificate and redirected to the certificate error page.',
  );
}

async function raiseForUnmappedStep(page: Page): Promise<never> {
  throw new UnmappedAuthenticationStepError(
    'The certificate SSO host asked for something after the certificate was presented, ' +
      'and the login does not map that step yet.',
    await readVisibleText(page),
  );
}

/**
 * Waits for the portal to finish the certificate hand-off and confirms the
 * session really took.
 *
 * Polls on observable state only, never on elapsed time, and reports which of
 * the known dead ends was reached: the portal refusing the certificate, the SSO
 * host asking for an unmapped extra step, or the portal never answering.
 */
export async function awaitAuthenticatedSession(page: Page): Promise<void> {
  const afterHandoff = await pollUntilSettled(page, CERTIFICATE_HANDOFF_TIMEOUT_MS);

  if (afterHandoff === 'authenticated') {
    return;
  }

  if (afterHandoff === 'refused') {
    raiseForRefusal();
  }

  if (afterHandoff === 'on-login-screen') {
    throw new PortalUnavailableError(
      'The portal did not finish the certificate hand-off before the timeout.',
    );
  }

  const afterSso = await pollUntilSettled(page, CERTIFICATE_SSO_SETTLE_TIMEOUT_MS);

  if (afterSso === 'authenticated') {
    return;
  }

  if (afterSso === 'refused') {
    raiseForRefusal();
  }

  if (afterSso === 'in-certificate-sso') {
    await raiseForUnmappedStep(page);
  }

  if (afterSso === 'on-login-screen') {
    throw new PortalUnavailableError(
      'The browser went back to the login screen after the certificate hand-off.',
    );
  }

  throw new PortalUnavailableError(
    'The certificate was accepted, but the portal had not finished establishing the session when the wait ended.',
  );
}
