import { expect, test } from '@playwright/test';
import { isOnPath, originAndPathPattern, pathPrefixPattern } from '../support/route';

/**
 * Route comparison, on synthetic addresses, with no browser and no portal.
 *
 * The portal's own routes do not collide, so a suite that passes against
 * production is equally happy with a comparison that is wrong. What protects this
 * one is this file: it can build the collision the portal does not happen to serve
 * today.
 */

const PORTAL_ORIGIN = 'https://portal.example';
const SIATWEB_ORIGIN = 'https://siatweb.example';

/** The login screen, which is a prefix of the panel's path. */
const LOGIN_PATH = '/painel-aplicacoes';

/** The authenticated panel, one route below the login screen. */
const APPLICATION_PANEL_PATH = '/painel-aplicacoes/main';

/** The module route, which the portal completes with its own identifier. */
const MODULE_PATH_PREFIX = '/painel-aplicacoes/paginas/e-AGEAT/';

test.describe('isOnPath', () => {
  test('matches the path it is given', () => {
    expect(isOnPath(`${PORTAL_ORIGIN}${APPLICATION_PANEL_PATH}`, APPLICATION_PANEL_PATH)).toBe(
      true,
    );
    expect(isOnPath(`${PORTAL_ORIGIN}${LOGIN_PATH}`, LOGIN_PATH)).toBe(true);
  });

  test('does not accept a path that is only a prefix of the one given', () => {
    // The collision the portal serves: the login path is a prefix of the panel's,
    // so a comparison that accepted a prefix would read one screen as the other.
    expect(isOnPath(`${PORTAL_ORIGIN}${LOGIN_PATH}`, APPLICATION_PANEL_PATH)).toBe(false);
    expect(isOnPath(`${PORTAL_ORIGIN}${APPLICATION_PANEL_PATH}`, LOGIN_PATH)).toBe(false);
  });

  test('does not accept a path that extends the one given', () => {
    expect(isOnPath(`${PORTAL_ORIGIN}${MODULE_PATH_PREFIX}12`, LOGIN_PATH)).toBe(false);
  });

  test('ignores the query string and the fragment', () => {
    expect(isOnPath(`${PORTAL_ORIGIN}${LOGIN_PATH}?state=abc`, LOGIN_PATH)).toBe(true);
    expect(isOnPath(`${PORTAL_ORIGIN}${LOGIN_PATH}#top`, LOGIN_PATH)).toBe(true);
  });

  test('ignores the origin', () => {
    expect(isOnPath(`${SIATWEB_ORIGIN}${LOGIN_PATH}`, LOGIN_PATH)).toBe(true);
  });

  test('reports a document that has navigated nowhere as not on the route', () => {
    expect(isOnPath('about:blank', LOGIN_PATH)).toBe(false);
  });
});

test.describe('originAndPathPattern', () => {
  const arrivalPath = '/siatweb/faces/index.xhtml';
  const pattern = originAndPathPattern(SIATWEB_ORIGIN, arrivalPath);

  test('waits on the arrival it was built for', () => {
    expect(pattern.test(`${SIATWEB_ORIGIN}${arrivalPath}`)).toBe(true);
  });

  test('does not accept the same path served by the portal', () => {
    expect(pattern.test(`${PORTAL_ORIGIN}${arrivalPath}`)).toBe(false);
  });

  test('escapes an origin that carries regular-expression characters', () => {
    const awkwardOrigin = 'https://siatweb.example/a.b';
    const awkward = originAndPathPattern(awkwardOrigin, arrivalPath);

    expect(awkward.test(`${awkwardOrigin}${arrivalPath}`)).toBe(true);
    expect(awkward.test('https://siatweb.example/axb/faces/index.xhtml')).toBe(false);
  });
});

test.describe('pathPrefixPattern', () => {
  const pattern = pathPrefixPattern(MODULE_PATH_PREFIX);

  test('waits on the route the portal completes itself', () => {
    expect(pattern.test(`${PORTAL_ORIGIN}${MODULE_PATH_PREFIX}internal-id`)).toBe(true);
  });

  test('does not accept a route that only starts the same way', () => {
    expect(pattern.test(`${PORTAL_ORIGIN}/painel-aplicacoes/paginas`)).toBe(false);
  });
});
