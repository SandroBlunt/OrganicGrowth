/**
 * `resolvePostChannel` — resolves a Post's logged URL to a SPECIFIC Channel among a Brand's configured
 * Channels for that URL's platform (issue #243).
 *
 * `resolvePostPlatform` (`./resolve-post-platform.ts`) only ever narrows a Post's URL to a PLATFORM —
 * `facebook`, `instagram`, etc — from its hostname. Before this ticket, `src/importer/execute.ts`
 * looked up "the" Channel for that platform via a `platform -> channelId` map built by iterating a
 * Brand's Channel list in order (`executeChannels`'s old `channelIdByPlatform`) — the LAST Channel on a
 * platform silently won, a map has no way to remember "which one" once two entries share a key. A
 * Brand that ever configures TWO Channels on the same platform (the issue's own framing: "an ordinary
 * growth step, not an exotic case" — a second Facebook Page) would have every Post on that platform
 * silently attach to whichever Channel happened to be created last, pooling two audiences into one
 * Channel baseline (the `relative-not-absolute` always-rule depends on that baseline being right).
 *
 * ## The fork this ticket decided (see `openspec/changes/issue-243-channel-platform-resolution/
 * proposal.md` for the full argument)
 *
 * Specific resolution, NOT a `UNIQUE(brand_id, platform)` constraint on the `channel` table. A Brand
 * adding a second Page on a platform it already has one Channel for is legitimate (CONTEXT.md's own
 * Channel definition: "A Brand may list several"); a uniqueness constraint would make the importer
 * REFUSE that legitimate shape rather than fix the actual defect, which is imprecise resolution, not an
 * over-permissive schema.
 *
 * ## Why identifier matching is scoped to the AMBIGUOUS case only
 *
 * When a Brand has exactly ONE Channel configured for a Post's resolved platform, that Channel is
 * returned directly — no identifier check at all. Two reasons:
 *
 *   1. There is nothing to disambiguate: a single candidate is trivially the specific answer, and this
 *      is exactly the shape both real Brands have today for every platform.
 *   2. Real data proves identifier matching is not always possible even for a genuinely correct match.
 *      Straw Motion's own real, already-published Post for Idea `idea-2026-W32-10`
 *      (`https://www.facebook.com/122096865609396192/posts/122114019723396192`) carries a DIFFERENT
 *      numeric Facebook Page id than the one recorded on that Brand's own configured Channel
 *      (`https://www.facebook.com/profile.php?id=61591885769033`) — a verified real Facebook quirk (a
 *      Page can expose more than one valid internal numeric id, depending which permalink shape
 *      generated the link), not a data error on either side. Requiring an identifier match even in the
 *      single-Channel case would make this real, correct Post refuse to import. Identifier matching
 *      therefore only runs once a Brand's own Channel list makes platform alone genuinely ambiguous —
 *      exactly the case this ticket exists to close.
 *
 * ## Per-platform identifier extraction (`extractChannelIdentifier`)
 *
 * A small, explicit, per-platform rule, applied identically to a Channel's own configured `url` and to
 * a Post's `post_url` — if the SAME identifier comes out of both, they name the same real Page/Channel.
 * Returns `null` (never a guess) for a blank/unparseable URL, or a URL shape that carries no reliably
 * owner-identifying segment (e.g. a bare `youtube.com/watch?v=...` link, or an `instagram.com/p/<code>/`
 * canonical share link) — those cases are handled by refusing to disambiguate, never by falling back to
 * hostname/insertion-order.
 *
 * ## The ambiguous case's escape hatch: `alternateUrls` (QA round 1's Defect 1 fix)
 *
 * The single-Channel fast path above protects `idea-2026-W32-10` only until a SECOND Facebook Channel is
 * configured — the day that happens, its Post genuinely becomes ambiguous, and `url` alone cannot
 * describe a Page that legitimately answers to more than one valid id. `ChannelIdentity.alternateUrls`
 * (`brand-profile.yaml`'s per-Channel `alternate_urls` list) is the Operator's configurable way to say
 * "this Channel ALSO answers to that id" — checked identically to `url` itself (same
 * `extractChannelIdentifier` rule), but ONLY inside the ambiguous (2+ Channels) branch, never in the
 * single-Channel fast path (nothing needs disambiguating there). This is what makes a Brand with two
 * Channels on one platform, where a real Post carries an alternate id, CONFIGURABLE into a working state
 * — via `brand-profile.yaml`, never by editing the Post's own logged `post_url` (explicit-attribution).
 * A Post whose identifier still matches nothing (or matches more than one Channel, e.g. a misconfigured
 * duplicate `alternate_urls` entry) still refuses to resolve to a SPECIFIC Channel — this module never
 * softens that into a guess; see `plan-idea.ts`'s `planAssetPost` for what happens next (issue #243
 * round 2: an unresolvable Post is reported, not silently dropped, but does NOT block the rest of the
 * plan the way it did before).
 *
 * Pure: no I/O, no network, deterministic.
 */

