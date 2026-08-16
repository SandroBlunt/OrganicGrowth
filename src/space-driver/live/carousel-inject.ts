/**
 * Chunked News Carousel Spec injection — gets a realistically-large (~17 KB+) carousel Production Spec
 * onto the canvas intact, one within-limit `spaces_edit` at a time (issue #207).
 *
 * --- WHY THIS EXISTS ---
 *
 * `driver.ts`'s `injectSpec` embeds the WHOLE Spec's JSON in a single natural-language `edit()` goal —
 * fine for the wired Character Explainer Recipe's Spec (well under the write limit), but a News Carousel
 * Spec's `slides` array runs 15-30 KB in real production data, far over the modelled
 * `SPACES_EDIT_WRITE_LIMIT_CHARS` (`./write-limit.ts`). Established live practice (recorded operational
 * knowledge, NOT re-derived here) is: **one slide per run, full replace** — append-style chunking across
 * calls is broken; what works is a SURGICAL, full replace of exactly one slide's own JSON element per
 * edit, leaving every other slide/field untouched, mirroring `driver.ts`'s existing `watermarkGoal`
 * precedent ("replace ONLY X, leave everything else").
 *
 * This module is the CODE-LEVEL modelling of that pattern:
 *
 *   1. `planCarouselInject` (pure) decides whether the Spec fits in one write; if not, it plans a
 *      SKELETON goal (establishes an empty, right-length `slides` placeholder array) followed by one
 *      surgical per-slide goal — checking EVERY planned goal against the limit BEFORE returning a plan,
 *      so a Spec (or even a single slide) that cannot fit is refused with a clear, specific error, never
 *      silently attempted as a truncated write.
 *   2. `injectLargeCarouselSpec` (I/O, port-driven) executes the plan: a Spec that already fits delegates
 *      straight to the existing, unchanged `injectSpec` (identical behavior, identical readback confirm);
 *      an oversized Spec issues the planned goals IN ORDER, stopping immediately — never continuing — on
 *      the first edit that fails, then confirms by readback that the target node's text changed.
 *
 * NOT yet wired into `driveToNextGate`'s "first" leg — that would touch the generic run-until-gate
 * engine for every Recipe and is a separate, deliberately deferred decision (see this slice's Build
 * Report "Known limits"). `driver.ts`/`fake-space.ts`/the driver test suite are untouched by this module.
 */

import type { SpaceMcpPort } from "../port.ts";
import { injectGoal, injectSpec, nodeText, pollEdit, type DriverError, type PollOptions } from "../driver.ts";
import { SPACES_EDIT_WRITE_LIMIT_CHARS, exceedsWriteLimit } from "./write-limit.ts";

/** Stable failure codes this module's own operations can report. */
export type CarouselInjectErrorCode =
  /** Planning could not fit the Spec (or one slide alone) within the limit — no edit was attempted. */
  | "carousel_chunk_too_large"
  /** One of the planned chunked edits failed at the agent (terminal `failed`); the sequence stopped. */
  | "carousel_chunk_edit_failed"
  /** Mirrors `injectSpec`'s own inject-edit failure, when delegating to it for a single-write Spec. */
  | "inject_edit_failed"
  /** Mirrors `injectSpec`'s own missing-prompt-node failure. */
  | "prompt_node_missing"
  /** The readback after a chunked sequence (or a delegated single write) did not show the text change. */
  | "inject_unconfirmed";

export interface CarouselInjectError {
  readonly code: CarouselInjectErrorCode;
  readonly message: string;
}

/** The ordered `edit()` goals a plan issues, in order — a single goal when the Spec already fits. */
export interface CarouselInjectPlan {
  readonly goals: readonly string[];
}

export type CarouselInjectPlanResult =
  | { readonly ok: true; readonly plan: CarouselInjectPlan }
  | { readonly ok: false; readonly error: CarouselInjectError };

