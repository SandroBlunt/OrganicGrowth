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
   rides, Fit Score, hook concept, the one-line rationale, and — for the Recipe pick (see step 5) —
   the **Recipe(s) pre-filled** from the Idea's Format `default_recipes`, filtered to only **wired**
   Recipes (`isWiredRecipe`/`offeredRecipes`, `src/recipe/offer.ts` — see step 5a). Never mention a
   Format default that is not wired as if it were an option; it is not shown here at all.
4. **Take the Operator's verdict** in natural language — accept some, reject others. This is a
   conversation, not a form: let them give reasons however they like.
5. **For each ACCEPT**, first resolve the Idea's **Recipe selection**, then record it, then proceed
   with acceptance + auto-enqueue exactly as before:
   1. **Pre-fill from the Format.** Load the Idea's Format via `loadFormat(brand, idea.format)`
      (`src/format/store.ts`) — if the Idea has no `format` recorded, or the Format cannot be loaded,
      treat `default_recipes` as empty (never fabricate one). Compute the offered set with
      `offeredRecipes(format.defaultRecipes)` (`src/recipe/offer.ts`): this filters to **wired**
      Recipes ONLY — a Format default that is not in the in-repo registry
      (`src/recipe/registry.ts`) is **never offered**, no matter what the Format file says.
   2. **Let the Operator trim/extend conversationally.** Present the offered (wired) set as the
      default selection; the Operator may drop some, keep all, or ask to add another Recipe by name.
      If they ask to add a Recipe that is not wired (`isWiredRecipe` returns false), tell them it
      is not available yet and do **not** add it — an unwired Recipe is **never offered**, even on
      explicit request.
   3. **Resolve the final selection** with `resolveRecipeSelection(format.defaultRecipes, requested)`
      (`src/recipe/offer.ts`), where `requested` is the Operator's final wired-only list. This returns
      `{ chosen, declined, ignoredUnwired }`: `chosen` is what will actually produce the Idea;
      `declined` is whatever was offered (pre-filled) but not kept.
   4. **For each entry in `declined`**, capture a free-text reason from the Operator (mirrors a
      Rejection Reason) and log it **verbatim** — do **not** argue, re-pitch, or act on it (logged
      only, v1 does not auto-apply it to future suggestions).
   5. **Write the selection** via `writeIdeaRecipeSelection(ideaId, chosen, declinedWithReasons,
      { ledgerPath: resolveBrand(brand).ledger })` (`src/ledger/ledger.ts`) — `declinedWithReasons` is
      `declined` paired with each captured reason: `{ recipe, reason }`.
   6. **Then, exactly as before:** set `status: accepted` in `data/brands/<slug>/ledger.json`. If
      `chosen` is non-empty, **auto-enqueue** the Idea for production by calling
      `enqueueOnAccept(ideaId, brand, { ledgerPath: resolveBrand(brand).ledger })`
      (`src/production-queue/enqueue-on-accept.ts`) — this call is **byte-for-byte unchanged** from
      before this slice (it is Recipe-unaware; re-keying the queue per chosen Recipe is issue #56).
      All three arguments are required: the `brand` and the explicit `ledgerPath` are what tie the job
      to this Brand's ledger — omitting them enqueues a job with no Brand that is silently dropped on
      the next load, or validates acceptance against the wrong Brand's ledger. This appends one
      `cast`-phase, `status: queued` job to `data/queue.json` (the global Production Queue — ADR-0004,
      brand-agnostic). Enqueue is idempotent per Idea: re-accepting the same Idea adds no second job,
      and only `accepted` Ideas ever enter the queue (rejected Ideas cost nothing). If `chosen` is
      **empty** (the Operator declined every offered Recipe and named none to add), do **not** enqueue
      — there is nothing to produce yet; tell the Operator the Idea is accepted but not yet queued, and
      that adding a Recipe later is not yet supported (v1). Run `/queue <brand>` to see the backlog.
6. **For each REJECT:** set `status: rejected` in `data/brands/<slug>/ledger.json` and store their
   reason **verbatim** in `rejection_reason`. Log it as-is — do **not** argue, re-pitch, or act on
   it (v1 logs only).
7. **Offer replacements** (optional): if the Operator wants more, invoke **idea-strategist** with
   Brand `<brand>` for fresh briefs honoring what they just said, and add them as new `suggested` Ideas.
8. **Summarize:** the accepted set (ready to create, with its chosen Recipe(s)) and the rejected set
   (with reasons logged), all scoped to Brand `<brand>`.

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`.
- Capture every **Rejection Reason** verbatim; rejection feedback is **logged only** in v1.
- Don't pressure the Operator or defend an Idea — record the decision and move on.
- **Only wired Recipes are ever offered.** A Recipe not present in `src/recipe/registry.ts`
  (`isWiredRecipe`) is never pre-filled, never presented as an option, and never added on request —
  whether it came from the Format's `default_recipes` or the Operator asking for it by name.
- Capture every **declined Recipe**'s reason verbatim; like Rejection Reasons, this is **logged
  only** in v1 — it is never auto-applied to future suggestions or future Formats.
- Accepting an Idea **enqueues** it (ADR-0004) when at least one Recipe was chosen; the ledger stays
  the source of truth and the queue is derived from it. OrganicGrowth **generates the Asset but never
  publishes** — accepting only queues production, it does not post anything.
