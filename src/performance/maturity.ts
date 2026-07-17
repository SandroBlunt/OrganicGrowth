/**
 * Asset maturity — pure deep module (issue #84, ADR-0011).
 *
 * The `posted → tracking → scored` transition is decided PER ASSET, from that Asset's OWN
 * `posted_at` (never a Brand- or Idea-wide clock): a Post younger than 7 days is `tracking` (measured,
 * but the numbers are still climbing); once it is 7+ days old its numbers have effectively settled, so
 * it becomes `scored` (final for the feedback loop) — `.claude/commands/track-performance.md`.
 */

/** A Post is considered settled ("scored") once it is this many days old. */
export const TRACKING_MATURITY_DAYS = 7;

/**
 * Days elapsed between `fromIso` and `nowIso` (fractional). Returns `null` if either timestamp does
 * not parse — never throws, never fabricates an age from a garbled timestamp (data-handling rule 4).
 */
export function daysSince(fromIso: string, nowIso: string): number | null {
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return null;
  return (now - from) / (1000 * 60 * 60 * 24);
}

/**
 * The Asset status a fresh tracking pull should set, from the Post's OWN `postedAtIso` age at
 * `nowIso`: `"tracking"` while younger than `TRACKING_MATURITY_DAYS`, `"scored"` once that old or
 * older. Returns `null` when either timestamp is unparseable — the caller must skip that Asset rather
 * than guess a status (never fabricate).
 */
export function assetMaturityStatus(postedAtIso: string, nowIso: string): "tracking" | "scored" | null {
  const days = daysSince(postedAtIso, nowIso);
  if (days === null) return null;
  return days >= TRACKING_MATURITY_DAYS ? "scored" : "tracking";
}
