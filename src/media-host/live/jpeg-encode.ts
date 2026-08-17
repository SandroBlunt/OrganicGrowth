/**
 * The `jpeg-js` wrapper (issue #209) — the one place this codebase calls the ONE new runtime
 * dependency this ticket adds.
 *
 * Baseline JPEG encoding (DCT + Huffman coding) is genuinely hard to get byte-correct by hand, and this
 * module's output is a real, live, publicly-posted social-media image (via Zoho) — unlike
 * `png-decode.ts`'s bounded, well-specified chunk-walk-and-unfilter, hand-rolling an encoder here would
 * trade a known dependency for an unverified one. `jpeg-js` is pure JavaScript (no native bindings, so
 * no per-platform prebuilt binary and nothing to compile — it runs identically wherever Node runs),
 * carries zero dependencies of its own, and is BSD-3-Clause licensed. See this ticket's Build Report for
 * the full justification against this repo's "stay dependency-free" default.
 */

import { encode } from "jpeg-js";

/** Encode row-major RGBA pixels into a JPEG buffer. `quality` is `jpeg-js`'s own 0–100 scale (higher is
 *  better quality, larger file); defaults to 90 — visually near-lossless, well above what a feed image
 *  needs, still far smaller than the source PNG. */
export function encodeJpeg(rgba: Buffer, width: number, height: number, quality = 90): Buffer {
  return encode({ data: rgba, width, height }, quality).data;
}
