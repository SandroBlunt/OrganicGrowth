---
name: run-pipeline
description: "Start and conduct the whole weekly loop for a Brand (named, picked from a menu, or created on the fly): readiness check, trends, ideas, review, production, publish, and performance offers — pausing only at the three human gates."
---

# /run-pipeline

Usage: `/run-pipeline [<brand>]`

Start and conduct the **full weekly loop** for a Brand. This is the single-entry-point conductor for
the weekly content pipeline. It drives every phase automatically and pauses only at the three human
gates. `<brand>` is **optional** — the conductor never falls back to a silent default Brand; instead,
how you invoke it selects the Brand:

- **`/run-pipeline mundotip`** (known slug) → runs the loop for that Brand.
- **`/run-pipeline newname`** (unknown slug) → offers to **create** that Brand. Accept and a short
  staged interview runs (name, niche, voice, language/region, platform, seed pages), then the Brand is
  scaffolded and the loop proceeds; decline and it stops cleanly (no directory created).
- **`/run-pipeline`** (no argument) → asks **new or existing**, listing the existing Brand slugs. Pick
  one to run it, or choose to create a new Brand (same staged interview). With no Brands yet, it goes
  straight to the new-Brand interview.

## What it does

1. **Resolves (or onboards) the Brand.** Per the invocation above. Once resolved, it identifies the
   Brand's ledger, profile, seeds, and queue paths via `resolveBrand(brand)`. Every gate prompt
   restates the Brand so the Operator is always in context.

2. **Runs the readiness check (every launch, never cached).** Live-probes:
   - The Magnific Space (accessible? credits cover at least one cast+render cycle?).
   - The Apify token (valid?).
   - The Brand config (niche, voice, seeds, channel URL, banned words).
   Silent when everything is healthy. Only surfaces issues when there are blocking gaps.
   Phase-scoped: a Space problem doesn't block trend research; a bad Apify token stops research.

3. **Prints a `/rename` hint.** Outputs a line like `/rename mundotip · 2026-W23` — paste it in
   your terminal to rename the session. The conductor does NOT rename the session itself.

4. **Detects in-flight work.** Reads the ledger and queue to determine the current phase. Only genuine
   production work counts as in-flight — accepted Ideas with an Asset `in_production` (e.g. paused at
   the Cast gate), `produced`, or `posted`/`tracking` (phases `production`, `publish`, `tracking`;
   ADR-0011 folds every chosen Recipe's Asset into the Idea's rolled-up phase). Un-reviewed `suggested`
   Ideas (phase `review`) are **not** in-flight — you just haven't started. When in-flight work exists,
   it shows the pending gates and asks you to choose:
   - `resume` — re-enqueues any stranded `accepted` Ideas and picks up where you left off.
   - `fresh` — starts a brand-new weekly Run (trend research from scratch).
   **There is no default — you must type your choice.**

