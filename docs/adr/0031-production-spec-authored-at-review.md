# Production Spec authorship moves to Review, becoming the single authorship point

**Status:** accepted — amends ADR-0017 (Phase Contracts) and ADR-0018 (Recipe Skill / Producer's core
craft) by moving the **author** phase and its self-audit out of the Producer's per-phase sequence and
into Review. Operator decision recorded 2026-08-18, grilled from issue #264.

Issue #264 found that `runOneJob`'s author phase requires an already-authored Production Spec and fails
immediately otherwise — and that nothing in the codebase authors one outside an attended Producer
session, because a Recipe's Spec is written by that Recipe's producer Skill, an LLM step. #254 had just
made accepted Ideas reach the SQL job table; the worker could now find work but never finish it, because
it can never author the Spec its own author phase requires.

Three options were on the table: the unattended worker calls an LLM itself; the Spec is authored at
Review (accept time), attended, before the job is enqueued; or the worker parks jobs that lack a Spec and
only drains the ones that already have one.

## Decision

- **The Production Spec is authored at Review**, the moment the Operator accepts an Idea and chooses its
  Recipes — synchronously, per (Idea, Recipe), before that job is ever written to the queue. A job never
  reaches the queue without a Spec already attached.
- **Review is the single authorship point.** The attended `producer` agent no longer authors its own
  Spec — it reads what Review already wrote and goes straight to binding media / driving the canvas.
  `.claude/agents/producer.md` is rewritten accordingly; the unattended worker was already mechanical and
  stays that way.
- **The author phase's self-audit (`auditAuthorPhase`) runs at Review, not in production.** If it fails
  (e.g. a banned word slipped through), that Recipe's accept is blocked and surfaced in the same Review
  conversation — the Operator can retry or drop that Recipe. The Producer/worker's own self-audit still
  covers every phase from bind-media onward, as defense in depth, but is no longer the primary catch for
  authorship problems.
- **The write goes through the SQL-backed `saveProductionSpec`** (`src/production-spec/store.ts`), giving
  it its first production caller — until now only the file-backed `saveSpec`/`compose.ts` had one (issue
  #235's dormant allow-list entry, issue #238). The human-readable file
  (`ideas/<format>/<run>/idea-NN.<recipe>.spec.json`) keeps getting written too, but now as a **generated
  view** derived from the SQL row — the same relationship `post.json` already has to the ledger's own
  Asset (ADR-0028) — never a second hand-maintained copy.
- **The Recipe→Skill mapping becomes a typed field on the Recipe registry** (`src/recipe/registry.ts`),
  alongside the existing `copySkill`, replacing the prose mapping currently hardcoded into
  `.claude/agents/producer.md`. Review needs this dispatch too, not just the Producer agent, so it can no
  longer live as instructions private to one agent.
- **The first end-to-end proof targets *News Carousel*** — zero-gate, so "accept → produced, no attended
  session" is actually demonstrable. *Character Explainer with Cast* still stops at its Cast gate
  regardless of who authored the Spec; *News Short Script* drives no Space at all (ADR-0021) and is not
  this ticket's proof target.
- **Pre-existing stuck jobs are out of scope.** Jobs already `queued` (accepted via #254, never authored)
  or `failed` (retried three times, dead end — `requeueJob` exists but isn't wired to anything) are not
  auto-revived. The Operator re-accepts the affected Idea by hand if any remain.

## Why

- In the attended path today, a Spec is already authored by an LLM step *before* any media exists — the
  Producer authors, then drives the Space. Moving authorship a few steps earlier, into Review, is not a
  change to *when* authorship happens relative to rendering — it only relocates it to a point where a
  human is already present in an attended session capable of running a Skill.
- The worker was deliberately built as a plain local process, not a Claude Code agent session, specifically
  so Claude Code's `auto`-mode permission classifier never applies to it (ADR-0030). Giving it its own LLM
  credentials to author content itself would make it a content author for the first time — a real
  category change, not a natural extension of the Magnific credentials it already holds.
- Two live code paths that can each author the same artifact is exactly the kind of drift this codebase's
  guard system (`store-write-boundary`, `fs-boundary`) already exists to catch elsewhere. A single
  authorship point removes the possibility by construction rather than by convention.
- `copySkill` already exists as a typed Recipe-registry field for the same class of problem (which Skill
  handles this Recipe's out-of-canvas step); `producerSkill` is the same shape of fix for the author step,
  not a new pattern.

## Consequences

- `saveProductionSpec` (SQL-backed) gets its first production caller, which is very likely relevant to
  issue #238 (the dormant file-backed `compose.ts` allow-list entry) — #238 should be re-triaged once this
  ships, to check whether the two write paths now need reconciling.
- Review's accept flow becomes slower and more expensive per accepted (Idea, Recipe) — it now runs a full
  authorship Skill invocation, not just a state change.
- `.claude/agents/producer.md` loses a whole responsibility (authorship) and needs a real rewrite, not a
  patch.

## Reference

Issue #264, ADR-0008, ADR-0010, ADR-0017, ADR-0018, ADR-0021, ADR-0028, ADR-0029, ADR-0030, issue #235,
issue #238, issue #254.
