## Why

Parent #140 (the Schedule Batch spec) plus the Operator's own directive decided the export runs as a
**producer task**, only after the Operator approves all the generated outputs and captions — never a
standalone, unprompted step. Issues #141/#142/#143/#144/#145/#146/#147 built the export itself (the
ledger round-trip, the X 280-char cap, per-Brand Zoho config, the Media Host port, the tracer bullet, the
fail-loudly preflight, and the manifest-driven cleanup) but none of them wired this in-conversation
approval into the producer's own documented behavior, and none of them taught the domain glossary or the
weekly-loop docs the two new terms (**Schedule Batch**, **Zoho Social Brand**) or the one-time S3
infrastructure setup. Issue #148 closes that gap: it is a **docs-and-glossary-only** slice — the ledger
grain is already correct (`scheduled_at` is the only new field, no new status; ADR-0011 unchanged) — so
the work here is entirely about making the producer's documented behavior, the weekly-loop docs, and
CONTEXT.md say what the Operator already decided, and about documenting the one-time S3 setup as
infrastructure rather than code.

## What Changes

- **`.claude/agents/producer.md`** gains a new documented step, "Schedule Batch offer — after a Run's
  outputs are approved, before Publish": once a Run's eligible Assets (today: *News Carousel*) are
  `produced`, the producer OFFERS the Schedule Batch export and runs it ONLY after the Operator approves,
  in the SAME conversation, every one of that Run's generated outputs and composed Copy variants — never
  triggered unprompted (ADR-0008). The approval itself is documented as conversational only: nothing is
  written to `ledger.json` for it (no new status, no new field — `scheduled_at` is written only by the
  export itself, never the approval). The Publish gate is documented as still following, still human
  (ADR-0002) — a SECOND, distinct human step from the approval. A matching guardrail is added to the
  Guardrails section so the rule survives a skim of that section alone.
