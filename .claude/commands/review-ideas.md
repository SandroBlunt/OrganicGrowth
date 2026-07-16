---
name: review-ideas
description: "Walk the Operator through a named Brand's suggested Ideas conversationally; accept or reject each, logging a free-text reason for every rejection."
---

# /review-ideas

Usage: `/review-ideas <brand> [<run-id>]`

Curate a Brand's suggested Ideas **conversationally**. `<brand>` is required — omitting it is an
error, never a silent default. Optional: run id (default = latest run with `suggested` ideas for
this Brand).

**Gate 1 — Review. Brand: `<brand>`.** The Operator is reviewing Ideas for Brand `<brand>`. All
ledger reads and writes use `data/brands/<slug>/ledger.json`.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's paths via the resolver. State the
   active Brand: "Reviewing Ideas for Brand: `<brand>`."
2. **Load** all `status: suggested` Ideas for the run from `data/brands/<slug>/ledger.json`, and
   resolve each Idea's Brief path via `resolveBriefPathCandidates`
   (`src/format/brief-path.ts`) — do **not** hand-build the path from `format`/`run` yourself. The
   ledger is canonical (always-rules #7), so a recorded `brief_path` (verbatim) is trusted
   **exclusively**: try that path first and only if it does not exist should you fall back to any
   other candidate. Only when a record has NO `brief_path` at all does the resolver reconstruct one
   — preferring the Format-namespaced path `data/brands/<slug>/ideas/<Idea.format>/<run>/idea-NN.md`
   (today's convention for Ideas suggested under this slice), then the legacy Brand-level path
   `data/brands/<slug>/ideas/<run>/idea-NN.md` (pre-multi-format Ideas). This is required because a
   record's `format` field is NOT a reliable indicator of where its Brief physically lives —
   pre-existing records may carry either the retired media-sense value or a real Format slug while
   their Brief still sits at the old, non-namespaced path. If every candidate is missing, STOP and
   report it rather than guessing.
3. **Present them** one at a time (or as a short list, Operator's preference): title, the trend it
   rides, Fit Score, hook concept, and the one-line rationale.
4. **Take the Operator's verdict** in natural language — accept some, reject others. This is a
   conversation, not a form: let them give reasons however they like.
5. **For each ACCEPT:** set `status: accepted` in `data/brands/<slug>/ledger.json`, then
   **auto-enqueue** the Idea for production by calling
   `enqueueOnAccept(ideaId, brand, { ledgerPath: resolveBrand(brand).ledger })`
   (`src/production-queue/enqueue-on-accept.ts`). All three arguments are required: the `brand` and
   the explicit `ledgerPath` are what tie the job to this Brand's ledger — omitting them enqueues a
   job with no Brand that is silently dropped on the next load, or validates acceptance against the
   wrong Brand's ledger. This appends one `cast`-phase, `status: queued`
   job to `data/queue.json` (the global Production Queue — ADR-0004, brand-agnostic). Enqueue is
   idempotent per Idea: re-accepting the same Idea adds no second job, and only `accepted` Ideas ever
   enter the queue (rejected Ideas cost nothing). Run `/queue <brand>` to see the backlog.
6. **For each REJECT:** set `status: rejected` in `data/brands/<slug>/ledger.json` and store their
   reason **verbatim** in `rejection_reason`. Log it as-is — do **not** argue, re-pitch, or act on
   it (v1 logs only).
7. **Offer replacements** (optional): if the Operator wants more, invoke **idea-strategist** with
   Brand `<brand>` for fresh briefs honoring what they just said, and add them as new `suggested` Ideas.
8. **Summarize:** the accepted set (ready to create) and the rejected set (with reasons logged), all
   scoped to Brand `<brand>`.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`.
- Capture every **Rejection Reason** verbatim; rejection feedback is **logged only** in v1.
- Don't pressure the Operator or defend an Idea — record the decision and move on.
- Accepting an Idea **enqueues** it (ADR-0004); the ledger stays the source of truth and the queue is
  derived from it. OrganicGrowth **generates the Asset but never publishes** — accepting only queues
  production, it does not post anything.
