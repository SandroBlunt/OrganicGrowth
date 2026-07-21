/**
 * Copy drafting — the WRITING half of the Copy step (ADR-0012, issue #58).
 *
 * Drafting copy in the Format's voice is the producer's LLM job: it happens LATE, in the Operator's
 * attended session, AFTER the media (and any picked Character) exists, so the copy can refer to what
 * was actually produced (e.g. naming the chosen Character). This module defines the injectable
 * `CopyDrafter` seam (mirroring `production-spec/compose.ts`'s injectable `generator`) so:
 *
 *   - tests exercise drafting against a deterministic FAKE drafter, never a live model;
 *   - `composeCopy` (`compose.ts`) always has a working default when no custom drafter is supplied.
 *
 * `defaultDraftCopy` is that default: a deterministic template (no model call, no I/O, no clock) that
 * always produces Copy passing `validateCopy` for the SAME `CopyShape` it was drafted for, mirroring
 * `production-spec/generate.ts`'s "the generated artifact always satisfies its own contract" story.
 * Unlike the old `post_copy` template (hard-coded to 180 chars / a 2-emoji tail), this respects
 * WHATEVER `CopyShape` the caller passes — the bounds are the chosen Recipe's own params, not a global.
 */

import type { Copy, CopyShape } from "./contract.ts";

/** The material a copy step drafts from — the Format's voice, the Idea's material, and (composed LATE)
 *  what was actually produced. */
export interface CopyInput {
  /** The Idea's title/hook — the core material every draft starts from. */
  readonly title: string;
  /** The Idea's angle, when available — additional material a richer drafter may use. */
  readonly angle?: string;
  /** The Format's voice/treatment (`FormatFile.voice`) — how this draft should read. */
  readonly voice?: string;
  /** The Idea's own hashtag set (material) — carried through as the drafted Copy's starting hashtags
   *  (before the Brand's required hashtags are injected, `inject.ts`). */
  readonly hashtags?: readonly string[];
  /** Free text naming what was actually PRODUCED (e.g. the picked Character's name, "5 clips") — set
   *  only once the media exists, since Copy composes LATE and may reference the realised render. */
  readonly mediaContext?: string;
}

/** A drafter turns `CopyInput` + the chosen Recipe's `CopyShape` into a candidate Copy. In production
 *  this is the producer's LLM job; in tests it is a deterministic fake — NEVER a live model call. */
export type CopyDrafter = (input: CopyInput, shape: CopyShape) => Copy;

/** A small, fixed emoji pool the deterministic default drafter draws from (no randomness — same input,
 *  same output). */
const EMOJI_POOL: readonly string[] = ["☀️", "✨", "🎉", "🔥", "💡"];

/** Build a trailing emoji run of exactly `count` emoji, deterministically, from `EMOJI_POOL`. */
function emojiTail(count: number): string {
  if (count <= 0) return "";
  const chosen: string[] = [];
  for (let i = 0; i < count; i += 1) {
    chosen.push(EMOJI_POOL[i % EMOJI_POOL.length]!);
  }
  return ` ${chosen.join("")}`;
}

/**
 * The default, deterministic drafter (no model call, no I/O, no clock). Builds a caption from the
 * Idea's title — folding in `mediaContext` when present, so the "composed late, can reference the
 * realised media" story is exercised even without a real model — trimmed to fit `shape.maxChars` and
 * suffixed with exactly `shape.minEmojis` emoji (always within `[minEmojis, maxEmojis]`). Hashtags pass
 * through the Idea's own set unchanged (the Brand's required hashtags are injected separately,
 * `inject.ts`).
 */
export function defaultDraftCopy(input: CopyInput, shape: CopyShape): Copy {
  const tail = emojiTail(shape.minEmojis);
  const room = Math.max(0, shape.maxChars - [...tail].length);
  // Separate short sentences, never an em dash to join them (issue #108: a dash join is an AI "tell").
  const body = input.mediaContext ? `${input.title}. ${input.mediaContext}` : input.title;
  const head = [...body].slice(0, room).join("").trimEnd();
  const caption = `${head}${tail}`.trim();
  return { caption, hashtags: [...(input.hashtags ?? [])] };
}
