# CLAUDE.md
Be brief, use plain simple English whenever possible.

Guidance for Claude Code when operating in this repository.

## Project Overview

**OrganicGrowth** is an organic-social *intelligence + production* system for **Facebook, Instagram,
YouTube, or LinkedIn** (Facebook-first today). It runs a weekly loop: discover what's trending among peer accounts → suggest brand-fit **Idea
briefs** → **render each accepted Idea into a publish-ready Asset** via a Magnific Space → (a human
publishes it) → track the posts' performance → feed it back so the next round of ideas is sharper.

**OrganicGrowth generates the Asset but never publishes it.** The `producer` renders an Idea into an
**Asset** by driving a pre-defined Magnific Space; a human reviews, makes the Recipe's pick(s) — for the
wired recipe, the **Character** — publishes to Facebook, and logs the URL. The human gate moved from *creation* to *publication* — it
was never removed (see [`docs/adr/0002`](./docs/adr/0002-producer-generates-asset-human-publishes.md)).

The domain language is defined in [`CONTEXT.md`](./CONTEXT.md) — read it before working here.

> **Multi-format (ADRs 0009–0014).** OrganicGrowth runs on the **multi-format** model. A **Format** is a
> Brand's editorial line (e.g. Straw Motion's *Unhypped News*); a **Recipe** is an in-repo, brand-agnostic
> production plan (`src/recipe/registry.ts`) — seeded today with **one** wired entry, *Character Explainer
> with Cast*. One Idea → the Operator's chosen **Recipes** (picked at Review, pre-filled from the Format)
> → **one Asset per Recipe** → one Post per Asset. Gates, the Production-Spec shape, and the copy step are
> all **per-Recipe**; the producer composes the Copy outside the Space, late, once the media exists. The
> sections below describe this model as it runs today; a second wired Recipe is future work (issue #60) —
> see the glossary for the full definitions.

## Agents

*The table below lists the **content** agents that run the weekly loop. The separate **engineering**
agents that build OrganicGrowth's code are documented under "Engineering agents (build pipeline)" below
and are intentionally kept out of this table.*

| Agent | Model | Role |
|---|---|---|
| `trend-scout` | Sonnet | Scrapes peer Pages via Apify (or, for a Brand with `curated_sources` in `seeds.yaml`, digests the Operator's own curated public newsletters instead); distills the result into **Trends** |
| `idea-strategist` | Opus | Turns Trends into ranked, brand-fit **Idea briefs** with a predicted **Fit Score** |
| `producer` | Opus | Runs each of an accepted Idea's chosen **Recipes** (ADR-0009/0010) — today the one wired **Character Explainer with Cast** Recipe: generates a **Production Spec**, drives that Recipe's Space to a **Cast**, pauses at that Recipe's gate(s), then (after the Operator picks the **Character**) renders the **Asset** and composes its **Copy** outside the Space — **one Asset per chosen Recipe** |
| `performance-tracker` | Sonnet | Pulls posts' **public** metrics via Apify; computes **Performance Score**; updates the feedback loop |

## The OrganicGrowth pipeline (weekly loop)

Run once per **Format** per week (running a whole Brand is a loop over its Formats). Steps marked 👤 are
the Operator. **The agent auto-advances through the mechanical steps and pauses only at the three human
gates (Review, each chosen Recipe's own pick-gate(s), Publish) — it never asks the Operator to run a step
it can run itself, and never renders past a gate before the Operator acts.** Gates are **per-Recipe**
(ADR-0009/0010): each Recipe declares its own ordered pick-gate list (zero, one, or several); the wired
*Character Explainer with Cast* Recipe's is the single **Cast** pick, shown as Gate 2 below.

> **Production runtime (attended).** Production runs **in the Operator's session**, not in an unattended
> background process. The `producer` is an interactive agent — given the Magnific MCP tools — that drives
> the **live** Space while the Operator is present and approves the Space calls as they happen. There is
> deliberately **no headless worker host and no unattended-permission wiring**: that "background,
> self-draining" runtime was designed (epic #39) and then dropped as unnecessary, because the Operator is
> already present at the Cast gate ([`docs/adr/0008`](./docs/adr/0008-producer-drives-the-space-attended.md)
> supersedes [`docs/adr/0004`](./docs/adr/0004-producer-serialized-background-queue.md)). The **Production
> Queue** stays as a simple to-do list of accepted Ideas; the producer works through it one at a time
> while the Operator is present — nothing drains it in the background.

1. `/run-trends <brand> <format>` → for that Brand's named **Format** (ADR-0013 — its own voice, trend
   sources/mode, and `ideas_per_run`, read from `data/brands/<slug>/formats/<format>.yaml`):
   `trend-scout` scrapes peer Pages (Apify) for posts beating their *own* page baseline, or — for a
   Format in `curated` mode — digests the Operator's own curated public newsletters instead, distilling
   **Trends**; then `idea-strategist` turns the strongest into ~10 **Idea briefs** with **Fit Scores**,
   written to `data/brands/<slug>/ideas/<format>/<run>/` and tagged with that Format. Running the whole
   Brand is a loop over its Formats.
2. 👤 **Gate 1 — Review.** `/review-ideas <brand>` → Operator accepts/rejects conversationally; every
   **Rejection Reason** is logged verbatim (v1 does not auto-apply them). **Accepting an Idea also picks
   its Recipes** (ADR-0009) — pre-filled from the Idea's Format `default_recipes`, filtered to wired
   Recipes only, trimmed/extended by the Operator; a declined Recipe is logged verbatim too (like a
   Rejection Reason). **Accepting enqueues one production job per chosen Recipe** — no separate kickoff.
3. **Production (attended, serialized).** Each accepted Idea's chosen Recipe goes on the global
   **Production Queue** (`data/queue.json`, keyed `(brand, idea, recipe)` — ADR-0009/0011). The
   `producer` runs **in the Operator's session** and works the queue one job at a time: it generates that
   Recipe's **Production Spec** from the Brief + Brand Profile, injects it, and drives the Recipe's Space
   to its first declared gate — for the wired *Character Explainer with Cast* Recipe, the **cast**
   run-point, returning the **Cast** — pausing that Asset there (`in_production`, `pending_gate: "cast"`;
   ADR-0011 retires the old `casting` status). The Space runs **one generation at a time**, so the
   Producer drives one job to completion (or its next gate) before the next; the Operator approves the
   Space calls as they happen. `/queue <brand>` shows the backlog.
4. 👤 **Gate 2 — each chosen Recipe's own pick-gate(s).** For the wired *Character Explainer with Cast*
   Recipe this is the **Cast** pick: `/pick-cast <brand> <idea-id> <n>` → Operator picks the
   **Character**; the `producer` then renders the Asset in the same session — pins the Character, runs
   the **clip** run-point, composes the **Copy** out-of-Space in the Format's voice (ADR-0012), and saves
   the finished **Asset**. That Asset moves `in_production → produced`. (The generic
   `/pick <brand> <idea-id> <recipe> <gate> <pick>` command resumes ANY wired Recipe's ANY declared gate;
   `/pick-cast` is a friendly, Cast-only alias built on it — ADR-0010.)
5. 👤 **Gate 3 — Publish.** Operator publishes the Asset to the Channel's platform, then
   `/log-post <brand> <idea-id> <recipe> <post-url>` links the published **Post** to that **(Idea,
   Recipe) Asset** (explicit attribution, keyed on the Recipe — never inferred). That Asset moves
   `produced → posted`.
6. `/track-performance <brand>` → `performance-tracker` pulls public metrics (Apify) for every posted
   Asset across every chosen Recipe, computes each one's **Performance Score** (relative to the Channel's
   one baseline), updates `data/brands/<slug>/ledger.json` and **Your Data**. This is the feedback.
7. `/report <brand>` → pipeline state, the per-Idea Fit Score vs the best measured Performance Score
   across that Idea's per-Recipe Posts (an explicit 1:N comparison — ADR-0011), what's feeding back.

**Pipeline rules:** sequential within a Format; the strategist must respect `brand-profile.yaml` and the
Idea's Format; the Operator gates **Review**, **each chosen Recipe's own pick-gate(s)**, and **Publish**;
OrganicGrowth **generates the Asset but never publishes** — a human does. Each **Recipe** (defined
in-repo, `src/recipe/registry.ts`) owns its ordered gate list, its Production-Spec shape, its copy shape,
and which Space it drives; the Space itself keeps only its on-canvas **Execution Protocol** (media
run-points) and its model selection (ADR-0007) — ADR-0010's revision of ADR-0003. The `producer` drives a
Recipe's Space per that Execution Protocol and falls back to the Space's agent for steps the run API
can't do directly (see [`docs/adr/0003`](./docs/adr/0003-producer-execution-model-on-space-protocol.md),
[`docs/adr/0010`](./docs/adr/0010-recipes-in-repo-space-media-only.md)).

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