/** A chunked (or delegated single-shot) inject's outcome — mirrors `driver.ts`'s `InjectResult` shape. */
export type CarouselInjectResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: CarouselInjectError };

/** The marker a per-slide goal's embedded JSON follows — lets a caller/test extract it unambiguously. */
const SLIDE_JSON_MARKER = "SLIDE_JSON=";

/**
 * Translate an `injectSpec` failure (`DriverError`, a wider taxonomy shared across all of `driver.ts`'s
 * operations) into this module's own narrower `CarouselInjectError` — `injectSpec` can only actually fail
 * with `inject_edit_failed`/`prompt_node_missing`/`inject_unconfirmed` (its own documented codes), all
 * three of which this module's own union already carries verbatim.
 */
function fromInjectError(error: DriverError): CarouselInjectError {
  switch (error.code) {
    case "inject_edit_failed":
    case "prompt_node_missing":
    case "inject_unconfirmed":
      return { code: error.code, message: error.message };
    default:
      // injectSpec's own contract never actually returns any other code for a single-shot inject.
      return { code: "carousel_chunk_edit_failed", message: error.message };
  }
}

/** Whether `spec` carries a top-level `slides` array — the ONLY shape this module knows how to chunk. */
function hasSlidesArray(spec: Record<string, unknown>): spec is { readonly slides: readonly unknown[] } {
  return Array.isArray(spec["slides"]);
}

/**
 * Build the "establish the skeleton" goal: a full replace of `promptNode` with a JSON object carrying
 * ONLY an empty, right-length `slides` placeholder array — so each subsequent surgical per-slide goal has
 * a well-formed array element to target. Small by construction (comfortably under the write limit).
 */
export function skeletonGoal(promptNode: string, slideCount: number): string {
  const placeholder = { slides: Array.from({ length: slideCount }, () => ({})) };
  return injectGoal(placeholder, promptNode);
}

/**
 * Build ONE surgical per-slide goal: replace ONLY `slides[slideIndex]` with exactly `slide`'s JSON,
 * leaving every other slide/field of `promptNode`'s JSON untouched — the "one slide per run, full
 * replace" pattern, generalized as a full replace of that ONE element (never an append, never the whole
 * node). The embedded JSON follows {@link SLIDE_JSON_MARKER} so `extractSlideFromGoal` can recover it
 * unambiguously.
 */
export function slideReplaceGoal(slide: unknown, slideIndex: number, promptNode: string): string {
  return (
    `In the "${promptNode}" node's JSON, replace the element at "slides[${slideIndex}]" with exactly ` +
    "this object, leaving every other slide and every other field of the JSON completely unchanged. " +
    `${SLIDE_JSON_MARKER}${JSON.stringify(slide)}`
  );
}

/**
 * Recover the slide object a `slideReplaceGoal` embedded, by locating {@link SLIDE_JSON_MARKER}. Returns
 * `undefined` for a goal that carries no marker (e.g. the skeleton goal, or an unrelated edit) — a test/
 * verification convenience, not used by production planning/execution itself.
 */
export function extractSlideFromGoal(goal: string): unknown {
  const idx = goal.indexOf(SLIDE_JSON_MARKER);
  if (idx === -1) return undefined;
  return JSON.parse(goal.slice(idx + SLIDE_JSON_MARKER.length)) as unknown;
}

/**
 * Plan how to get `spec` onto `promptNode` under `limit` (default {@link SPACES_EDIT_WRITE_LIMIT_CHARS}):
 * a single goal when the whole-Spec inject already fits; otherwise a skeleton goal plus one surgical
 * per-slide goal, ONLY when `spec` has a `slides` array AND every resulting goal individually fits.
 * Fails clearly — before any edit is planned to be issued — when the Spec cannot be chunked at all (no
 * `slides` array) or when even a single slide's own goal alone exceeds the limit: this planner never
 * produces a goal over `limit`, so a caller executing the plan never risks a silent truncation.
 */
