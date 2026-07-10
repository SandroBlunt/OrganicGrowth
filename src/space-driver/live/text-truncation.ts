/**
 * The ~1,900-char read-API truncation guard — pure deep module, no I/O (except the injected fetcher).
 *
 * `docs/producer-spikes-results.md` (Spike 3) found the Magnific read API truncates large text-node
 * values at ~1,900 characters; the sanctioned live capture confirms it (`02`'s `JSON Master` value is
 * cut off mid-JSON). A truncated value must never be silently trusted as complete. When the canvas
 * links out to the full content (a published Google-Doc URL, per the spike's documented mitigation) and
 * a fetcher is supplied, the full text is resolved from there instead; otherwise the truncated text is
 * returned explicitly flagged, so a caller can decide rather than being fooled.
 */

import { READ_API_TRUNCATION_CAP } from "../../execution-protocol/protocol.ts";

export { READ_API_TRUNCATION_CAP };

/** Whether a text value looks truncated by the read API's ~1,900-char cap. */
export function looksTruncated(text: string | undefined): boolean {
  if (text === undefined) return false;
  return text.length >= READ_API_TRUNCATION_CAP;
}

/** Fetches the full text of a linked document by URL (injected — never a bare global fetch in a test). */
export type DocFetcher = (url: string) => Promise<string>;

export interface RobustTextOptions {
  /** A linked document URL that holds the full content, if the canvas links out to one. */
  readonly linkedDocUrl?: string;
  /** Fetches `linkedDocUrl`'s full text. Required (with `linkedDocUrl`) to resolve past truncation. */
  readonly fetchDoc?: DocFetcher;
}

export interface RobustTextResult {
  /** The resolved text (may still be the truncated canvas value if no linked doc could be resolved). */
  readonly text: string | undefined;
  /** True when `text` is a truncated canvas read that could NOT be resolved to the full content. */
  readonly truncated: boolean;
  /** Where `text` came from. */
  readonly source: "canvas" | "linked-doc";
}

/**
 * Resolve a node's text robustly: pass through untouched text that isn't truncated; when it looks
 * truncated and a linked document + fetcher are available, fetch the full text from there (never
 * partially — the linked doc is trusted whole); otherwise return the truncated text with `truncated:
 * true` so the caller does not silently trust a partial read.
 */
export async function readNodeTextRobust(
  rawText: string | undefined,
  options: RobustTextOptions = {},
): Promise<RobustTextResult> {
  if (rawText === undefined) {
    return { text: undefined, truncated: false, source: "canvas" };
  }
  if (!looksTruncated(rawText)) {
    return { text: rawText, truncated: false, source: "canvas" };
  }
  if (options.linkedDocUrl !== undefined && options.fetchDoc !== undefined) {
    const full = await options.fetchDoc(options.linkedDocUrl);
    return { text: full, truncated: false, source: "linked-doc" };
  }
  return { text: rawText, truncated: true, source: "canvas" };
}
