/**
 * Content-type <-> media-kind/extension mapping — pure deep module the worker's save step uses to
 * classify a downloaded, rendered creation (issue #208). Small and deliberately defensive: an
 * unrecognized or absent content-type NEVER throws, it degrades to a safe default.
 */

import type { MediaKind } from "../brand-asset/store.ts";

export type { MediaKind };

/** The `asset_media.kind` a content-type implies. Defaults to `"image"` for an absent/unrecognized
 *  content-type — every Recipe wired today renders images or (for the Character Explainer Recipe) one
 *  representative video; a stricter default would fail a legitimate render this module cannot classify
 *  from a content-type alone. */
export function mediaKindFromContentType(contentType: string | undefined): MediaKind {
  if (contentType?.startsWith("video/")) return "video";
  if (contentType?.startsWith("audio/")) return "audio";
  return "image";
}

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
};

/** The file extension (with leading dot) a content-type implies. Defaults to `.bin` for an
 *  absent/unrecognized content-type — never guesses. */
export function extensionForContentType(contentType: string | undefined): string {
  if (contentType === undefined) return ".bin";
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? ".bin";
}

const URL_EXTENSION_PATTERN = /\.([a-zA-Z0-9]{2,4})(?:\?.*)?$/;

/** Best-effort extension inference from a rendered creation's URL, tried BEFORE the download response's
 *  own content-type is known (a download target's filename is chosen up front). Reads a recognizable
 *  trailing `.ext`, ignoring a trailing query string; defaults to `.bin` when none is found. */
export function extensionFromUrl(url: string): string {
  const match = URL_EXTENSION_PATTERN.exec(url);
  return match ? `.${match[1]}` : ".bin";
}
