import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { ageatWelcome } from './pages/factories';
import { buildSiatWebSystemArrivalUrlPattern } from './pages/siatweb-system.page';
import { enterAgeatLegacySystem, enterSiatWebSystem } from './support/ageat-legacy-traversal';

test('crosses from the e-AGEAT module to the legacy welcome screen', async ({
  certificatePage,
}) => {
  await loginWithCertificate(certificatePage);
  await enterAgeatLegacySystem(certificatePage);

  // The single thing this half of the traversal claims: the legacy welcome
  // screen on screen, proven by the marker measured in the inspection. It is
  // asserted again here, from what the person observes, exactly like the module
  // access spec proves its own arrival.
  const welcome = ageatWelcome(certificatePage);
  await expect(welcome.autoRegularizacaoMenuTrigger).toBeVisible();
});

test('reaches the SIATWeb system from the legacy welcome screen', async ({ certificatePage }) => {
  await loginWithCertificate(certificatePage);
  await enterAgeatLegacySystem(certificatePage);
  await enterSiatWebSystem(certificatePage);

  // The single thing the traversal claims: the SIATWeb system on screen, on
  // the configured origin. Nothing after arrival is clicked.
  await expect(certificatePage).toHaveURL(buildSiatWebSystemArrivalUrlPattern());
});