All state is plain files, behind a typed store boundary (ADR-0014; no database for the MVP), scoped per
Brand under `data/brands/<slug>/`: `brand-profile.yaml` (Brand-wide hard rules only — banned words,
required CTA/hashtags, watermark handle, Channel/platform), `seeds.yaml` (the Apify actor slugs per
platform), `formats/<slug>.yaml` (one file per Format — its voice, trend sources/mode, `default_recipes`,
`ideas_per_run`; ADR-0013), `assets/<key>.<ext>` (a Brand's reusable media — image/video/audio, e.g.
`brand-logo.png` — a Recipe's brand-asset canvas slots are filled from here, read via the typed
`BrandAssetStore`; ADR-0016), `ideas/<format>/<run>/
idea-NN.md` (one Brief each), `ideas/<format>/<run>/idea-NN.<recipe>.spec.json` (a chosen Recipe's
**Production Spec**, written by the `producer` when that job is produced — there is **no `/produce`**
command; accepting an Idea with its chosen Recipes adds one job per Recipe to the queue), and
`ledger.json`. The Production Queue is the one exception — it is brand-agnostic at `data/queue.json`
(ADR-0006, ADR-0008).

**Ledger grain (ADR-0011).** An Idea itself only ever carries `suggested / accepted / rejected`, plus a
derived roll-up computed from its Assets (`deriveIdeaRollup`, `src/asset/asset.ts`). Production state
lives on each Idea's **Assets** — one per chosen Recipe — each moving through this lifecycle:
`queued → in_production → produced → posted → tracking → scored`. A human pick (e.g. the wired Recipe's
**Cast** pick) is a *pause* inside `in_production` (recorded as `pending_gate`), never a status of its
own — the old flat `casting`
Idea-status is retired. `/log-post <brand> <idea-id> <recipe> <post-url>` sets that Asset's status to
`posted`; `/track-performance` sets `tracking` while its Post is < 7 days old (measured but still
climbing) and `scored` once it is 7+ days old (settled — final for the feedback loop). Each Idea also
carries `fit_basis` — a short free-text note from the `idea-strategist` recording *why* the Fit Score is
what it is (the brand-fit reasoning behind the prediction). Each Asset carries `recipe`, `pending_gate`,
`spec_path`, the composed `copy` (structured `{ caption, hashtags }`), the wired Recipe's own `cast`/
`character` fields, `asset_url`, `produced_at`, `post_url`, `posted_at`, `performance_score`. Update the
ledger on every status change.

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