import { resolvePostPlatform } from "./resolve-post-platform.ts";
import type { KnownPlatform } from "../copy/platform-shape.ts";

/** The minimum a Channel needs to be resolved against — a structural subset of
 *  `src/importer/plan.ts`'s `ChannelPlanItem` (which also carries `isPrimary`, irrelevant here). Defined
 *  in THIS module, not imported from `plan.ts`, so `plan.ts` (which imports `planIdea` from
 *  `plan-idea.ts`, which imports this module) never becomes part of a runtime import cycle — `plan.ts`'s
 *  `ChannelPlanItem[]` is structurally assignable here without either module importing the other's
 *  value exports.
 *
 *  `alternateUrls` (issue #243's Defect 1 fix) — OPTIONAL, omitted when a Channel configures none — is
 *  this Channel's list of OTHER URLs it is also known to answer to (`brand-profile.yaml`'s per-Channel
 *  `alternate_urls`). Checked identically to `url` itself, but ONLY in the ambiguous (2+ Channels on one
 *  platform) case below — never in the unambiguous single-Channel case, where nothing is checked at all.
 *  It exists because a Channel's `url` alone cannot always describe a real account: Straw Motion's own
 *  real, already-imported Post `idea-2026-W32-10` carries a DIFFERENT valid Facebook Page id than its
 *  Channel's configured `url` (see this module's own doc comment above) — harmless today because a
 *  single configured Channel needs no identifier match at all, but the day a SECOND Facebook Channel is
 *  configured, that same Post becomes genuinely ambiguous and `url` alone can no longer describe it.
 *  `alternateUrls` is the Operator's way to say "this Channel also answers to that id" WITHOUT editing
 *  ledger data — the Post's own logged `post_url` stays untouched (explicit-attribution). */
export interface ChannelIdentity {
  readonly platform: KnownPlatform;
  readonly url: string;
  readonly alternateUrls?: readonly string[];
}

/**
 * `kind` (issue #243 round 2 — QA round 1's Defect 1) distinguishes WHY a resolution refused, so a
 * caller can decide how serious that refusal is:
 *   - `"unknown-platform"` / `"no-configured-channel"` — the Post's platform itself is wrong or
 *     unconfigured; NOT what a Channel's `alternate_urls` can ever fix. `plan-idea.ts`'s `planAssetPost`
 *     keeps these as BLOCKING problems, unchanged from #240's original behavior.
 *   - `"ambiguous"` — 2+ Channels exist for the resolved platform and identifier-matching could not pick
 *     exactly one. This IS the Operator-configurable gap `alternate_urls` exists to close, and
 *     `planAssetPost` reports it (never blocks the rest of the plan) rather than refusing outright — see
 *     `plan.ts`'s own top-of-file doc comment for the full "report vs refuse" argument.
 */
export type ResolvePostChannelRefusalKind = "unknown-platform" | "no-configured-channel" | "ambiguous";

export type ResolvePostChannelResult =
  | { readonly ok: true; readonly platform: KnownPlatform; readonly channelIndex: number }
  | { readonly ok: false; readonly reason: string; readonly kind: ResolvePostChannelRefusalKind };

function firstPathSegment(pathname: string): string | null {
  const segment = pathname.split("/").find((s) => s.length > 0);
  return segment !== undefined ? segment.toLowerCase() : null;
}

function secondPathSegment(pathname: string): string | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  return segments.length > 1 ? segments[1]!.toLowerCase() : null;
}

/** Facebook path segments that are URL SHAPE, never an identifier of their own — `permalink.php`'s own
 *  identity lives in its `id`/`story_fbid` query params (handled before this set is even consulted);
 *  `watch`/`reel`/`share` front a piece of CONTENT, not a Page. */
const FACEBOOK_NON_IDENTIFIER_SEGMENTS = new Set([
  "permalink.php",
  "profile.php",
  "photo.php",
  "story.php",
  "sharer.php",
  "share",
  "watch",
  "reel",
  "groups",
  "pages",
  "events",
]);
const INSTAGRAM_CANONICAL_SEGMENTS = new Set(["p", "reel", "reels", "tv", "stories"]);
const X_NON_IDENTIFIER_SEGMENTS = new Set(["i", "home", "explore", "intent", "search"]);
const YOUTUBE_LOOKUP_SEGMENTS = new Set(["channel", "c", "user"]);

/**
 * Extracts a platform-specific owner identifier from one URL — the numeric Facebook Page id, the
 * `@handle` (YouTube/TikTok/X-adjacent path forms), the vanity slug (X, LinkedIn company Pages), etc.
 * Returns `null` when `url` is blank, does not parse, or is a shape that carries no such identifier at
 * all (never a guess — the caller refuses to disambiguate rather than falling back to anything else).
 */
