import type { Page } from '@playwright/test';
import { readVisibleText } from './certificate-authentication-outcome';

/**
 * How a flow says "this screen did not arrive, and here is what answered instead".
 *
 * Arriving somewhere and reading where you landed are two different questions, and
 * the second is only worth asking once the first has failed. Both arrivals in the
 * suite repeated that contour whole: prove it, catch, read the screen, name the dead
 * end. What differs between them is which dead end the screen is, and that belongs
 * to the flow — so only the contour is shared, and the screen text is read once,
 * here, instead of once per arrival in whatever shape each one had grown.
 */
export async function expectArrival(
  page: Page,
  proveArrival: () => Promise<void>,
  describeDeadEnd: (screenText: string) => Error,
): Promise<void> {
  try {
    await proveArrival();
  } catch {
    throw describeDeadEnd(await readVisibleText(page));
  }
}