- **`CLAUDE.md`** gains a new numbered pipeline step ("Schedule Batch approval") between the existing
  Gate 2 (each Recipe's pick-gate) and Gate 3 (Publish), explicitly stating this new checkpoint is
  conversational-only, writes nothing to the ledger, and is **not** one of the three formal human gates
  (Review / pick-gate(s) / Publish stay exactly those three). Gate 3's own text is extended to
  distinguish the Zoho-upload path (for a Schedule Batch Asset) from the direct-publish path (for any
  other Asset, e.g. a Character Explainer Reel), citing ADR-0002 and naming this as a second, distinct
  human step from the approval above. The `producer` row in the Agents table and the `## State` section's
  per-Asset field list are extended to name the new pipeline step and the already-shipped `scheduled_at`
  field (issue #141) respectively — CLAUDE.md never mentioned either before this slice. A new `## Data
  sources` bullet points at the new S3 setup doc.
- **`.claude/commands/run-pipeline.md`** (the weekly-loop conductor doc) gains the same ordering: a new
  bullet for the Schedule Batch approval, positioned between Gate 2 and Gate 3 in its own gate-by-gate
  walkthrough, and Gate 3's own text extended the same way as CLAUDE.md's.
- **`.claude/commands/export-schedule.md`** gains a short paragraph stating the command is normally
  OFFERED by the producer behind this same in-conversation approval, while remaining directly runnable on
  its own as a granular power-tool (matching `/cleanup-schedule-media`'s own documented pattern).
- **`CONTEXT.md`** gains two new glossary terms (the two named in issue #140's "Further Notes" and this
  issue's own acceptance criteria): **Schedule Batch** (placed after **Production Queue**, before
  **Post** — the mechanism a Run's produced Assets travel through on the way to a Post) and **Zoho
  Social Brand** (placed immediately after it) — both cross-referencing the conversational-approval /
  no-ledger-trace rule and ADR-0002's still-human Publish gate.
- **New doc: `docs/schedule-batch-s3-setup.md`** documents the one-time S3 infrastructure setup (bucket,
  a public-`GetObject`-only bucket policy with Block Public Access left ON, and a 30-day expiry lifecycle
  rule) as setup, not code — states it is already live for straw-motion (`strawmotion-schedule-media`,
  `us-east-1`) and gives the concrete steps (+ an example bucket-policy JSON) for provisioning a new
  Brand's bucket the same way, including running the existing `src/media-host/live/smoke.ts` once to
  verify it.
- **New test: `src/schedule-batch/approval-gate.docs-test.ts`** — the doc-conformance suite proving every
  one of the above prose changes exists and says what this proposal claims, plus one real code
  cross-check (`isAssetStatus`) proving no new `AssetStatus` was silently introduced anywhere in this
  slice (ADR-0011's six-stage vocabulary is exactly what it was before).

This slice makes **no production-code change** — no file under `src/schedule-batch/**`,
`src/commands/export-schedule.ts`, `src/media-host/**`, `src/asset/**`, or `src/ledger/**` is modified
(the one new test file imports `isAssetStatus` read-only, as a cross-check, never a change). There is no
Magnific interaction anywhere in this slice, and no live S3/AWS-CLI call in `npm test`.

## Non-Goals (explicitly deferred / out of scope)

- **Any code change to `/export-schedule`, `/cleanup-schedule-media`, `run-pipeline.ts`'s conductor
  generator, or the ledger/Asset store.** The approval gate this issue documents is a conversational,
  agent-level behavior (the producer's own judgment, per its instructions) — not a deterministic code
  path, and not something `run-pipeline.ts`'s own generator machinery is wired to auto-invoke. Coding an
  automatic, machine-enforced approval gate is explicitly not what issue #140/#148 asked for (the
  Operator's own directive frames this as an in-conversation approval, matching how the Cast gate and
  Gate 3's Copy review already work today).
- **Renaming or expanding "the three human gates."** Review, each chosen Recipe's own pick-gate(s), and
  Publish remain exactly those three; the Schedule Batch approval is documented as an additional,
  narrower checkpoint alongside them, never folded into or renumbering that framing.
- **Any change to `.claude/rules/always/organicgrowth-rules.md`.** Its guardrail 11 ("Human gates:
  Review, each Recipe's picks, Publish...") is unaffected — the approval step this issue documents
  carries no ledger significance of its own, consistent with staying outside the formal-gates framing
  that rule describes.
- **Automating S3 bucket provisioning.** The new setup doc is prose + an example policy JSON, run by
  hand — never a script, matching issue #140's own explicit decision that the 30-day lifecycle rule
  "stays a documented one-time setup step... not code."

## Capabilities

### Added Capabilities

- `schedule-batch-approval-gate`: the producer's documented in-conversation approval-gate behavior for
  the Schedule Batch export (offer only once eligible Assets are produced; run only after full approval;
  approval is conversational-only with no ledger trace; the Publish gate still follows as a second,
  distinct human step) — proven entirely by doc-conformance tests against `producer.md`, `CLAUDE.md`,
  `run-pipeline.md`, and `export-schedule.md`, plus a real-code cross-check that no new `AssetStatus` was
  introduced.

### Modified Capabilities

- `docs-conformance`: gains a Requirement that CONTEXT.md defines **Schedule Batch** and **Zoho Social
  Brand**, and that the one-time S3 setup is documented (not code) at `docs/schedule-batch-s3-setup.md`.

## Impact

- **New:** `docs/schedule-batch-s3-setup.md`, `src/schedule-batch/approval-gate.docs-test.ts`,
  `openspec/changes/issue-148-approval-gate-docs/{proposal.md,tasks.md,handoff.md,specs/**}`.
- **Modified (docs only):** `CLAUDE.md`, `CONTEXT.md`, `.claude/agents/producer.md`,
  `.claude/commands/run-pipeline.md`, `.claude/commands/export-schedule.md`.
- **Not touched:** every file under `src/schedule-batch/**` (except the new `.docs-test.ts`),
  `src/commands/export-schedule.ts`, `src/commands/cleanup-schedule-media.ts`, `src/media-host/**`,
  `src/asset/**` (read-only import in the new test), `src/ledger/**`, `data/**`, `package.json`.
- **Hermetic:** no live `spaces_*`/`creations_*` calls anywhere in this slice (no Magnific involvement —
  purely documentation); no live S3/AWS-CLI call in `npm test` (the new test only reads markdown files
  and calls the pure `isAssetStatus` function).
- **Always-rules upheld:** generate-never-publish (the new docs are explicit that hosting/writing files
  is not publishing, and that the producer never calls Zoho/Facebook/any platform API); public-metrics-
  only (N/A — no metrics in this slice); relative-not-absolute (N/A — no scoring in this slice);
  explicit-attribution (unaffected — `/log-post` still keys attribution on `(Idea, Recipe)`, unchanged by
  this slice); ledger-as-source-of-truth (the whole point of this slice's core claim: the approval writes
  nothing to the ledger, and `scheduled_at` remains the one and only new field, written only by the
  already-shipped export code, never by this documented approval step).
