/**
 * Shot List media collection — the News Short Script Recipe's own "render" step (issue #174,
 * ADR-0021).
 *
 * A Space-less Recipe has no Space to drive; its "render" work is instead collecting the Shot List's
 * media: **best-effort** download (video preferred — i.e. whatever the author identified as the
 * specific clip for a beat), landing the file in the Asset's `.output/` bundle when it succeeds, and
 * falling back to a clearly-marked link when it can't be pulled (streaming-only sources are common) or
 * when the author identified no specific media at all for that beat. **A failed download never fails
 * the job** (ADR-0021's own words) — every beat always resolves to either `"downloaded"` or `"link"`,
 * never an exception escaping this module.
 *
 * Sequential, not parallel — mirrors `asset/download.ts`'s own one-thing-at-a-time posture — but, unlike
 * `downloadAssetFiles` (which THROWS on the first failure, appropriate for a Space's own required
 * render), this module never throws: a Shot List beat with no usable media is still a valid, useful
 * result (the Operator gets a link to click instead of a downloaded file).
 *
 * `download` is injectable so tests never hit the network — the default implementation uses the global
 * `fetch`.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs/safe-io.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One successful media download's bytes, plus an optional content-type hint used to guess a file
 *  extension. */
export interface ShotListDownloadOk {
  readonly ok: true;
  readonly bytes: Uint8Array;
  readonly contentType?: string;
}

/** A failed download attempt — never thrown, always this shape. */
export interface ShotListDownloadFailure {
  readonly ok: false;
  readonly error: string;
}

/** The outcome of attempting to fetch one media URL's bytes. */
export type ShotListDownloadAttempt = ShotListDownloadOk | ShotListDownloadFailure;

/** Fetches one URL's bytes. Injectable so tests never hit the network — the default implementation
 *  (`defaultShotListDownload`) uses the global `fetch`. MAY throw; `collectShotListMedia` catches it. */
export type ShotListDownloader = (url: string) => Promise<ShotListDownloadAttempt>;

/** Why a beat's media resolved to a link instead of a downloaded file. */
export type ShotListLinkReason = "no_media_url" | "download_failed";

/** One beat's collected media outcome — either a downloaded local file, or a clearly-marked link. */
export type ShotListMediaOutcome =
  | { readonly kind: "downloaded"; readonly url: string; readonly filename: string; readonly path: string }
  | { readonly kind: "link"; readonly url: string; readonly reason: ShotListLinkReason; readonly error?: string };

/** One beat's full collection result — its role, source page, and how its media resolved. */
export interface ShotListBeatResult {
  readonly beatIndex: number;
  readonly role: string;
  readonly sourceUrl: string;
  readonly showCue: string;
  readonly media: ShotListMediaOutcome;
}

/** Options for `collectShotListMedia`. */
export interface CollectShotListMediaOptions {
  /** Defaults to `defaultShotListDownload` (a real `fetch`-based downloader). Tests inject a local fake. */
  readonly download?: ShotListDownloader;
}

// ---------------------------------------------------------------------------
// The default, fetch-based downloader
// ---------------------------------------------------------------------------

/** A real, network-backed downloader — the production default. Never used in this Recipe's own tests
 *  (they always inject a local fake — see `shot-list-media.test.ts`). */
