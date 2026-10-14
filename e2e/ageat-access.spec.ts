import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { ageatModule, siatWebLogin } from './pages/factories';
import { openAgeatModule } from './support/ageat-module-access';

test('opens the e-AGEAT module from a certificate session', async ({ certificatePage }) => {
  await loginWithCertificate(certificatePage);
  await openAgeatModule(certificatePage);

  // The module is served from the same application panel as the login screen, so
  // the address is checked against the module route and against the login route
  // separately: being on a module URL says nothing on its own if the session had
  // silently fallen back to the login screen.
  const modulePage = ageatModule(certificatePage);
  await modulePage.expectModuleRoute();
  const loginPage = siatWebLogin(certificatePage);
  await expect(loginPage.certificateEntry).toHaveCount(0);

  // Exactly one marker of the module page, as the acceptance criterion requires.
  await modulePage.expectOpen();
});
