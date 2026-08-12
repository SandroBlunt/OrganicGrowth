/**
 * News Carousel real-media fetch-first-fallback resolution — a pure(-ish), injectable-downloader deep
 * module implementing ADR-0024's own decision (issue #188): "the producer tries the story's own source
 * first ... if real media can't be fetched or is too low quality, the producer falls back straight to a
 * generated slide" — with **no pause for the Operator, either way**.
 *
 * Mirrors `src/asset/shot-list-media.ts`'s own News Short Script precedent almost exactly: an
 * INJECTABLE downloader (`download`) so tests never hit the network, a default `fetch`-based
 * implementation for production, and a NEVER-THROW contract — every attempted slide always resolves to
 * either `"fetched"` or `"fallback"`, never an exception escaping this module. Unlike
 * `collectShotListMedia` (which attempts every beat, falling back to a LINK), a fallback here demotes
 * the slide straight to a fully generated one — there is no third "link" option for a News Carousel
 * slide's media.
 *
 * A `"generated"`-kind slide (or a slide carrying no `kind` at all — the implied default,
 * `news-carousel-contract.ts`'s `slideKind`) has nothing to fetch: `resolveCarouselSlideMedia` returns
 * `null` for it without ever calling `download`.
 *
 * **Quality, not just reachability.** ADR-0024 explicitly names "too low quality" as its own fallback
 * trigger, distinct from "unreachable". This module's proxy for "quality" is deliberately simple and
 * mechanical (never a subjective judgement call inside a pure function): a minimum byte-size floor per
 * kind (`MIN_IMAGE_BYTES`/`MIN_VIDEO_BYTES` — screens out an empty/near-empty/placeholder response) and,
 * when the response carries a `content-type` header, that its top-level family matches the slide's own
 * kind (an `image`-kind slide fetching back `text/html` — a redirect to an error page, say — is
 * unreachable in substance even though the HTTP request itself "succeeded").
 *
 * `applyCarouselMediaResolutions` is the last step: given a candidate Spec plus this module's own
 * resolutions, it returns the Spec with every FALLEN-BACK slide demoted to `kind: "generated"` (its
 * `source_url` dropped) and every successfully-fetched slide left exactly as authored — the resulting
 * Spec's `kind` fields are therefore already the RESOLVED, post-fallback truth by the time it is
 * validated/saved (`news-carousel-contract.ts`'s own doc comment), so `hasVideoSlide` (and therefore
 * Schedule Batch eligibility, `src/schedule-batch/eligibility.ts`) reads the Asset's ACTUAL rendered
 * shape, never an unresolved authoring intent.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs/safe-io.ts";
import type { CarouselSlide, NewsCarouselSpec } from "../production-spec/news-carousel-contract.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One successful media download's bytes, plus an optional content-type hint. */
export interface CarouselMediaDownloadOk {
  readonly ok: true;
  readonly bytes: Uint8Array;
  readonly contentType?: string;
}

/** A failed download attempt — never thrown, always this shape. */
export interface CarouselMediaDownloadFailure {
  readonly ok: false;
  readonly error: string;
}

/** The outcome of attempting to fetch one media URL's bytes. */
export type CarouselMediaDownloadAttempt = CarouselMediaDownloadOk | CarouselMediaDownloadFailure;

/** Fetches one URL's bytes. Injectable so tests never hit the network — the default implementation
 *  (`defaultCarouselMediaDownload`) uses the global `fetch`. MAY throw; callers here catch it. */
export type CarouselMediaDownloader = (url: string) => Promise<CarouselMediaDownloadAttempt>;

/** Why a slide fell back to a fully generated one. */
export type CarouselMediaFallbackReason = "unreachable" | "low_quality";

/** One slide's real-media resolution outcome — either a downloaded local file, or a fallback (with
 *  the demoted kind it falls back TO, always `"generated"`). */
export type CarouselMediaOutcome =
  | { readonly kind: "fetched"; readonly path: string; readonly filename: string; readonly contentType?: string }
  | { readonly kind: "fallback"; readonly reason: CarouselMediaFallbackReason; readonly error?: string };

