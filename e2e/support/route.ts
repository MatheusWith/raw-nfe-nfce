import { escapeRegExp } from './regex';

/**
 * How a browser address is compared against a route, in one place.
 *
 * Exact by default, because the portal serves the login screen and the
 * authenticated application panel from the same path prefix: a comparison that
 * accepted a prefix would accept the login screen wherever the panel is meant to
 * be. That collision survives today only because a second condition happens to be
 * asked further along, and a collision that is masked is invisible to whoever adds
 * the next screen.
 *
 * Compared on the path rather than on the whole address, because an origin, a query
 * string or a fragment is not what tells one screen from another. Where the origin
 * is the discriminator it is compared as well.
 *
 * Two shapes, because two questions are asked. A screen the flow either *is* or is
 * not on is answered by a boolean, which a classifier polls. A screen the flow
 * *waits* for is answered by a matcher, so the assertion can keep retrying and can
 * print the address that arrived.
 */

/** Path of an address, without origin, query or fragment. */
function pathOf(url: string): string {
  return new URL(url).pathname;
}

/**
 * Tells whether the browser is on a path, exactly.
 *
 * A path that is a prefix of this one does not satisfy it. That is the point: the
 * login path is a prefix of the application panel's, and only an exact comparison
 * tells the two apart.
 */
export function isOnPath(url: string, path: string): boolean {
  return pathOf(url) === path;
}

/**
 * Matcher that an arrival assertion can wait on, for a route known exactly and
 * served by a known origin.
 *
 * Anchored at the origin, so a route of the same name on another host cannot
 * satisfy it, and escaped from the configured origin, which carries characters
 * that mean something to a regular expression.
 */
export function originAndPathPattern(origin: string, path: string): RegExp {
  return new RegExp(`^${escapeRegExp(origin)}${escapeRegExp(path)}`);
}

/**
 * Matcher that an arrival assertion can wait on, for a route the portal completes
 * itself.
 *
 * The deliberate exception to exactness, and named as one: the module route is
 * followed by the portal's own internal identifier, which the automation does not
 * know and must not guess. Reach for it only where the route genuinely has a tail
 * the portal fills in.
 */
export function pathPrefixPattern(pathPrefix: string): RegExp {
  return new RegExp(escapeRegExp(pathPrefix));
}
