import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { enterAgeatLegacySystem, enterSiatWebSystem } from './support/ageat-legacy-traversal';
import { getEmissionPeriod, getNfeExportInscriptions } from './support/environment';
import { schedulingTestDeadlineMs } from './support/timeouts';
import { scheduleEveryConfiguredExport, toExportTargets } from './support/nfe-export-scheduling';

test('schedules the export of every configured inscription and finds its row', async ({
  certificatePage,
}) => {
  // Read from the environment before the browser opens, so a configuration problem
  // is reported as a configuration problem and not as a test that failed halfway
  // to the screen.
  const targets = toExportTargets(getNfeExportInscriptions());
  const period = getEmissionPeriod();

  // The deadline is the suite's, extended by what this cycle adds on top of the
  // traversal: one screen pass per configured inscription and one closing visit to
  // read the table. Derived from the size of the list rather than written here, so it
  // cannot describe a cycle shorter than the one that runs.
  test.setTimeout(schedulingTestDeadlineMs(targets.length));

  await loginWithCertificate(certificatePage);
  await enterAgeatLegacySystem(certificatePage);
  await enterSiatWebSystem(certificatePage);

  const scheduledCount = await scheduleEveryConfiguredExport(certificatePage, targets, period);

  // The cycle's own claim, from the spec that owns it: every inscription configured was
  // scheduled. The cycle raises the first failure it met before getting here, so this
  // is the other half of the same statement — it fails when the cycle reports having
  // scheduled the list and left an item out.
  expect(scheduledCount).toBe(targets.length);
});