/** One slide's full real-media resolution — only produced for a slide whose EFFECTIVE kind was
 *  `"image"` or `"video"`; a `"generated"` slide has no resolution at all (see module doc). */
export interface CarouselMediaResolution {
  readonly slideIndex: number;
  readonly role: string;
  readonly requestedKind: "image" | "video";
  readonly sourceUrl: string;
  /** The kind this slide will actually render as, post-fallback: the requested kind on success, or
   *  `"generated"` on any fallback. */
  readonly resolvedKind: "image" | "video" | "generated";
  readonly outcome: CarouselMediaOutcome;
}

/** Options for `resolveCarouselSlideMedia`/`resolveCarouselMedia`. */
export interface ResolveCarouselMediaOptions {
  /** Defaults to `defaultCarouselMediaDownload` (a real `fetch`-based downloader). Tests inject a local fake. */
  readonly download?: CarouselMediaDownloader;
}

// ---------------------------------------------------------------------------
// The default, fetch-based downloader
// ---------------------------------------------------------------------------

/** A real, network-backed downloader — the production default. Never used in this module's own tests
 *  (they always inject a local fake). */
export async function defaultCarouselMediaDownload(url: string): Promise<CarouselMediaDownloadAttempt> {
  const response = await fetch(url);
  if (!response.ok) {
    return { ok: false, error: `${response.status} ${response.statusText}` };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? undefined;
  return { ok: true, bytes, ...(contentType !== undefined ? { contentType } : {}) };
}

// ---------------------------------------------------------------------------
// Quality proxy — a minimum byte floor per kind, plus a content-type family check
// ---------------------------------------------------------------------------

/** Minimum bytes for a fetched IMAGE to count as adequate quality — a proxy screening out an
 *  empty/near-empty/placeholder response, never a real judgement of visual quality (that needs a
 *  human or a vision model, out of scope for this pure module). */
export const MIN_IMAGE_BYTES = 20_000;

/** Minimum bytes for a fetched VIDEO to count as adequate quality — same proxy, a higher floor since a
 *  real video clip is never this small. */
export const MIN_VIDEO_BYTES = 200_000;

function isAdequateQuality(kind: "image" | "video", bytes: Uint8Array, contentType: string | undefined): boolean {
  const minBytes = kind === "image" ? MIN_IMAGE_BYTES : MIN_VIDEO_BYTES;
  if (bytes.length < minBytes) return false;
  if (contentType !== undefined) {
    const family = contentType.split(";")[0]?.split("/")[0]?.trim().toLowerCase();
    if (family !== undefined && family.length > 0 && family !== kind) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Filename inference (mirrors shot-list-media.ts's own convention)
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

/** The downloaded-media filename for one slide, 1-based and zero-padded (e.g. `"slide-04-media.jpg"`) —
 *  keeps files in slide order when listed on disk. */
function filenameFor(slideIndex: number, url: string, contentType: string | undefined): string {
  const n = String(slideIndex + 1).padStart(2, "0");
  return `slide-${n}-media${guessExtension(url, contentType)}`;
}

// ---------------------------------------------------------------------------
// resolveCarouselSlideMedia / resolveCarouselMedia
// ---------------------------------------------------------------------------

/** The narrow slide shape this module needs — a subset of `CarouselSlide`. */
export type CarouselSlideLike = Pick<CarouselSlide, "slide_index" | "role" | "kind" | "source_url">;

/**
 * Resolve ONE slide's real media, fetch-first-fallback (ADR-0024). Returns `null` immediately — no
 * `download` call at all — for a slide whose EFFECTIVE kind is `"generated"` (absent `kind` included).
 * For an `"image"`/`"video"`-kind slide: attempts `download(slide.source_url)` (or
 * `defaultCarouselMediaDownload`); on success AND adequate quality, writes the bytes into `destDir`
 * (created if absent) and resolves `"fetched"`; on any failure — unreachable (a thrown error, a
 * `{ ok: false }` result, or a missing/blank `source_url`) or low quality — resolves `"fallback"` with
 * the specific reason, WITHOUT writing anything to disk. **Never throws; never pauses for input.**
 */
export async function resolveCarouselSlideMedia(
  slide: CarouselSlideLike,
  destDir: string,
  options: ResolveCarouselMediaOptions = {},
): Promise<CarouselMediaResolution | null> {
  const requestedKind = slide.kind;
  if (requestedKind !== "image" && requestedKind !== "video") return null;

  const sourceUrl = slide.source_url ?? "";
  const base = { slideIndex: slide.slide_index, role: slide.role, requestedKind, sourceUrl } as const;

  if (sourceUrl.trim().length === 0) {
    return {
      ...base,
      resolvedKind: "generated",
      outcome: { kind: "fallback", reason: "unreachable", error: "no source_url" },
    };
  }

  const download = options.download ?? defaultCarouselMediaDownload;
  let attempt: CarouselMediaDownloadAttempt;
  try {
    attempt = await download(sourceUrl);
  } catch (err: unknown) {
    attempt = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!attempt.ok) {
    return {
      ...base,
      resolvedKind: "generated",
      outcome: { kind: "fallback", reason: "unreachable", error: attempt.error },
    };
  }

  if (!isAdequateQuality(requestedKind, attempt.bytes, attempt.contentType)) {
    return { ...base, resolvedKind: "generated", outcome: { kind: "fallback", reason: "low_quality" } };
  }

  await mkdir(destDir, { recursive: true });
  const filename = filenameFor(slide.slide_index, sourceUrl, attempt.contentType);
  const path = join(destDir, filename);
  await writeFileAtomic(path, Buffer.from(attempt.bytes));

  return {
    ...base,
    resolvedKind: requestedKind,
    outcome: { kind: "fetched", path, filename, ...(attempt.contentType !== undefined ? { contentType: attempt.contentType } : {}) },
  };
}

/**
 * Resolve every `"image"`/`"video"`-kind slide of a News Carousel Spec's `slides`, sequential (not
 * parallel — mirrors `collectShotListMedia`'s own one-thing-at-a-time posture), preserving slide order.
 * A `"generated"`-kind slide (or one with no `kind` at all) contributes NOTHING to the returned array —
 * there is nothing to resolve for it. Never throws.
 */
export async function resolveCarouselMedia(
  spec: { readonly slides: readonly CarouselSlideLike[] },
  destDir: string,
  options: ResolveCarouselMediaOptions = {},
): Promise<readonly CarouselMediaResolution[]> {
  const out: CarouselMediaResolution[] = [];
  for (const slide of spec.slides) {
    const resolution = await resolveCarouselSlideMedia(slide, destDir, options);
    if (resolution !== null) out.push(resolution);
  }
  return out;
}

// ---------------------------------------------------------------------------
// applyCarouselMediaResolutions — the last step: bake the resolved kind back into the Spec
// ---------------------------------------------------------------------------

/**
 * Apply a batch of `resolveCarouselMedia` resolutions back onto the Spec they were resolved from,
 * returning a NEW Spec (pure, never mutates the input) whose every slide's `kind` is already the
 * RESOLVED, post-fallback truth: a successfully-fetched slide is left exactly as authored (`kind`/
 * `source_url` unchanged); a fallen-back slide is demoted to `kind: "generated"` with `source_url`
 * dropped entirely (never a stray leftover pointing at media that was never actually used); a slide
 * with no matching resolution (i.e. it was already `"generated"`) is left untouched. By the time the
 * returned Spec is validated/saved, `hasVideoSlide` reads the Asset's ACTUAL rendered shape.
 */
export function applyCarouselMediaResolutions(
  spec: NewsCarouselSpec,
  resolutions: readonly CarouselMediaResolution[],
): NewsCarouselSpec {
  const bySlideIndex = new Map(resolutions.map((r) => [r.slideIndex, r]));
  return {
    slides: spec.slides.map((slide) => {
      const resolution = bySlideIndex.get(slide.slide_index);
      if (resolution === undefined || resolution.outcome.kind === "fetched") return slide;
      const { source_url: _dropped, ...rest } = slide;
      return { ...rest, kind: "generated" };
    }),
  };
}
