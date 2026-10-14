/**
 * Every bound the suite waits on, and the deadline they imply.
 *
 * They used to be private to the four modules that used them, which is reasonable
 * for two and not for seven. The Playwright configuration then derived the test
 * deadline by writing three of these numbers out again in a comment — and a comment
 * cannot contradict the code it describes, so it did: its own arithmetic came to
 * less than the deadline it claimed to sit above. The configuration imports from
 * here instead.
 *
 * Nothing in this module knows the portal. These are bounds, and a bound is a
 * ceiling a wait may reach without the run being wrong.
 */

/** Bound on leaving the login screen and reaching the certificate SSO host. */
export const CERTIFICATE_HANDOFF_TIMEOUT_MS = 60_000;

/**
 * Bound on the SSO host finishing its part of the hand-off.
 *
 * A short grace, because the browser legitimately sits on the Keycloak URL for a
 * moment while the certificate is processed. Only a host that stays there is a step
 * the login does not know about.
 */
export const CERTIFICATE_SSO_SETTLE_TIMEOUT_MS = 15_000;

/** Bound on the entry control of the legacy system appearing on the module. */
export const LEGACY_ENTRY_TIMEOUT_MS = 15_000;

/** Bound on the session reaching the welcome screen, or a documented dead end. */
export const LEGACY_ARRIVAL_TIMEOUT_MS = 60_000;

/** Bound on the session reaching the SIATWeb system after the option is clicked. */
export const SIATWEB_ARRIVAL_TIMEOUT_MS = 60_000;

/** Bound on the export screen being served after the menu item is activated. */
export const NF_EXPORT_SCREEN_TIMEOUT_MS = 60_000;

/**
 * Bound on the menu itself becoming usable, before the item is activated.
 *
 * The walk is three actions on elements the portal reveals by hovering, and none of
 * them was bounded: without this, an item that never becomes actionable waits out the
 * test's own deadline and the report names the deadline rather than the menu (measured
 * twice — 403 s inside a single `hover` with no request after it, and more than 8
 * minutes inside another one while the page was still loading). A bound turns that into
 * a failure that names the step.
 *
 * Short, like the other bounds on local behaviour: the walk is pointer movement over
 * elements already on screen, and it is measured at 1 s to 4 s on a healthy screen.
 */
export const MENU_WALK_TIMEOUT_MS = 15_000;

/**
 * Bound on the form being re-rendered by the postback the inscription selection fires.
 *
 * A portal postback, so it carries the same clock as the one the role's postback gets:
 * the whole form comes back in the response. Bounded because the flow writes the period
 * into the form this re-render leaves behind, and a postback that never lands would
 * leave the flow writing into a form the portal is about to replace — the race that
 * shipped an empty period twice before the body started being awaited.
 */
export const INSCRIPTION_RERENDER_TIMEOUT_MS = 60_000;

/**
 * Bound on the contributor form serving its own controls after the role is marked.
 *
 * The role is a postback and the form is served by it, so nothing on the form may be
 * assumed present at the instant the role is marked. This is the bound the form's own
 * arrival proof already uses, reused here so a check made after that proof waits on
 * the same clock the screen was given.
 */
export const FORM_CONTROLS_TIMEOUT_MS = 60_000;

/**
 * Bound on the emission fields settling on the period that was typed into them.
 *
 * The datepicker rewrites the field from its own parser once it has settled, so the
 * value is only worth reading after that has happened. A short grace: the rewrite is
 * local to the widget and does not cross the portal, so a field that never settles is
 * a field that mangled what it was given, and waiting longer would not change the
 * answer.
 */
export const EMISSION_PERIOD_TIMEOUT_MS = 15_000;

/**
 * Bound on the registration request leaving the browser once the button was clicked.
 *
 * Not a wait on the portal: the click itself issues the request, and what is bounded
 * here is the short span between the click and the request being on its way. It exists
 * because the confirmation that the request carried the configured period is a read of
 * the wire, and a request that never left has nothing to read — a bound makes that a
 * failure that says so, instead of the test's own deadline arriving later and naming
 * something else.
 */
export const EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS = 10_000;

