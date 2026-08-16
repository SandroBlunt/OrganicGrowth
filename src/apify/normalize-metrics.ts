/**
 * Defensive Apify field-mapping — pure deep module (issue #48, extended issue #84).
 *
 * Apify actor output schemas vary per platform (data-handling rule 4: "Actor input/output schemas
 * vary; read the returned JSON and map fields defensively"). These pure functions map ONE raw Apify
 * dataset item (already-parsed JSON, `unknown`) from the Facebook / Instagram / YouTube actors this
 * repo uses — `apify/facebook-post-scraper` (one Facebook post), `apify/instagram-scraper` +
 * `apify/instagram-post-scraper` (peer posts / one post), and `streamers/youtube-scraper` (peer
 * videos / one video); see `templates/brand-skeleton/seeds.yaml` for the actor slugs — into the four
 * metrics CONTEXT.md's "Performance" and the Performance Score formula
 * (`.claude/agents/performance-tracker.md`) use everywhere else in this repo: shares, comments,
 * reactions, views.
 *
 * Field names were confirmed against live Apify runs for Instagram/YouTube (see the issue #48
 * change's handoff for the runs; sample outputs are captured, sanitized, in `src/apify/fixtures/`):
 *   - Instagram (`apify/instagram-scraper` / `apify/instagram-post-scraper`): `likesCount` →
 *     reactions, `commentsCount` → comments, `videoPlayCount` (falling back to `videoViewCount`) →
 *     views (non-video posts carry neither — 0, not an error).
 *   - YouTube (`streamers/youtube-scraper`): `likes` → reactions, `commentsCount` → comments,
 *     `viewCount` → views.
 *
 * Facebook (`mapFacebookItem`, issue #84) maps `likes` → reactions, `comments` → comments, `shares` →
 * shares, `viewsCount` → views, `time` (falling back to the Unix-seconds `timestamp`) → postedAt — per
 * the Apify Store's DOCUMENTED output schema for `apify/facebook-post-scraper`/
 * `apify/facebook-posts-scraper`. Unlike Instagram/YouTube's mapping, this is **not yet verified
 * against a live sanctioned capture** (no `.env` Apify token was exercised for this slice — hermetic
 * build, issue #84) — `src/apify/fixtures/facebook-post.synthetic-sample.json` is a SYNTHETIC fixture
 * built from that documented shape, not a real capture. Flagged as a follow-up: verify against a real
 * run the way issue #48 did for Instagram/YouTube.
 *
 * Neither Instagram nor YouTube publicly exposes a share count (unlike Facebook's own `shares`
 * field), so `shares` is always 0 for both — noted, never fabricated (rule 8).
 *
 * Any other missing/invalid numeric field defaults to 0 and is recorded in `notes` rather than
 * silently vanishing or crashing the caller (data-handling rule 4: "missing → 0, note it").
 */

/** The four public metrics + identity fields every Apify item normalizes to. */
export interface NormalizedMetrics {
  /** The item's own public URL, or `null` if the raw item carried none. */
  readonly url: string | null;
  /** ISO-ish timestamp the actor reported (verbatim, not reformatted), or `null` if absent. */
  readonly postedAt: string | null;
  readonly shares: number;
  readonly comments: number;
  readonly reactions: number;
  readonly views: number;
  /** One entry per field that was missing/invalid and defaulted to 0 (data-handling rule 4). */
  readonly notes: readonly string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** The first candidate that is a finite, non-negative number — else `undefined` (never guessed). */
function firstFiniteNonNegative(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return undefined;
}

/** Resolve a numeric field from `candidates`, defaulting to 0 and noting it when none are usable. */
function numberField(candidates: unknown[], label: string, notes: string[]): number {
  const found = firstFiniteNonNegative(...candidates);
  if (found !== undefined) return found;
  notes.push(`${label} missing/invalid on this item — defaulted to 0`);
  return 0;
}

function noPublicShareCount(platform: string): string {
  return `shares — ${platform} does not publicly expose a share count — always 0`;
}

/**
 * Map one raw Instagram dataset item (from `apify/instagram-scraper` or
 * `apify/instagram-post-scraper` — both share the same output shape) to `NormalizedMetrics`.
 *
 * Pure and defensive: `raw` is `unknown` and never throws, even for `null`/garbled input.
 */
export function mapInstagramItem(raw: unknown): NormalizedMetrics {
  const obj = isObject(raw) ? raw : {};
  const notes: string[] = [];

  const reactions = numberField([obj.likesCount], "reactions (likesCount)", notes);
  const comments = numberField([obj.commentsCount], "comments (commentsCount)", notes);
  const views = numberField(
    [obj.videoPlayCount, obj.videoViewCount],
    "views (videoPlayCount/videoViewCount — absent on non-video posts)",
    notes,
  );
  notes.push(noPublicShareCount("Instagram"));

  return {
    url: stringOrNull(obj.url),
    postedAt: stringOrNull(obj.timestamp),
    shares: 0,
    comments,
    reactions,
    views,
    notes,
  };
}

/**
 * Map one raw YouTube dataset item (from `streamers/youtube-scraper`, used for both a channel's
 * video list and a single video URL) to `NormalizedMetrics`.
 *
 * Pure and defensive: `raw` is `unknown` and never throws, even for `null`/garbled input.
 */
export function mapYoutubeItem(raw: unknown): NormalizedMetrics {
  const obj = isObject(raw) ? raw : {};
  const notes: string[] = [];

  const reactions = numberField([obj.likes], "reactions (likes)", notes);
  const comments = numberField([obj.commentsCount], "comments (commentsCount)", notes);
  const views = numberField([obj.viewCount], "views (viewCount)", notes);
  notes.push(noPublicShareCount("YouTube"));

  return {
    url: stringOrNull(obj.url),
    postedAt: stringOrNull(obj.date),
    shares: 0,
    comments,
    reactions,
    views,
    notes,
  };
}

/** Convert a Unix-seconds timestamp to an ISO-8601 string, or `null` for a non-finite/garbled value. */
function isoFromUnixSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Map one raw Facebook dataset item (from `apify/facebook-post-scraper` — one post by URL — or
 * `apify/facebook-posts-scraper` — an account's recent posts, same output shape) to
 * `NormalizedMetrics`. Unlike Instagram/YouTube's mapping, Facebook's field names here are NOT yet
 * verified against a live sanctioned capture — see the module docstring.
 *
 * Pure and defensive: `raw` is `unknown` and never throws, even for `null`/garbled input.
 */
export function mapFacebookItem(raw: unknown): NormalizedMetrics {
  const obj = isObject(raw) ? raw : {};
  const notes: string[] = [];

  const reactions = numberField([obj.likes], "reactions (likes)", notes);
  const comments = numberField([obj.comments], "comments (comments)", notes);
  const shares = numberField([obj.shares], "shares (shares)", notes);
  const views = numberField(
    [obj.viewsCount],
    "views (viewsCount — absent on non-video posts)",
    notes,
  );

  return {
    url: stringOrNull(obj.url),
    postedAt: stringOrNull(obj.time) ?? isoFromUnixSeconds(obj.timestamp),
    shares,
    comments,
    reactions,
    views,
    notes,
  };
}
