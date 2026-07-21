/**
 * Phase Contracts — every production phase declares a checkable contract; the Producer self-audits
 * before advancing, and a QA pass re-runs the SAME checklist (CONTEXT.md "Phase Contract"; ADR-0017;
 * issue #85, map ticket #71).
 *
 * A Recipe run moves through six PHASES, always in this order: **author the prompt -> bind media ->
 * gate -> render -> copy -> save**. Each phase declares a CONTRACT — a written checklist of what a
 * valid output for that phase looks like. A checklist item is either:
 *
 *   - **mechanical** — a deterministic check that already exists as CODE (the Production-Spec
 *     validator, the banned-word scan, the copy length/emoji check) — REFERENCED here (a human-facing
 *     pointer string), never re-implemented; or
 *   - **agent-judged** — a prose description of something only an agent/human can judge (e.g. "is the
 *     subject grounded?").
 *
 * `src/recipe/registry.ts` DECLARES each wired Recipe's six `PhaseContract`s (the checklists, as
 * data). THIS module is the generic, cross-Recipe half: the shared types every Recipe's `phases` field
 * uses, plus three AUDITORS that already generalize across ANY wired Recipe today, because the fields
 * they lean on (`Recipe.specShape`, `Recipe.copyShape`, `Recipe.canvasInputs.mediaSlots`) are
 * THEMSELVES already uniform, per-Recipe fields (issue #81) — the SAME auditor call, given a
 * DIFFERENT Recipe, audits that Recipe's own rules with zero drift risk (issue #85 AC3/AC4).
 *
 * The **"gate"**, **"render"**, and **"save"** phases have no generic mechanical auditor here yet —
 * the driving/saving code that would give them one is later work (issues #57, #87, #88); their
 * contracts are still DECLARED (per Recipe, in `recipe/registry.ts`) with prose checklist items today.
 * Nothing here fabricates a check that doesn't exist — see the module's own Build Report for this
 * known limit.
 *
 * **No new validation framework**: this module adds exactly the plumbing ADR-0017 asks for (phase
 * names, a checklist-item shape, an audit-result shape) and reuses existing checks BY REFERENCE
 * (`recipe.specShape.validate`, `recipe.specShape.scanBannedWords`, `../copy/validate.ts`'s
 * `validateCopy`) — it never re-derives their rules.
 */

import { validateCopy } from "../copy/validate.ts";
import type { BrandCopyRules } from "../production-spec/brand-profile.ts";
import type { Recipe } from "./registry.ts";

// ---------------------------------------------------------------------------
// Phase names + the checklist-declaration shape (the data every Recipe carries)
// ---------------------------------------------------------------------------

/** The six production phases, ALWAYS in this order (ADR-0017). */
export const PHASE_ORDER = ["author", "bind-media", "gate", "render", "copy", "save"] as const;

/** One of the six production phases, in `PHASE_ORDER`'s fixed order. */
export type PhaseName = (typeof PHASE_ORDER)[number];

/** A checklist item backed by an existing, deterministic check — REFERENCED (a human-facing pointer
 *  string naming the module/function that runs it), never re-implemented here. */
export interface MechanicalChecklistItem {
  readonly kind: "mechanical";
  readonly description: string;
  /** e.g. `"production-spec/validate.ts: validate (this Recipe's specShape.validate)"` — where the
   *  REAL check lives, for a human/QA reader; not a callable. */
  readonly reference: string;
}

/** A checklist item only an agent/human can judge — prose only, never auto-computed or auto-failed
 *  (ADR-0017: flagged for review). */
export interface AgentJudgedChecklistItem {
  readonly kind: "agent-judged";
  readonly description: string;
}

/** One item in a phase's checklist — either kind (ADR-0017). */
export type ChecklistItem = MechanicalChecklistItem | AgentJudgedChecklistItem;

/** One phase's declared contract: what a valid output for THIS phase looks like. */
export interface PhaseContract {
  readonly phase: PhaseName;
  readonly description: string;
  readonly checklist: readonly ChecklistItem[];
}

/**
 * Whether `phases` declares all six phases, in `PHASE_ORDER`'s exact order — the shape every wired
 * Recipe's `phases` field must satisfy (issue #85 AC1). Pure, never throws.
 */
