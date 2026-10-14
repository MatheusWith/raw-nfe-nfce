/**
 * Helpers for building URL expectations.
 *
 * A route is turned into a matcher in one module — the route comparison — so that
 * escaping, anchoring and prefixing are decided once instead of per screen.
 */

/** Escapes every regular-expression metacharacter in a literal string. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
