import { loginWithCertificate, expect, test } from './fixtures/certificate-login.fixture';
import { enterAgeatLegacySystem, enterSiatWebSystem } from './support/ageat-legacy-traversal';
import { getEmissionPeriod, getNfeExportInscriptions } from './support/environment';
import { schedulingTestDeadlineMs } from './support/timeouts';
import {
  scheduleEveryConfiguredExport,
  toExportTargets,
} from './support/nfce-export-issuer-scheduling';

/**
 * The on-demand mark, at the head of the title where `--grep-invert` reads it.
 *
 * It is written **literally, in the title**, and not built from a constant, hidden in
 * a project, a file name or a config flag, because the point is that the exclusion
 * survives every way of running the suite: a tag in the title is data the runner
 * already filters on, and a tool that greps the source finds it too. The same
 * literal is what `package.json` inverts, so the two agree by being the same string
 * rather than by one being derived from the other.
 *
 * The cost of the choice is real and is written down rather than hidden: someone who
 * invokes the runner directly — `npx playwright test`, the VS Code extension, or any
 * command without `--grep-invert` — schedules **every** on-demand cycle in the suite,
 * the NF-e ones and this one, which is real requests in production instead of none.
 * The commands in `package.json` all carry the inversion; anything outside them does
 * not. The list and the period read below are the same ones the NF-e flows are
 * configured with, so this run schedules the same inscriptions by the NFC-e branch.
 */
test('@on-demand schedules the export of every configured inscription on the NFC-e screen and finds its row', async ({
  certificatePage,
}) => {
  // Read from the environment before the browser opens, so a configuration problem
  // is reported as a configuration problem and not as a test that failed halfway
  // to the screen.
  const targets = toExportTargets(getNfeExportInscriptions());
  const period = getEmissionPeriod();

  // The deadline is the suite's, extended by what this cycle adds on top of the
  // traversal: one screen pass per configured inscription and one closing visit to
  // read the table. The same derivation the other cycles use, and derived here too
  // from the size of the list rather than written by hand, so it cannot describe a
  // cycle shorter than the one that runs.
  test.setTimeout(schedulingTestDeadlineMs(targets.length));

  await loginWithCertificate(certificatePage);
  await enterAgeatLegacySystem(certificatePage);
  await enterSiatWebSystem(certificatePage);

  const scheduledCount = await scheduleEveryConfiguredExport(certificatePage, targets, period);

  // The cycle's own claim: every configured inscription was scheduled on the NFC-e
  // screen. The cycle raises the first failure it met before getting here, so this is
  // the other half of the same statement — it fails when the cycle reports having
  // scheduled the list and left an item out.
  expect(scheduledCount).toBe(targets.length);
});
