# CLAUDE.md

Guidance for Claude Code when operating in this repository.

## Project Overview

**OrganicGrowth** is an organic-social *intelligence + production* system for **Facebook, Instagram, or
LinkedIn** (Facebook-first today). It runs a weekly loop: discover what's trending among peer accounts → suggest brand-fit **Idea
briefs** → **render each accepted Idea into a publish-ready Asset** via a Magnific Space → (a human
publishes it) → track the posts' performance → feed it back so the next round of ideas is sharper.

**OrganicGrowth generates the Asset but never publishes it.** The `producer` renders an Idea into an
**Asset** (a Reel) by driving a pre-defined Magnific Space; a human reviews, picks the **Character**,
publishes to Facebook, and logs the URL. The human gate moved from *creation* to *publication* — it
was never removed (see [`docs/adr/0002`](./docs/adr/0002-producer-generates-asset-human-publishes.md)).

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md) — read it before working here.

## Agents

*The table below lists the **content** agents that run the weekly loop. The separate **engineering**
agents that build OrganicGrowth's code are documented under "Engineering agents (build pipeline)" below
and are intentionally kept out of this table.*

| Agent | Model | Role |
|---|---|---|
| `trend-scout` | Sonnet | Scrapes peer Pages via Apify; distills over-performing posts into **Trends** |
| `idea-strategist` | Opus | Turns Trends into ranked, brand-fit **Idea briefs** with a predicted **Fit Score** |
| `producer` | Opus | Drives a Magnific Space: generates a **Production Spec** from an accepted Idea, runs the Space to a **Cast**, then (after the Operator picks the **Character**) renders the **Asset** |
| `performance-tracker` | Sonnet | Pulls posts' **public** metrics via Apify; computes **Performance Score**; updates the feedback loop |

## The OrganicGrowth pipeline (weekly loop)

Run once a week. Steps marked 👤 are the Operator. **The agent auto-advances through the mechanical
steps and pauses only at the three human gates (Review, Cast pick, Publish) — it never asks the
Operator to run a step it can run itself, and never renders past a gate before the Operator acts.**

> **Not-yet-wired caveat (production runtime).** The unattended production steps below (3 and 4 —
> draining the Production Queue, running the Space, rendering the Asset) describe the *intended*
> design, not a runtime that exists today. There is **no live Magnific adapter, no worker host, and no
> real unattended-permission wiring** — the only Space implementations are the test fakes, and nothing
> in production calls the queue worker. Until that runtime is built (a future build slice), accepting
> an Idea enqueues it but no Cast or Asset is produced automatically. Treat every "the producer drains
> the queue in the background / renders unattended" phrasing in this file as design intent, not
> shipped behaviour.

1. `/run-trends` → `trend-scout` scrapes peer Pages (Apify) for posts beating their *own* page
   baseline → distills **Trends**; then `idea-strategist` turns the strongest into ~10 **Idea
   briefs** with **Fit Scores**, written to `data/brands/<slug>/ideas/<run>/`.
2. 👤 **Gate 1 — Review.** `/review-ideas` → Operator accepts/rejects conversationally; every
   **Rejection Reason** is logged verbatim (v1 does not auto-apply them). **Accepting an Idea enqueues
   it for production** — no separate kickoff.
3. **Production (background, serialized).** As soon as an Idea is accepted, the `producer` works the
   **Production Queue**: generates a **Production Spec** from the Brief + the Space's own system prompt,
   injects it, runs the **cast** run-point, returns the **Cast**, and pauses that Idea at the Cast gate
   (status `accepted → casting`). The Space runs **one generation at a time**, so the Producer
   serializes the queue; an Idea waiting at its gate does **not** hold the Space — the next queued
   cast-gen proceeds meanwhile. `/queue` shows the backlog.
4. 👤 **Gate 2 — Cast pick.** `/pick-cast <idea-id> <n>` → Operator picks the **Character**; the
   `producer` **queues the render**, then renders to completion *unattended* when the Space is free —
   pins the Character, runs the **clip** run-point, saves the finished **Asset**. Status
   `casting → produced`.
