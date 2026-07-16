/**
 * FAKE Magnific Space — a synthetic `spaces_state` fixture standing in for the live "AI News" Space
 * (the News Carousel Recipe, issue #60). THIS IS PART OF THE MAGNIFIC FAKE: hermetic, no live
 * `spaces_*` calls, no credits, no board mutation (CLAUDE.md build pipeline; ADR-0003/0004).
 *
 * Mirrors `space-state.ts`'s pattern exactly (only the fields the parser reads: node `id`/`name`, and
 * `value` on the two text nodes that carry content). Node NAMES and the extractor→generator wiring
 * follow the REAL, captured "AI News" board (issue #60's pre-tidy dump,
 * `space-driver/fixtures/live-captures-ai-news/00-spaces_state.pre-tidy.txt`) using the Operator's
 * CANONICAL post-tidy names:
 *   - `JSON Master` — the Spec-injection text node (same convention as the wired Space).
 *   - `Image Prompt Slide 1`..`Image Prompt Slide 7` — per-slide prompt extractors, each fed directly
 *     by `JSON Master` (verified: the real dump's `JSON Master #2` node has a direct connection to
 *     every `Image Prompt Slide N` node).
 *   - `Slide 1 Generator`..`Slide 7 Generator` — one production image generator per slide (the Operator
 *     is trimming the real board's 2-3 candidate generators per slide down to one, canonically named).
 *   - `Carousel Prompt Guide` — the Space's own writing guide for the slide JSON shape (real dump:
 *     `Assistant Prompt #2`) — read-only reference; the parser/driver never touches it.
 *   - `Brand Logo` — the brand-mark reference creation (real dump: `Straw_motion_logo`) — read-only
 *     reference; not a run-point.
 *   - `Producer Protocol` — holds `canonicalCarouselProtocol()` (SEVEN gateless run-points, one per
 *     slide), exactly mirroring the wired Space's own on-canvas convention (ADR-0010).
 */

import {
  PRODUCER_PROTOCOL_NODE_NAME,
  canonicalCarouselProtocol,
  serializeProtocol,
} from "../protocol.ts";
import type { FakeSpaceNode, FakeSpaceState } from "./space-state.ts";

/** The exact name of the carousel's Spec-injection text node (same convention as the wired Space). */
export const CAROUSEL_JSON_MASTER_NODE_NAME = "JSON Master";

/** The Space's own writing guide for the slide JSON shape — read-only reference, not a run-point. */
export const CAROUSEL_PROMPT_GUIDE_NODE_NAME = "Carousel Prompt Guide";

/** The brand-mark reference creation — read-only reference, not a run-point. */
export const CAROUSEL_BRAND_LOGO_NODE_NAME = "Brand Logo";

/** A conforming fake "AI News" Space: `JSON Master`, all 7 slide extractor→generator pairs, the
 *  writing-guide + brand-logo reference nodes, and a `Producer Protocol` node holding the canonical
 *  carousel protocol (7 gateless run-points). */
export function fakeCarouselSpaceState(): FakeSpaceState {
  const nodes: FakeSpaceNode[] = [
    { id: "node-json-master-a1", name: CAROUSEL_JSON_MASTER_NODE_NAME, value: "[]" },
  ];
  for (let n = 1; n <= 7; n += 1) {
    nodes.push({ id: `node-image-prompt-slide-${n}`, name: `Image Prompt Slide ${n}` });
    nodes.push({ id: `node-slide-${n}-generator`, name: `Slide ${n} Generator` });
  }
  nodes.push({ id: "node-carousel-prompt-guide", name: CAROUSEL_PROMPT_GUIDE_NODE_NAME, value: "guide text" });
  nodes.push({ id: "node-brand-logo", name: CAROUSEL_BRAND_LOGO_NODE_NAME });
  nodes.push({
    id: "node-producer-protocol-carousel",
    name: PRODUCER_PROTOCOL_NODE_NAME,
    value: serializeProtocol(canonicalCarouselProtocol()),
  });
  return { nodes };
}
