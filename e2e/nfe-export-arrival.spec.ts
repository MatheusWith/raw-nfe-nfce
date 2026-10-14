import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { siatWebNfeExport } from './pages/factories';
import { enterAgeatLegacySystem, enterSiatWebSystem } from './support/ageat-legacy-traversal';
import { openNfeExportScreen } from './support/nfe-export-arrival';

test('reaches the NF-e export screen with its notice dismissed', async ({ certificatePage }) => {
  await loginWithCertificate(certificatePage);
  await enterAgeatLegacySystem(certificatePage);
  await enterSiatWebSystem(certificatePage);
  await openNfeExportScreen(certificatePage);

  // The single thing this test claims: the NF-e export screen is open, on the
  // form it opens with, and the notice is no longer on it. No field is filled,
  // no choice is marked and nothing is scheduled, so the test can be repeated at
  // any time without leaving anything behind in the portal.
  const screen = siatWebNfeExport(certificatePage);
  await expect(screen.arrivalMarker).toBeVisible();
  await expect(screen.noticeAcknowledgement).toBeHidden();
});
