import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { siatWebApplicationPanel, siatWebLogin } from './pages/factories';

test('signs in with the A1 certificate', async ({ certificatePage }) => {
  await loginWithCertificate(certificatePage);

  // Both halves are asserted here rather than trusting the login helper alone:
  // the portal only offers certificate entry while nobody is signed in, and only
  // a live session lists the modules. Either half alone also holds on the
  // loading shell the callback route serves, so neither proves much by itself.
  const loginPage = siatWebLogin(certificatePage);
  await expect(loginPage.certificateEntry).toHaveCount(0);
  const panel = siatWebApplicationPanel(certificatePage);
  await expect(panel.moduleEntries.first()).toBeVisible();
});