export async function defaultShotListDownload(url: string): Promise<ShotListDownloadAttempt> {
  const response = await fetch(url);
  if (!response.ok) {
    return { ok: false, error: `${response.status} ${response.statusText}` };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? undefined;
  return { ok: true, bytes, ...(contentType !== undefined ? { contentType } : {}) };
}

// ---------------------------------------------------------------------------
// Filename inference
// ---------------------------------------------------------------------------

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Guess a file extension from the response content-type, falling back to the URL's own path
 *  extension, falling back to `.bin` when neither is usable. Never throws. */
function guessExtension(url: string, contentType: string | undefined): string {
  if (contentType !== undefined) {
    const bare = contentType.split(";")[0]?.trim().toLowerCase();
    if (bare !== undefined && bare in EXTENSION_BY_CONTENT_TYPE) {
      return EXTENSION_BY_CONTENT_TYPE[bare]!;
    }
  }
  try {
    const pathname = new URL(url).pathname;
    const match = /\.[a-zA-Z0-9]{2,5}$/.exec(pathname);
    if (match !== null) return match[0].toLowerCase();
  } catch {
    // malformed URL — fall through to the generic default below
  }
  return ".bin";
}

/** The downloaded-media filename for one beat, 1-based and zero-padded (e.g. `"beat-02-media.mp4"`) —
 *  keeps files in beat order when listed on disk. */
function filenameFor(beatIndex: number, url: string, contentType: string | undefined): string {
  const n = String(beatIndex + 1).padStart(2, "0");
  return `beat-${n}-media${guessExtension(url, contentType)}`;
}

// ---------------------------------------------------------------------------
// collectShotListMedia
// ---------------------------------------------------------------------------

/**
 * Collect every beat's Shot List media into `destDir` (created if absent), best-effort:
 *
 * - a beat with NO `media_url` resolves to `{ kind: "link", reason: "no_media_url" }`, pointing at its
 *   `source_url` — nothing is attempted;
 * - a beat WITH a `media_url` is attempted via `download` (or `defaultShotListDownload`); on success the
 *   bytes are written to `destDir` and the beat resolves to `{ kind: "downloaded", ... }`; on failure —
 *   whether `download` returns `{ ok: false }` OR throws — the beat resolves to
 *   `{ kind: "link", reason: "download_failed", error }`, pointing at the `media_url` itself.
 *
 * NEVER throws (ADR-0021: "a failed download never fails the job") — every beat always resolves to one
 * of the two outcomes above. Sequential (not parallel), preserving `spec.beats`'s own order in the
 * returned array.
 */
export async function collectShotListMedia(
  spec: NewsShortScriptSpec,
  destDir: string,
  options: CollectShotListMediaOptions = {},
): Promise<readonly ShotListBeatResult[]> {
  const download = options.download ?? defaultShotListDownload;
  const results: ShotListBeatResult[] = [];

  for (let i = 0; i < spec.beats.length; i += 1) {
    const beat = spec.beats[i]!;

    if (beat.media_url === undefined) {
      results.push({
        beatIndex: i,
        role: beat.role,
        sourceUrl: beat.source_url,
        showCue: beat.show_cue,
        media: { kind: "link", url: beat.source_url, reason: "no_media_url" },
      });
      continue;
    }

    let attempt: ShotListDownloadAttempt;
    try {
      attempt = await download(beat.media_url);
    } catch (err: unknown) {
      attempt = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!attempt.ok) {
      results.push({
        beatIndex: i,
        role: beat.role,
        sourceUrl: beat.source_url,
        showCue: beat.show_cue,
        media: { kind: "link", url: beat.media_url, reason: "download_failed", error: attempt.error },
      });
      continue;
    }

    await mkdir(destDir, { recursive: true });
    const filename = filenameFor(i, beat.media_url, attempt.contentType);
    const path = join(destDir, filename);
    await writeFileAtomic(path, Buffer.from(attempt.bytes));
    results.push({
      beatIndex: i,
      role: beat.role,
      sourceUrl: beat.source_url,
      showCue: beat.show_cue,
      media: { kind: "downloaded", url: beat.media_url, filename, path },
    });
  }

  return results;
}

/** The ordered local file paths of every DOWNLOADED beat's media, in beat order — ready to feed
 *  `LedgerAssetRecord.asset_paths` (issue #102's own durable-local-path convention). A beat that
 *  resolved to a link contributes nothing. */
export function downloadedMediaPaths(results: readonly ShotListBeatResult[]): readonly string[] {
  return results
    .filter((r): r is ShotListBeatResult & { media: Extract<ShotListMediaOutcome, { kind: "downloaded" }> } =>
      r.media.kind === "downloaded",
    )
    .map((r) => r.media.path);
}
