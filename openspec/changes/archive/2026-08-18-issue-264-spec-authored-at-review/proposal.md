# Author the Production Spec at Review, so the unattended worker can finish a job

## Why

Issue #264: `runOneJob`'s author phase requires an already-authored Production Spec and fails
immediately when one is missing. Nothing in the codebase authors a Spec outside an attended Producer
session — a Recipe's Spec is written by that Recipe's own producer Skill, an LLM step run interactively.
Since #254 made an accepted Idea reach the unattended SQL job queue directly, a job can be claimed by the
worker with no Spec ever available to it: the worker retries three times and terminally fails, with
nothing able to revive it afterward.

**ADR-0031** (`docs/adr/0031-production-spec-authored-at-review.md`) resolved the three-way fork this
issue originally posed and is the authoritative decision this change implements: the Production Spec is
authored at **Review** (accept time), synchronously, per (Idea, Recipe), before the job is ever written
to the queue. Review becomes the single authorship point; the attended Producer stops authoring its own
Spec and instead reads what Review already wrote; the unattended worker's shape is unchanged — it simply
now always finds the Spec its existing author-phase check requires.

## What changes

- **Recipe registry** (`src/recipe/registry.ts`): each Recipe entry gains a typed `producerSkill` field
  (the same shape as the existing `copySkill` field) naming which Skill authors that Recipe's Spec —
  replacing the mapping that lived only as prose inside `.claude/agents/producer.md`.
- **Deterministic Spec authors** (`src/production-spec/news-carousel-generate.ts`,
  `src/production-spec/news-short-script-generate.ts`, alongside the existing
  `src/production-spec/generate.ts`): one per wired Recipe, mirroring `src/copy/draft.ts`'s
  `CopyDrafter`/`skillDraftCopy` pattern — a deterministic, hermetic stand-in for that Recipe's producer
  Skill's LLM authorship, always producing a Spec that satisfies that Recipe's own `specShape.validate`.
- **`authorSpecForRecipe`** (`src/production-spec/author-at-review.ts`): authors a candidate Spec via the
  Recipe's default author and immediately self-checks it against the EXISTING `auditAuthorPhase`
  (`src/recipe/phase-contract.ts`) — the SAME function the worker's own author-phase check already calls
  — returning either the authored Spec or the failing audit.
- **Command surface** (`src/command-surface/production-spec.ts`): `saveAssetSpec` (wraps the SQL-backed
  `saveProductionSpec`, giving it its first production caller) and `refreshSpecFile` (reads the Spec back
  from SQL and writes the human-readable per-Idea file — a GENERATED VIEW, mirroring `post.json`'s own
  relationship to the ledger, ADR-0028 — never a second, independently-authored copy).
- **`acceptIdeaCommand`** (`src/commands/accept-idea.ts`): for each chosen Recipe, authors and
  self-checks its Spec BEFORE either queue (`data/queue.json` or the SQL `job` table) is written. A
  failing check blocks that Recipe's accept, is reported loudly in the returned message (relayed
  verbatim to the Operator by `/review-ideas`), and no job is ever enqueued for it. A Recipe whose Spec
  passes is enqueued exactly as before, and its authored Spec is persisted to SQL and regenerated as the
  on-disk file view once the SQL sync lands.
- **`.claude/agents/producer.md`**: the Author phase section is rewritten — the Producer no longer runs
  a Recipe's producer Skill to author a Spec; it reads the Spec Review already produced for that (Idea,
  Recipe) and proceeds straight to Bind/Watermark/Drive-the-canvas. `producer-agent.docs-test.ts` is
  updated to match.
- **`.claude/commands/review-ideas.md`**: documents that accepting now authors each chosen Recipe's Spec
  as part of the SAME compiled `accept-idea` call, and that a failed authorship check is relayed to the
  Operator verbatim, exactly like a SQL sync failure already is.
- **`src/commands/run-worker.ts` / `src/command-surface/worker.ts`**: unchanged in shape — `runOneJob`'s
  author-phase check still runs, now always finding a Spec because one is guaranteed before a job reaches
  the queue.

## Impact

- Affected capabilities: `recipe-registry`, `production-spec`, `command-surface`, `accept-idea-command`,
  and a new `spec-authored-at-review` capability holding the cross-cutting ADR-0031 behavior (single
  authorship point, the Producer no longer authoring, and the end-to-end unattended proof).
- No change to the Copy step, to `runOneJob`'s own shape, to the gate/pick-gate mechanics, or to any
  always-rule. Generate-never-publish, public-metrics-only, and ledger-as-source-of-truth all hold
  unchanged — this only relocates WHO authors a Spec and WHEN, never who publishes.
- Out of scope (per the issue): reviving pre-existing stuck `queued`/`failed` jobs; a general-purpose
  requeue/retry mechanism; any change to the Copy step; extending full unattended completion to
  *Character Explainer with Cast* or *News Short Script* (News Carousel is this ticket's sole proof
  target); giving the unattended worker its own LLM/model credentials.