/** Bound on the scheduled row showing up in the table after the screen is revisited. */
export const SCHEDULED_ROW_TIMEOUT_MS = 60_000;

/**
 * Bound on the notice leaving the screen once its acknowledgement is actuated.
 *
 * Playwright's own assertion timeout, declared here because the flow waits on it on
 * every visit to the export screen: the notice is served every time, twice per visit
 * on the revisit path — once over the notice the reload brought back, once over the
 * one the menu walk serves — and while it is up the menu cannot be used.
 */
export const NOTICE_DISMISSAL_TIMEOUT_MS = 5_000;

/**
 * Headroom over the waits themselves.
 *
 * The only number here that is not a measurement. It pays for two things the
 * declared bounds do not cover: the reads that name no bound of their own and
 * inherit Playwright's, and the ordinary variance of a run against a production
 * portal.
 */
export const TEST_DEADLINE_SLACK_MS = 60_000;

/**
 * Waits that every test crossing the portal pays, in the order it pays them.
 *
 * Listed rather than described so that a bound added here cannot be left out of a
 * chain: the test below fails when that happens.
 */
export const TRAVERSAL_WAIT_CHAIN_MS = [
  CERTIFICATE_HANDOFF_TIMEOUT_MS,
  CERTIFICATE_SSO_SETTLE_TIMEOUT_MS,
  LEGACY_ENTRY_TIMEOUT_MS,
  LEGACY_ARRIVAL_TIMEOUT_MS,
  SIATWEB_ARRIVAL_TIMEOUT_MS,
  MENU_WALK_TIMEOUT_MS,
  NF_EXPORT_SCREEN_TIMEOUT_MS,
] as const;

/**
 * Waits only the scheduling test pays, on top of the traversal it also pays.
 *
 * The export screen twice — the row that proves a request was registered exists only
 * on the visit after the one that made it, so that test crosses the same screen again
 * before it can read the table — and the menu walk that opens each of those crossings,
 * plus the re-render the inscription selection waits for, which the traversal never pays
 * because it does not schedule anything.
 */
const SCHEDULING_EXTRA_WAIT_CHAIN_MS = [
  NF_EXPORT_SCREEN_TIMEOUT_MS,
  MENU_WALK_TIMEOUT_MS,
  INSCRIPTION_RERENDER_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  EMISSION_PERIOD_TIMEOUT_MS,
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
  SCHEDULED_ROW_TIMEOUT_MS,
] as const;

/**
 * What one inscription of the configured list costs the scheduling cycle.
 *
 * The cycle pays this once per inscription, so it is the term that has to be right for
 * a longer list to stay inside its deadline. Eight waits, in the order one item pays
 * them: the menu walk opens the crossing, the screen arrives, the role is marked and
 * the form is served by that postback, the inscription is chosen and the form comes
 * back re-rendered, the period settles, and the registration request goes out. The row
 * wait is not in it — a row belongs to no single item, it is read on the visit that
 * closes the cycle.
 */
export const SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS = [
  MENU_WALK_TIMEOUT_MS,
  NF_EXPORT_SCREEN_TIMEOUT_MS,
  NOTICE_DISMISSAL_TIMEOUT_MS,
  NOTICE_DISMISSAL_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  INSCRIPTION_RERENDER_TIMEOUT_MS,
  EMISSION_PERIOD_TIMEOUT_MS,
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
] as const;

/** {@link SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS} as the single figure it sums to. */
export const SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS = sumBounds(SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS);

/**
 * What the visit that closes the scheduling cycle costs.
 *
 * One more crossing of the export screen and its form, and then the wait for the rows
 * this cycle registered. It is a term of its own because it is paid once however long
 * the list is, and folding it into the per-inscription term would overpay it by the
 * size of the list.
 */
export const SCHEDULED_CLOSING_VISIT_BOUNDS_MS = [
  MENU_WALK_TIMEOUT_MS,
  NF_EXPORT_SCREEN_TIMEOUT_MS,
  NOTICE_DISMISSAL_TIMEOUT_MS,
  NOTICE_DISMISSAL_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  SCHEDULED_ROW_TIMEOUT_MS,
] as const;