export function planCarouselInject(
  spec: Record<string, unknown>,
  promptNode: string,
  limit: number = SPACES_EDIT_WRITE_LIMIT_CHARS,
): CarouselInjectPlanResult {
  const singleShotGoal = injectGoal(spec, promptNode);
  if (!exceedsWriteLimit(singleShotGoal, limit)) {
    return { ok: true, plan: { goals: [singleShotGoal] } };
  }

  if (!hasSlidesArray(spec)) {
    return {
      ok: false,
      error: {
        code: "carousel_chunk_too_large",
        message:
          `the Spec for "${promptNode}" is ${singleShotGoal.length} chars, over the ${limit}-char ` +
          'write limit, and carries no "slides" array to chunk by — refusing to attempt a ' +
          "partial/truncated write.",
      },
    };
  }

  const goals: string[] = [skeletonGoal(promptNode, spec.slides.length)];
  for (let i = 0; i < spec.slides.length; i++) {
    const goal = slideReplaceGoal(spec.slides[i], i, promptNode);
    if (exceedsWriteLimit(goal, limit)) {
      return {
        ok: false,
        error: {
          code: "carousel_chunk_too_large",
          message:
            `slides[${i}]'s own surgical replace goal is ${goal.length} chars, over the ${limit}-char ` +
            "write limit EVEN ALONE — refusing to attempt a partial/truncated write for this slide.",
        },
      };
    }
    goals.push(goal);
  }
  return { ok: true, plan: { goals } };
}

/**
 * Get `spec` onto `promptNode` intact, respecting the modelled write limit throughout. A Spec that
 * already fits in one write delegates STRAIGHT to the existing, unchanged `injectSpec` (identical
 * single-edit behavior and readback confirm — no regression for the wired Character Explainer Recipe or
 * a small carousel Spec). A Spec too large for one write is planned via `planCarouselInject` and, if the
 * plan succeeds, its goals are issued IN ORDER, one `edit()` + poll-to-terminal per goal, stopping
 * immediately on the first failure (never continuing past it, never leaving a silently-partial
 * injection unreported); on full success the target node is read back once more to confirm its text
 * changed. Planning failure means ZERO edits are ever issued — the write limit is checked FIRST.
 */
export async function injectLargeCarouselSpec(
  port: SpaceMcpPort,
  spec: Record<string, unknown>,
  promptNode: string,
  poll: PollOptions = {},
  limit: number = SPACES_EDIT_WRITE_LIMIT_CHARS,
): Promise<CarouselInjectResult> {
  const planned = planCarouselInject(spec, promptNode, limit);
  if (!planned.ok) return { ok: false, error: planned.error };

  if (planned.plan.goals.length === 1) {
    // Fits in a single write — delegate to the existing single-shot inject, unchanged.
    const result = await injectSpec(port, spec, promptNode, poll);
    return result.ok ? result : { ok: false, error: fromInjectError(result.error) };
  }

  const before = nodeText(await port.readState(), promptNode);
  for (const goal of planned.plan.goals) {
    const { editId } = await port.edit(goal);
    const status = await pollEdit(port, editId, poll);
    if (status.phase === "failed") {
      return {
        ok: false,
        error: {
          code: "carousel_chunk_edit_failed",
          message: status.error ?? "a chunked carousel-inject edit failed partway through the sequence",
        },
      };
    }
  }

  const after = nodeText(await port.readState(), promptNode);
  if (after === undefined) {
    return {
      ok: false,
      error: { code: "prompt_node_missing", message: `No "${promptNode}" node to read back.` },
    };
  }
  if (after === before) {
    return {
      ok: false,
      error: {
        code: "inject_unconfirmed",
        message: `The "${promptNode}" text did not change after the chunked inject — not confirmed.`,
      },
    };
  }
  return { ok: true, text: after };
}
