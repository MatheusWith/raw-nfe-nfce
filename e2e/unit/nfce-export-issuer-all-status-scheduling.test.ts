import { expect, test } from '@playwright/test';
import { allStatusSchedulingTestDeadlineMs } from '../support/nfce-export-issuer-all-status-scheduling';
import {
  DECLARED_WAIT_BOUNDS_MS,
  SCHEDULED_CLOSING_WAIT_CHAIN_MS,
  SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS,
  TEST_DEADLINE_SLACK_MS,
  TRAVERSAL_WAIT_CHAIN_MS,
} from '../support/timeouts';

/**
 * The deadline of the every-status cycle, as arithmetic, with no portal.
 *
 * The same property `timeouts.test.ts` holds the shared derivations to: the figure a
 * run is given has to be checkable against the waits that run really makes, because a
 * figure describing a shorter run than the one that runs was already wrong once in
 * this suite. This cycle's derivation lives beside its module rather than in
 * `timeouts.ts`, because it derives from *this cycle's shape* — the closing visit is
 * paid once **per item** here, not once for the list — and `timeouts.ts` owns bounds
 * and chains, not the shape of any one cycle.
 *
 * The constants are imported for the assertions rather than re-declared: a test that
 * summed a copy of the bounds could pass while the bounds themselves changed.
 */

const declaredTotalMs = DECLARED_WAIT_BOUNDS_MS.reduce((total, bound) => total + bound, 0);

function sum(chain: readonly number[]): number {
  return chain.reduce((total, bound) => total + bound, 0);
}

const traversalMs = sum(TRAVERSAL_WAIT_CHAIN_MS);

test.describe('the deadline of the every-status scheduling cycle', () => {
  test('one inscription gets the traversal, one pass, one proof visit and slack', () => {
    expect(allStatusSchedulingTestDeadlineMs(1)).toBe(
      traversalMs +
        SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS +
        SCHEDULED_CLOSING_WAIT_CHAIN_MS +
        TEST_DEADLINE_SLACK_MS,
    );
  });

  test('each extra inscription adds a pass and a proof visit, and nothing else', () => {
    // The line the whole derivation stands on: this cycle pays the proof visit per
    // item, so the per-item term is pass + proof visit for every item, while the
    // traversal and the slack are paid once no matter the list size.
    expect(allStatusSchedulingTestDeadlineMs(4) - allStatusSchedulingTestDeadlineMs(3)).toBe(
      SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS + SCHEDULED_CLOSING_WAIT_CHAIN_MS,
    );
  });

  test('the derivation grows linearly, so no item waits on the size of the list', () => {
    for (let count = 1; count <= 8; count += 1) {
      expect(allStatusSchedulingTestDeadlineMs(count)).toBe(
        traversalMs +
          count * (SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS + SCHEDULED_CLOSING_WAIT_CHAIN_MS) +
          TEST_DEADLINE_SLACK_MS,
      );
    }
  });

  test('a run is granted more than any single declared bound', () => {
    // A deadline below one of the waits it contains would expire mid-wait and report
    // a timeout instead of the step that was actually waiting.
    expect(allStatusSchedulingTestDeadlineMs(1)).toBeGreaterThan(
      Math.max(...DECLARED_WAIT_BOUNDS_MS),
    );
  });

  test('is not the naive sum of every declared bound at every item visit', () => {
    // The same guard the shared derivations hold to, in the shape this cycle needs:
    // each item's term (a pass and a proof visit) costs less than the whole suite's
    // declared total, and traversal plus headroom are paid once — so the figure stays
    // under one declared total per item plus one for the cycle itself. A derivation
    // that paid every declared bound at every visit would blow past that, and a list
    // twice as long would buy a deadline twice as long even though the waits inside
    // are alternatives, not a series.
    for (let count = 1; count <= 8; count += 1) {
      expect(allStatusSchedulingTestDeadlineMs(count)).toBeLessThanOrEqual(
        declaredTotalMs * (count + 1),
      );
    }
  });

  test('a list the cycle cannot schedule is refused, not granted a deadline', () => {
    expect(() => allStatusSchedulingTestDeadlineMs(0)).toThrow(RangeError);
    expect(() => allStatusSchedulingTestDeadlineMs(-1)).toThrow(RangeError);
    expect(() => allStatusSchedulingTestDeadlineMs(2.5)).toThrow(RangeError);
    expect(() => allStatusSchedulingTestDeadlineMs(Number.NaN)).toThrow(RangeError);
  });
});
