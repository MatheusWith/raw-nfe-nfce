import { expect, test } from '@playwright/test';
import {
  DECLARED_WAIT_BOUNDS_MS,
  LONGEST_WAIT_CHAIN_MS,
  SCHEDULED_CLOSING_VISIT_BOUNDS_MS,
  SCHEDULED_CLOSING_WAIT_CHAIN_MS,
  SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS,
  SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS,
  TEST_DEADLINE_MS,
  TEST_DEADLINE_SLACK_MS,
  TRAVERSAL_WAIT_CHAIN_MS,
  schedulingTestDeadlineMs,
} from '../support/timeouts';

/**
 * The test deadline, as arithmetic, with no browser and no portal.
 *
 * A run against the portal cannot check this. It only ever runs the path where every
 * wait finishes early, so it is equally happy with a deadline derived from numbers
 * that have since changed — which is exactly what a hand-written number is. The
 * property that matters is the one asserted below: a test that runs out of time has
 * run out of the wait it was inside, and not of the runner's budget.
 */

/** Adds a list of bounds, the same way the module does. */
function sum(bounds: readonly number[]): number {
  return bounds.reduce((total, bound) => total + bound, 0);
}

test.describe('the test deadline', () => {
  test('is the longest chain of waits plus headroom', () => {
    expect(TEST_DEADLINE_MS).toBe(LONGEST_WAIT_CHAIN_MS + TEST_DEADLINE_SLACK_MS);
  });

  test('is above the longest chain of waits', () => {
    expect(TEST_DEADLINE_MS).toBeGreaterThan(LONGEST_WAIT_CHAIN_MS);
  });

  test('accounts for every bound the suite declares', () => {
    // The rot this exists to prevent: a bound added to the module and waited on by
    // a flow, but left out of every chain. The deadline would then be derived from a
    // run that never happens, and this fails instead of the production suite.
    expect(sum(DECLARED_WAIT_BOUNDS_MS)).toBeLessThanOrEqual(LONGEST_WAIT_CHAIN_MS);
  });

  test('is not the naive sum of every declared bound times every alternative', () => {
    // The waits sit in alternatives, so the naive figure describes no run that can
    // happen. Guarding it keeps the derivation honest about that.
    expect(LONGEST_WAIT_CHAIN_MS).toBeLessThan(sum(DECLARED_WAIT_BOUNDS_MS) * 2);
  });
});

/**
 * The scheduling cycle's deadline, which depends on how many inscriptions are
 * configured rather than on the suite.
 *
 * The same reason as above applies, and one more: the count comes from the
 * environment, so a wrong figure here is not caught by any run against the portal —
 * it is a number nobody wrote down, and a cycle long enough to need it would have to
 * be long enough to survive it before anyone noticed.
 */
test.describe('the scheduling cycle deadline', () => {
  test('is the traversal, one pass per inscription, the closing visit and headroom', () => {
    // The derivation itself, spelled out, so that a bound added to a pass and left
    // out of the sum fails here instead of producing a cycle that runs out of time
    // half-way down the list.
    expect(schedulingTestDeadlineMs(3)).toBe(
      sum(TRAVERSAL_WAIT_CHAIN_MS) +
        3 * SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS +
        SCHEDULED_CLOSING_WAIT_CHAIN_MS +
        TEST_DEADLINE_SLACK_MS,
    );
  });

  test('covers the traversal even for a single inscription', () => {
    // The traversal is paid once per cycle and is the largest single chain in it.
    // A short list must not buy a shorter login.
    expect(schedulingTestDeadlineMs(1)).toBeGreaterThan(LONGEST_WAIT_CHAIN_MS);
  });

  test('grows by exactly one pass per inscription', () => {
    // Linearity is the property that makes the deadline safe for any list length: an
    // extra inscription costs one screen visit and nothing else.
    expect(schedulingTestDeadlineMs(4) - schedulingTestDeadlineMs(3)).toBe(
      SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS,
    );
  });

  test('is not the naive sum of every declared bound times every visit', () => {
    // Same guard as the suite deadline, scaled by the number of visits the cycle
    // makes. Without it, a list twice as long would buy a deadline twice as long even
    // though the waits inside it are alternatives, not a series.
    expect(schedulingTestDeadlineMs(4)).toBeLessThan(sum(DECLARED_WAIT_BOUNDS_MS) * 5);
  });

  test('refuses a cycle with no inscriptions to schedule', () => {
    // A cycle that schedules nothing would otherwise get a deadline just long enough
    // to authenticate, and fail on a screen it was never going to reach a verdict
    // about. The configured list never arrives empty, so this only guards the
    // arithmetic.
    expect(() => schedulingTestDeadlineMs(0)).toThrow();
    expect(() => schedulingTestDeadlineMs(-1)).toThrow();
  });

  test('waits only on bounds the suite declares', () => {
    // The rot the suite deadline already guards against, applied to the cycle's two
    // chains. A bound a flow waits on but does not declare can never be found by
    // summing what is declared, and the deadline would then describe a shorter cycle
    // than the one that ran.
    const cycleBounds = [
      ...SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS,
      ...SCHEDULED_CLOSING_VISIT_BOUNDS_MS,
    ];
    for (const bound of cycleBounds) {
      expect(DECLARED_WAIT_BOUNDS_MS).toContain(bound);
    }
  });
});