export function declaresAllPhasesInOrder(phases: readonly PhaseContract[]): boolean {
  if (phases.length !== PHASE_ORDER.length) return false;
  return phases.every((p, i) => p.phase === PHASE_ORDER[i]);
}

// ---------------------------------------------------------------------------
// Audit results — what running a phase's checklist against a real artifact yields
// ---------------------------------------------------------------------------

/** One checklist item's audit outcome. */
export interface ChecklistItemAudit {
  /**
   * Stable, short kebab-case identifier for THIS check, unique within its audit result (a dynamic
   * per-slot item namespaces itself, e.g. `media-slot:Brand_Logo`). Tests and tools select items by
   * `id`, never by array position — positional selection forced a cascade renumbering across files
   * every time a new item was inserted.
   */
  readonly id: string;
  readonly description: string;
  readonly kind: "mechanical" | "agent-judged";
  /**
   * `true`/`false` for a mechanical item that WAS run; `null` for an agent-judged item (never
   * machine-checkable — flagged for review, never auto-failed, ADR-0017) or a mechanical item this
   * generic auditor has no code path for yet.
   */
  readonly ok: boolean | null;
  readonly detail?: string;
}

/** The result of auditing one Recipe's run against one phase's contract. */
export interface PhaseAuditResult {
  readonly recipe: string;
  readonly phase: PhaseName;
  /**
   * `true` iff every item with a computed `ok !== null` passed (vacuously `true` when nothing was
   * mechanically checkable) — ADR-0017: agent-judged items are flagged for review, never auto-failed.
   */
  readonly ok: boolean;
  readonly items: readonly ChecklistItemAudit[];
}

function overallOk(items: readonly ChecklistItemAudit[]): boolean {
  return items.every((i) => i.ok !== false);
}

// ---------------------------------------------------------------------------
// auditAuthorPhase — generic across ANY wired Recipe, via its OWN specShape
// ---------------------------------------------------------------------------

/** Input to `auditAuthorPhase`: the candidate Production Spec plus the Brand's banned words. */
export interface AuthorPhaseInput {
  readonly candidateSpec: unknown;
  readonly bannedWords: readonly string[];
}

/**
 * Audit ANY wired Recipe's author-phase output (its candidate Production Spec) against that Recipe's
 * OWN `specShape` — the same `validate` + `scanBannedWords` functions every Recipe already carries
 * (issue #81), referenced here, never duplicated. Works identically for the character Recipe and the
 * News Carousel Recipe (issue #85 AC4) because `specShape` is already a uniform, per-Recipe field.
 *
 * A Recipe MAY declare EXTRA author-phase checks beyond this generic baseline (the News Carousel
 * Recipe does — see `production-spec/news-carousel-author-checklist.ts`'s
 * `auditNewsCarouselAuthorPhase`, which layers its Baseline-Prompt-parameterized checks on top of the
 * SAME referenced `validateNewsCarouselSpec`/`scanNewsCarouselForBannedWords` this function would also
 * call via `specShape`).
 */
export function auditAuthorPhase(recipe: Recipe, input: AuthorPhaseInput): PhaseAuditResult {
  const shape = recipe.specShape.validate(input.candidateSpec);
  const safety = recipe.specShape.scanBannedWords(input.candidateSpec, input.bannedWords);

  const items: ChecklistItemAudit[] = [
    {
      id: "spec-shape",
      description: recipe.specShape.description,
      kind: "mechanical",
      ok: shape.ok,
      ...(shape.ok ? {} : { detail: shape.errors.map((e) => e.message).join("; ") }),
    },
    {
      id: "banned-words",
      description: "No banned word in any field — reject-only, never a silent swap.",
      kind: "mechanical",
      ok: safety.ok,
      ...(safety.ok ? {} : { detail: safety.hits.map((h) => `"${h.word}" in ${h.field}`).join("; ") }),
    },
  ];

  return { recipe: recipe.slug, phase: "author", ok: overallOk(items), items };
}

// ---------------------------------------------------------------------------
// auditBindMediaPhase — generic across ANY wired Recipe, via its OWN canvasInputs.mediaSlots
// ---------------------------------------------------------------------------

/** Input to `auditBindMediaPhase`: which of this Recipe's media-slot NAMES got a bound asset. */
export interface BindMediaPhaseInput {
  /** Slot NAMEs (keys of `recipe.canvasInputs.mediaSlots`) that have a bound asset. A slot name absent
   *  here is unbound. The actual asset value is not inspected here — resolving/binding an
   *  image/video/audio value per media kind is the Producer's job (issue #88); this checks only "did
   *  every REQUIRED slot get SOMETHING" (ADR-0016's own rule). */
  readonly boundSlotNames: ReadonlySet<string>;
}

