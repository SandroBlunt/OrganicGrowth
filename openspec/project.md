# OpenSpec — Project Context

> Context for spec-driven engineering work in OrganicGrowth. This file is read by the
> **developer** engineering agent (and `qa`) when authoring and validating OpenSpec changes.
> It is **not** domain vocabulary — the canonical domain language lives in
> [`../CONTEXT.md`](../CONTEXT.md), and the non-negotiable rules in
> [`../.claude/rules/always/`](../.claude/rules/always/).

## What OrganicGrowth is

OrganicGrowth is an organic-social **intelligence + production** system for **Facebook**
(Instagram/LinkedIn on the roadmap): a weekly loop discovers what's trending among peer accounts,
turns the strongest themes into brand-fit **Idea briefs** with a predicted **Fit Score**, renders
each accepted Idea into a publish-ready **Asset** (a Reel) by driving a pre-defined **Magnific
Space**, then tracks how the resulting **Posts** perform and feeds that back so the next round of
ideas is sharper. It **generates the Asset but never publishes it** — a human reviews, picks the
**Character**, publishes to the **Channel**, and logs the URL (see `../docs/adr/0002`). Read
`../CONTEXT.md` for the full domain language before authoring any change.

## Tech stack

- **Runtime/language:** Node + TypeScript.
- **State:** plain files only — **no database**. State is scoped per Brand under
  `data/brands/<slug>/`: `brand-profile.yaml`, `seeds.yaml`, `ideas/<run>/*.{md,json}`, and
  `ledger.json` (the canonical index for that Brand). The one brand-agnostic exception is the global
  Production Queue at `data/queue.json` (ADR-0006). The ledger is the source of truth; update it on
  every status change.
- **External muscle:** Apify (public-metric scraping) and a Magnific Space via MCP (production).
  Engineering builds and tests against a **fake/stand-in for the Magnific Space** — never the live
  Space (no credits, no board mutation; hermetic CI).

## Where specs and changes live

- **Capability specs (the durable truth):** `openspec/specs/<capability>/spec.md`. Each is the
  current, agreed behavior of one capability, expressed as **Requirements**, each with one or more
  **Scenarios**.
- **Changes (proposed work, one per issue):** `openspec/changes/<id>/` where `<id>` is
  `<issue-N-slug>`. The git branch for the issue carries this **same** string as its name, so the
  change-id and the branch name are guaranteed identical. A change contains:
  - `proposal.md` — why and what (the OpenSpec proposal).
  - `tasks.md` — the implementation task list (test-first ordering).
  - **spec deltas** — the additions/modifications to capability specs, written as **Requirements
    with Scenarios** (e.g. `specs/<capability>/spec.md` under the change folder, marked as
    ADDED / MODIFIED / REMOVED).
  - `handoff.md` — the one bidirectional **Slice Handoff** doc (developer Build Report + qa
    Verdict; retries append Round-N blocks, nothing overwritten).
- **Archived changes:** `openspec/changes/archive/<id>/` — where a change moves once its deltas
  have been folded into `openspec/specs/`.

## Change lifecycle

1. **Author** — the developer agent turns a GitHub issue into a full OpenSpec change: `proposal.md`
   + `tasks.md` + spec deltas (Requirements with Scenarios). Spec authoring is autonomous; no human
   reads the proposal.
2. **Implement test-first** — the developer implements the change against the tasks, tests before
   code, using the Magnific **fake** (never the live Space).
3. **qa verifies** — `qa` runs the suite, checks every issue acceptance criterion, and confirms the
   spec faithfully matches the issue. qa reads, runs, and reports only — it never edits product code.
4. **Archive** — on a qa pass and operator-approved merge, the change's spec deltas are **folded
   into** `openspec/specs/<capability>/spec.md` and the change folder moves to
   `openspec/changes/archive/`. The archive rides inside the same PR as the implementation.

## Suggested capabilities (the Producer build)

The Producer feature is expected to decompose into roughly these capabilities. Slices may add or
rename, but prefer these names so specs stay navigable:

- `production-queue` — the serialized backlog of Space generations; enqueue on accept, drain one
  generation at a time, gated Ideas never hold the Space.
- `production-spec` — generating the strict, schema'd **Production Spec** JSON from an accepted Idea
  + the Space's own generation contract.
- `execution-protocol` — reading and driving the Space's on-canvas **Execution Protocol** run-points
  (with the **Fallback Protocol** when a run-point is missing/stale/failing).
- `cast-render` — running the cast run-point to a **Cast**, pausing at the Cast gate, then rendering
  the **Asset** once the Operator picks the **Character**.
- `producer-report` — surfacing Producer/queue state and produced Assets for the pipeline report.

## Validation

The **developer** agent authors the changes. Before handoff to `qa`, **`openspec validate --strict`
must pass** for the change (and remain green through implementation). qa re-runs it. Specs and
changes both respect `../CONTEXT.md` vocabulary, the always-rules in
`../.claude/rules/always/`, ADRs `../docs/adr/0002`–`0004`, and PRD issue #1.