/** {@link SCHEDULED_CLOSING_VISIT_BOUNDS_MS} as the single figure it sums to. */
export const SCHEDULED_CLOSING_WAIT_CHAIN_MS = sumBounds(SCHEDULED_CLOSING_VISIT_BOUNDS_MS);

/** Every bound the suite declares, used to keep the chains honest. */
export const DECLARED_WAIT_BOUNDS_MS = [
  CERTIFICATE_HANDOFF_TIMEOUT_MS,
  CERTIFICATE_SSO_SETTLE_TIMEOUT_MS,
  LEGACY_ENTRY_TIMEOUT_MS,
  LEGACY_ARRIVAL_TIMEOUT_MS,
  SIATWEB_ARRIVAL_TIMEOUT_MS,
  MENU_WALK_TIMEOUT_MS,
  NF_EXPORT_SCREEN_TIMEOUT_MS,
  SCHEDULED_ROW_TIMEOUT_MS,
  FORM_CONTROLS_TIMEOUT_MS,
  INSCRIPTION_RERENDER_TIMEOUT_MS,
  EMISSION_PERIOD_TIMEOUT_MS,
  EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS,
  NOTICE_DISMISSAL_TIMEOUT_MS,
] as const;

function sumBounds(bounds: readonly number[]): number {
  return bounds.reduce((total, bound) => total + bound, 0);
}

/** The longest run of waits a single test can be sitting inside. */
export const LONGEST_WAIT_CHAIN_MS = sumBounds([
  ...TRAVERSAL_WAIT_CHAIN_MS,
  ...SCHEDULING_EXTRA_WAIT_CHAIN_MS,
]);

/**
 * Deadline for a single test against the production portal.
 *
 * The longest chain of waits plus headroom — and deliberately not the sum of every
 * bound the suite declares. The waits sit in alternatives: a session either arrives
 * at the welcome screen or lands on the lost-session screen, never both, and the
 * hand-off is only given a second chance when the first did not settle. Adding each
 * branch to each other would describe a run that cannot happen, while the real point
 * of the number is the opposite one — that a test which runs out of time has
 * exhausted the wait it was actually inside, and can therefore report the screen
 * that answered instead of a bare runner timeout.
 */
export const TEST_DEADLINE_MS = LONGEST_WAIT_CHAIN_MS + TEST_DEADLINE_SLACK_MS;

/**
 * Deadline for the scheduling cycle, for a list of the given size.
 *
 * The traversal is paid once, one pass per inscription is paid once per inscription,
 * the closing visit once, and headroom once. The alternative to this figure is a
 * hand-written number, which cannot be checked against the waits the flow actually
 * makes and was already wrong once in this suite — the figure the configuration
 * carried described a shorter run than the deadline it sat above.
 *
 * Deliberately not the sum of every declared bound per visit: the waits within a pass
 * are alternatives to each other, and adding each branch to each other would describe
 * a cycle that cannot happen. The property that matters is the opposite one — a cycle
 * that runs out of time has exhausted the wait it was inside, and can therefore report
 * the screen that answered instead of a bare runner timeout.
 *
 * @param inscriptionCount how many inscriptions the configured list carries.
 * @throws when the count is not a positive number: a cycle with nothing to schedule
 * would otherwise be granted just enough time to authenticate, and would then fail on
 * a screen it was never going to reach a verdict about.
 */
export function schedulingTestDeadlineMs(inscriptionCount: number): number {
  if (!Number.isInteger(inscriptionCount) || inscriptionCount < 1) {
    throw new RangeError(
      `The scheduling cycle deadline needs a positive number of inscriptions, and ` +
        `${String(inscriptionCount)} is not one. The list of inscriptions in ` +
        `E2E_NFE_EXPORT_INSCRIPTIONS arrived with a size the cycle cannot schedule.`,
    );
  }

  return (
    sumBounds(TRAVERSAL_WAIT_CHAIN_MS) +
    inscriptionCount * sumBounds(SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS) +
    sumBounds(SCHEDULED_CLOSING_VISIT_BOUNDS_MS) +
    TEST_DEADLINE_SLACK_MS
  );
}