5. **Drives the loop, pausing at three human gates:**

   - **Gate 1 — Review.** Invokes trend research + idea review for Brand `<brand>`. Accepting an Idea
     also picks its **Recipes** (ADR-0009, pre-filled from its Format's `default_recipes`), which enqueues
     one production job per chosen Recipe. The `producer` then works the Production Queue **in your
     session** — one Space generation at a time, with you approving the Space calls as they happen —
     driving each job to its Recipe's first declared gate. For the wired *Character Explainer with Cast*
     Recipe that is the **Cast** gate: the Asset moves to `in_production` with `pending_gate: "cast"`
     (ADR-0011 — the old flat `casting` Idea-status is retired; the Idea itself stays `accepted`).

   - **Gate 2 — each chosen Recipe's own pick-gate(s).** Presents the Ideas with an Asset waiting at a
     gate and tells you which command to run — for the wired Recipe, `/pick-cast <brand> <idea-id> <n>`
     (the generic `/pick <brand> <idea-id> <recipe> <gate> <pick>` resumes any wired Recipe's any declared
     gate). After you pick, the `producer` renders the Asset in the same session — pinning the pick,
     running the remaining media steps, composing the Copy out-of-Space — moving that Asset to `produced`.

   - **Schedule Batch approval (in-conversation, before Gate 3 — issue #148).** Once a Run's eligible
     Assets (today: *News Carousel* — Zoho's bulk path is images-only) are produced, the `producer`
     offers the **Schedule Batch** export and runs it only after you approve, in this SAME conversation,
     every one of that Run's generated outputs and captions — never unprompted. This is a distinct
     checkpoint, **not** one of the three formal gates: it is conversational only and writes nothing to
     the ledger. Only once you approve does `/export-schedule <brand> <format> <run> <start-date>` host
     each Asset's slides on S3, write the Zoho-ready CSVs + manifest, and stamp `scheduled_at` — the
     Asset's `status` stays `produced` (ADR-0011 unchanged). A self-cleaning cleanup pass runs first,
     automatically.

   - **Gate 3 — Publish.** Presents the produced Assets, their composed Copy verbatim, and waits for you
     to publish. For a Schedule Batch Asset, publishing means uploading the exported CSVs to Zoho Social
     and reviewing the queued posts there before they go live; for any other Asset (e.g. a Character
     Explainer Reel) you publish directly to the Channel — either way this is a SECOND, distinct human
     step from the Schedule Batch approval above (hosting/writing files is not publishing, ADR-0002).
     Then log the Post URL with `/log-post <brand> <idea-id> <recipe> <facebook-url>` (Recipe-
     explicit — attribution is keyed `(Idea, Recipe)`, ADR-0011). After logging, the conductor offers
     `/track-performance <brand>` and `/report <brand>`.

> **Production runtime — two paths (ADR-0008 attended; ADR-0030 unattended).** An accepted Idea's job can
> be produced either way; which path drains a given job is your own choice, not something either agent
> decides for itself.
>
> **Attended.** Production runs **in your session**, not in a background process. The `producer` is an
> interactive agent, given the Magnific MCP tools, that drives the **live** Space while you are present
> and approve the Space calls as they happen. It works the Production Queue **serially — one Space
> generation at a time** (the Space has no parallelism, and this holds across every chosen Recipe/Space
> of a Brand — ADR-0010), pausing each Asset at its Recipe's gate for your pick; a gate-paused job does
> **not** hold the Space, so the next queued job can run.
>
> **Unattended.** A separate **worker** (`src/commands/run-worker.ts`'s `drainQueue`) is a local process
> you start yourself, holding its own Magnific credentials — not a Claude Code agent session, so the
> permission classifier that originally justified attended-only mode never applies to it. It drains the
> SAME Production Queue with **no human present**, for the wired Recipes declaring zero or one gate,
> self-auditing each phase (author / bind-media / copy) before advancing, and parks a gate-paused job
> without holding the Space exactly like the attended path does. Nobody watches the render happen in real
> time on this path — ADR-0030's own Consequences section names that cost and its backstops plainly.
>
> **Gates are per-Recipe (ADR-0009/0010/0011).** An accepted Idea fans out to the Operator's chosen
> **Recipes** — one production job and **one Asset** each — and each Recipe declares its own ordered
> gate list (zero, one, or several picks); "Cast"/"Character" are the *Character Explainer with Cast*
> Recipe's own vocabulary, not universal terms. The Recipe registry (`src/recipe/registry.ts`) is
> multi-Recipe-ready; only that one Recipe is wired so far, so Gate 2 above is shown as the single Cast
> pick — a second wired Recipe (future work, issue #60) would surface its own differently-named gate(s)
> the same way.

## Guardrails

- **Brand is explicit, but optional to pass.** `<brand>` may be omitted — the conductor then asks
  new-vs-existing (or offers to create an unknown slug). It never falls back to a silent default Brand.
- **Readiness gate is HERE only.** The granular commands (`/run-trends`, `/review-ideas`,
  `/pick-cast`, `/log-post`, `/queue`, `/report`, `/track-performance`) are unguarded power-tools.
- **Generate, never publish.** The conductor pauses for Publish — it never posts to Facebook itself.
- **Resumable.** Loop state is in `data/brands/<slug>/ledger.json` + `data/queue.json`. Re-invoking
  `/run-pipeline <brand>` at any time picks up from the correct gate.
- **No duplicated logic.** The conductor delegates to existing modules: `resolveBrand`, `resolvePhase`,
  `classify`, `checkConfig`, `enqueueOnAccept`, and the granular commands.
- **The `/rename` hint (step 3) is a Brand-level cosmetic suggestion, not the Run id.** It prints the
  current ISO week BEFORE any Format is chosen, and a Brand may run several Formats of different
  cadences at once, so it cannot know a per-Format cadence yet. The actual Run naming — the current
  ISO week for a weekly Format, the current ISO date for a daily Format (ADR-0022) — is decided by
  `/run-trends`, which DOES know the invoked Format's `cadence`. Running `/run-trends` again within
  the same cadence period continues that Run (its output directory already exists) unless you pass a
  different `<run-id>` or the Operator picks `fresh` here.