5. 👤 **Gate 3 — Publish.** Operator publishes the Asset to the Channel's platform, then `/log-post <idea-id> <post-url>`
   links the published **Post** to its **Idea** (explicit attribution — never inferred). Status
   `produced → posted`.
6. `/track-performance` → `performance-tracker` pulls public metrics (Apify), computes the
   **Performance Score** (relative to the Channel baseline), updates `data/brands/<slug>/ledger.json`
   and **Your Data**. This is the feedback.
7. `/report` → pipeline state, Fit Score vs actual Performance, what's feeding back.

**Pipeline rules:** sequential; the strategist must respect `brand-profile.yaml`; the Operator gates
**Review**, **Cast pick**, and **Publish**; OrganicGrowth **generates the Asset but never publishes** —
a human does. The `producer` drives the Space per its on-canvas **Execution Protocol** and falls back
to the Space's agent for steps the run API can't do directly (see
[`docs/adr/0003`](./docs/adr/0003-producer-execution-model-on-space-protocol.md)).

## Engineering agents (build pipeline)

These agents **BUILD** OrganicGrowth code; they are **NOT** part of the weekly content loop and never
run except when `/build-issue` is invoked against a `ready-for-agent` GitHub issue. They are a
different species from the content agents above — do not confuse the engineering **`developer`** agent
(writes code) with the content **`producer`** agent (drives a Magnific Space at runtime). They are
**not** domain vocabulary and are deliberately absent from [`CONTEXT.md`](./CONTEXT.md) and from the
content Agents table.

| Agent | Model | Role |
|---|---|---|
| `developer` | Sonnet | Implements one build slice: authors an OpenSpec change from the issue, then builds it test-first against a **fake** Magnific Space |
| `qa` | Sonnet | The only non-human gate: runs tests, verifies the acceptance criteria and that the spec matches the issue, reports a verdict; never edits code |

### Development pipeline (per slice)

`/build-issue <issue#>` is the **only** trigger. One issue per run → one branch → one PR; the agents
**never self-select work**. Issue repo is `SandroBlunt/OrganicGrowth`.

1. **Pre-flight.** `/build-issue <issue#>` refuses to run unless the issue is labeled `ready-for-agent`
   and every "Blocked by" issue is closed/merged. If a blocker is open, **stop and explain** — no PR.
2. **Developer.** Turns the issue into a full **OpenSpec** change (proposal + `tasks.md` + spec deltas
   written as Requirements with Scenarios) under `openspec/changes/<issue-N-slug>/` — autonomously, no
   human reads the proposal. Then implements **test-first** against the **fake Magnific Space** (never
   the live Space; no `spaces_*`/`creations_*` calls, no credits, no board mutation — the `developer`
   is not given the Magnific MCP tools). Self-reviews: `openspec validate --strict` green + full test
   suite green + one self code-review/simplify pass before handoff.
3. **QA.** Runs all tests and confirms green; verifies the code satisfies every acceptance criterion;
   verifies the developer's OpenSpec spec faithfully matches the issue; confirms no live-Space calls
   (the fake is used) and that the always-rules hold in the built code (generate-never-publish,
   public-metrics-only, relative-not-absolute, explicit-attribution, ledger-as-source-of-truth). QA
   **reads, runs, and reports only — never edits product code.**
4. **On fail.** `/build-issue` hands QA's defects back to the `developer`, which fixes and resubmits;
   QA re-verifies. Bounded to **2 retry rounds (3 QA attempts total)**. Still failing after that →
   **stop, post the defect list, notify the Operator.** No PR, no merge, no infinite loop.
5. **On pass.** Open a branch `<issue-N-slug>` + PR via `gh`, attach the QA verdict, notify the
   Operator, and **suggest merging that specific PR**. On the Operator's verbal approval the agent runs
   `gh pr merge` itself and closes the issue (the Operator never uses the GitHub merge UI). The OpenSpec
   archive (folding spec deltas into `openspec/specs/`) rides inside this same PR.