/**
 * Audit ANY wired Recipe's bind-media-phase output against that Recipe's OWN
 * `canvasInputs.mediaSlots` (issue #81/ADR-0016): every REQUIRED slot SHALL have a bound asset before
 * render — "a missing required slot's asset STOPS the run" (ADR-0016) — an optional slot may be
 * skipped. Works identically for the character Recipe (one `idea-pick` slot) and the News Carousel
 * Recipe (one `brand-asset` slot), since both already carry a uniform `mediaSlots` map.
 */
export function auditBindMediaPhase(recipe: Recipe, input: BindMediaPhaseInput): PhaseAuditResult {
  const items: ChecklistItemAudit[] = Object.entries(recipe.canvasInputs.mediaSlots).map(
    ([name, slot]) => {
      const bound = input.boundSlotNames.has(name);
      const ok = slot.required ? bound : true;
      return {
        id: `media-slot:${name}`,
        description:
          `Media slot "${name}" (${slot.kind}, ${slot.media}, ` +
          `${slot.required ? "required" : "optional"}) has a bound asset before render.`,
        kind: "mechanical" as const,
        ok,
        ...(ok ? {} : { detail: `missing REQUIRED slot "${name}" — the run STOPS (ADR-0016).` }),
      };
    },
  );

  return { recipe: recipe.slug, phase: "bind-media", ok: overallOk(items), items };
}

// ---------------------------------------------------------------------------
// auditCopyPhase — generic across ANY wired Recipe, via its OWN copyShape
// ---------------------------------------------------------------------------

/** Input to `auditCopyPhase`: the candidate composed Copy plus the Brand's copy rules. */
export interface CopyPhaseInput {
  readonly candidateCopy: unknown;
  readonly rules: BrandCopyRules;
}

/**
 * Audit ANY wired Recipe's copy-phase output (its composed Copy) against that Recipe's OWN
 * `copyShape`, via `../copy/validate.ts`'s `validateCopy` — referenced, never duplicated. Works
 * identically for the character Recipe's 180-char/1-3-emoji shape and the News Carousel Recipe's
 * 2200-char/0-2-emoji shape (issue #85 AC4), since `copyShape` is already a uniform, per-Recipe field
 * (ADR-0012).
 */
export function auditCopyPhase(recipe: Recipe, input: CopyPhaseInput): PhaseAuditResult {
  const result = validateCopy(input.candidateCopy, recipe.copyShape, input.rules);

  const items: ChecklistItemAudit[] = [
    {
      id: "copy-shape",
      description: recipe.copyShape.description,
      kind: "mechanical",
      ok: result.ok,
      ...(result.ok ? {} : { detail: result.errors.map((e) => e.message).join("; ") }),
    },
  ];

  return { recipe: recipe.slug, phase: "copy", ok: overallOk(items), items };
}

// ---------------------------------------------------------------------------
// auditPhase — the single dispatcher entry point (issue #85 AC4)
// ---------------------------------------------------------------------------

/** A request to `auditPhase`: which phase, plus that phase's own input shape. Covers the three phases
 *  with a generic mechanical auditor today ("gate"/"render"/"save" have none yet — see module doc). */
export type PhaseAuditRequest =
  | ({ readonly phase: "author" } & AuthorPhaseInput)
  | ({ readonly phase: "bind-media" } & BindMediaPhaseInput)
  | ({ readonly phase: "copy" } & CopyPhaseInput);

/**
 * The single entry point: "does this run satisfy the contract of the phase it is in?" (issue #85
 * AC4). Given ANY wired Recipe, a saved artifact, and which phase it belongs to, returns a pass/fail
 * `PhaseAuditResult` — dispatching to the matching generic auditor above (never re-implementing it).
 */
export function auditPhase(recipe: Recipe, request: PhaseAuditRequest): PhaseAuditResult {
  switch (request.phase) {
    case "author":
      return auditAuthorPhase(recipe, request);
    case "bind-media":
      return auditBindMediaPhase(recipe, request);
    case "copy":
      return auditCopyPhase(recipe, request);
  }
}