export function extractChannelIdentifier(platform: KnownPlatform, rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (platform === "facebook") {
    const idParam = url.searchParams.get("id");
    if (idParam !== null && idParam.trim().length > 0) return idParam.trim();
    const segment = firstPathSegment(url.pathname);
    if (segment === null || FACEBOOK_NON_IDENTIFIER_SEGMENTS.has(segment)) return null;
    return segment; // a numeric Page id (the alternate permalink shape) or a vanity Page name
  }

  if (platform === "instagram") {
    const segment = firstPathSegment(url.pathname);
    if (segment === null || INSTAGRAM_CANONICAL_SEGMENTS.has(segment)) return null;
    return segment;
  }

  if (platform === "youtube") {
    const segment = firstPathSegment(url.pathname);
    if (segment === null) return null;
    if (segment.startsWith("@")) return segment.slice(1);
    if (YOUTUBE_LOOKUP_SEGMENTS.has(segment)) return secondPathSegment(url.pathname);
    return null; // watch/shorts/embed links carry no channel-owning identifier
  }

  if (platform === "linkedin") {
    const segment = firstPathSegment(url.pathname);
    if (segment === null) return null;
    if (segment === "posts") {
      const second = secondPathSegment(url.pathname);
      if (second === null) return null;
      const company = second.split("_")[0];
      return company !== undefined && company.length > 0 ? company : null;
    }
    if (segment === "company" || segment === "in") return secondPathSegment(url.pathname);
    return null; // e.g. /feed/update/urn:li:activity:.../ carries no vanity slug
  }

  if (platform === "x") {
    const segment = firstPathSegment(url.pathname);
    if (segment === null || X_NON_IDENTIFIER_SEGMENTS.has(segment)) return null;
    return segment;
  }

  // platform === "tiktok"
  const segment = firstPathSegment(url.pathname);
  if (segment === null || !segment.startsWith("@")) return null;
  return segment.slice(1);
}

/**
 * Every identifier `channel` is known to answer to — its own `url`, plus each of its (optional)
 * `alternateUrls` (issue #243's Defect 1 fix) — run through the SAME per-platform extraction rule. A
 * blank/unparseable URL (its own or an alternate) contributes nothing (never a guess); duplicates are
 * harmless since callers only ever check `.includes(...)`.
 */
function channelIdentifiers(platform: KnownPlatform, channel: ChannelIdentity): readonly string[] {
  const ids: string[] = [];
  const own = extractChannelIdentifier(platform, channel.url);
  if (own !== null) ids.push(own);
  for (const alt of channel.alternateUrls ?? []) {
    const id = extractChannelIdentifier(platform, alt);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Resolves `postUrl` to a specific Channel among `channels` (a Brand's FULL Channel list, in the SAME
 * order it is/will be created in — a returned `channelIndex` is that array's index, not a database id).
 * Refuses — never defaults to the first/last/any candidate — when `postUrl`'s platform matches none of
 * `channels`, or matches more than one and identifier extraction cannot pick exactly one.
 */
export function resolvePostChannel(postUrl: string, channels: readonly ChannelIdentity[]): ResolvePostChannelResult {
  const platform = resolvePostPlatform(postUrl);
  if (platform === null) {
    return { ok: false, kind: "unknown-platform", reason: `post_url "${postUrl}" does not resolve to any known platform` };
  }

  const candidates = channels.map((channel, index) => ({ channel, index })).filter((c) => c.channel.platform === platform);
  if (candidates.length === 0) {
    return {
      ok: false,
      kind: "no-configured-channel",
      reason: `post_url "${postUrl}" resolves to platform "${platform}", which this Brand has no configured Channel for`,
    };
  }
  if (candidates.length === 1) {
    // Unambiguous: nothing to disambiguate — see this module's own doc comment for why identifier
    // matching is deliberately SKIPPED here, not merely "not yet needed".
    return { ok: true, platform, channelIndex: candidates[0]!.index };
  }

  // 2+ Channels on the same platform: genuine ambiguity — resolve specifically by identifier, or refuse.
  const postIdentifier = extractChannelIdentifier(platform, postUrl);
  if (postIdentifier === null) {
    return {
      ok: false,
      kind: "ambiguous",
      reason: `post_url "${postUrl}" carries no extractable ${platform} identifier, and this Brand has ${candidates.length} configured "${platform}" Channels — cannot disambiguate`,
    };
  }

  const matches = candidates.filter((c) => channelIdentifiers(platform, c.channel).includes(postIdentifier));
  if (matches.length === 0) {
    return {
      ok: false,
      kind: "ambiguous",
      reason: `post_url "${postUrl}" identifier "${postIdentifier}" matches none of this Brand's ${candidates.length} configured "${platform}" Channels`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      kind: "ambiguous",
      reason: `post_url "${postUrl}" identifier "${postIdentifier}" matches ${matches.length} of this Brand's configured "${platform}" Channels — ambiguous`,
    };
  }
  return { ok: true, platform, channelIndex: matches[0]!.index };
}