**Channel:** one bidirectional **Slice Handoff** doc per slice at
`openspec/changes/<issue-N-slug>/handoff.md` carries `developer` ⇄ `qa` communication — the `developer`
writes a Build Report, `qa` appends a QA Verdict, and retries append Round-N blocks (nothing is
overwritten). This is **not** a session handoff and **not** OpenSpec `tasks.md`. **Spec store:** all
specs and changes live under `openspec/` (`project.md`, `specs/`, `changes/`).

**Two pipelines, one repo:** the content loop (`trend-scout` / `idea-strategist` / `producer` /
`performance-tracker`) discovers Trends and produces Assets weekly; the build pipeline (`developer` /
`qa`) writes the code that makes that loop work, and only when handed a GitHub slice. They share no
agents, no gates, and no schedule.

## Stack & conventions

Versions and deps live in [`package.json`](./package.json) and [`tsconfig.json`](./tsconfig.json) —
those are the source of truth, not this list. What's worth knowing because it's easy to get wrong:

- **Node ≥20, TypeScript, ESM.** `"type": "module"` with `NodeNext` resolution and
  `allowImportingTsExtensions` — so **relative imports must include the `.ts` extension**
  (`import { loadQueue } from "../production-queue/store.ts"`). `verbatimModuleSyntax` is on, so use
  `import type` for type-only imports.
- **Tests use Node's built-in runner, not Jest/Vitest.** `import { describe, it } from "node:test"`
  and `import assert from "node:assert/strict"`. Run with `npm test` (which also type-checks via
  `tsc --noEmit` first). Test files are `src/**/*.test.ts`; run a single file with
  `node --import tsx --test src/path/to/file.test.ts`.
- **Strict compiler.** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`/`noUnusedParameters`, `noImplicitOverride`. Code that compiles elsewhere may be
  rejected here — handle `undefined` from index access and don't leave unused bindings.
- **`tsx` runs `.ts` directly** (commands, tests); `npm run build` emits to `dist/` via
  `tsconfig.build.json`. Only one runtime dependency (`yaml`); prefer the standard library over adding
  deps.

## State

All state is plain files (no database), scoped per Brand under `data/brands/<slug>/`:
`brand-profile.yaml`, `seeds.yaml`, `ideas/<run>/idea-NN.md` (one Brief each),
`ideas/<run>/idea-NN.spec.json` (the **Production Spec**, written by the background `producer` when an
accepted Idea is produced — there is **no `/produce`** command; accepting an Idea auto-enqueues it),
and `ledger.json` (Idea ⇄ Cast ⇄ Asset ⇄ Post ⇄ Performance, with status). The Production Queue is the
one exception — it is brand-agnostic at `data/queue.json` (ADR-0004, ADR-0006).
Lifecycle: `suggested → accepted → casting → produced → posted → tracking → scored` (or `rejected`).
`/log-post` sets `posted`; `/track-performance` sets `tracking` while a Post is < 7 days old (measured
but still climbing) and `scored` once it is 7+ days old (settled — final for the feedback loop).
Each Idea also carries `fit_basis` — a short free-text note from the `idea-strategist` recording *why*
the Fit Score is what it is (the brand-fit reasoning behind the prediction). The Producer adds ledger
fields `cast`, `character`, `asset_url`, `produced_at`. Update the ledger on every status change.

## Data sources

- **Apify** does two jobs: peer-Page scraping (Trends) and our-own-post scraping (Performance). Both
  **public metrics only**. `APIFY_API_TOKEN` lives in `.env`.
- **Meta Content export** (in `data/brands/<slug>/your-data/`) is an *optional* enrichment for Saves /
  Net-follows / watch-through. It is git-ignored — keep it there, never at the pre-migration root
  `data/your-data/`. See [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).

## Rules & Standards

Always-on rules live in `.claude/rules/always/` and are loaded automatically:
- `organicgrowth-rules.md` — the non-negotiables (no content generation, public-metrics-only, relative-not-absolute, explicit attribution).
- `data-handling.md` — secrets, exports, defensive parsing.
