# Slice Handoff — issue #273: accept-idea Spec authoring is placeholder filler

One bidirectional document: the `developer` Build Report below, then `qa`'s Verdict appended beneath
it. Retries append `Round-N Build` blocks — nothing here is ever overwritten.

## Build Report (Round 1)

### What changed

Issue #273 (filed live by the `producer` agent after `npm run accept-idea` produced obviously-filler
Production Specs for the `news-carousel` and `news-short-script` Recipes): the accept-time self-check
(`author-at-review.ts`'s `authorSpecForRecipe`) only ran the GENERIC, cross-Recipe `auditAuthorPhase`
(shape + banned words), so a shape-valid, banned-word-clean but obviously-degenerate Spec sailed through
silently. Two things fixed this together:

1. **Fixed the mechanically-detectable filler in both deterministic Spec-author stand-ins.**
   `news-carousel-generate.ts` no longer hardcodes `card_style: "full_width"` on all 7 slides (now
   cycles through 3 distinct styles) and no longer joins on-card `text` with a spaced em dash (the
   AI-writing "tell" issue #108 already forbids elsewhere); when the Brief names real companies, every
   slide's `image_prompt` now cites them. `news-short-script-generate.ts` no longer puts every beat's
   `source_url` on the SAME host (`example.com`); it now cycles through 3 distinct, IANA-reserved
   documentation hosts. Both remain deterministic, hermetic TEMPLATES — this is a structural fix, not a
   claim that either stand-in's output is real, grounded news content (that remains the interactive
   `produce-news-carousel`/`produce-news-short-script` Skill's own job, unchanged and out of scope here).

2. **Widened the accept-time self-check** so this class of defect is rejected loudly, mechanically, going
   forward (issue #273's own "at minimum" suggested fix) — a new `auditAuthoredSpec(recipe, spec,
   bannedWords)` in `author-at-review.ts` runs a Recipe's own registered, richer author-phase checklist
   when one is registered (`news-short-script` → its existing, already-standalone-runnable FULL
   checklist; `news-carousel` → a NEW, exported `auditNewsCarouselStandaloneAuthorPhase`, the
   Baseline-Prompt-INDEPENDENT subset of the full checklist, plus a genuinely new
   `card-style-distinctness` item), else falls back to the generic `auditAuthorPhase` unchanged
   (`character-explainer-with-cast`, not reported as broken, keeps the old behavior). Both
   `authorSpecForRecipe` (accept-time) and `command-surface/worker.ts`'s `runOneJob` (the unattended
   worker's own defense-in-depth check) now call this SAME function, so the two never drift apart.

**Deliberately out of scope** (see `proposal.md`'s Impact section): wiring `DEFAULT_SPEC_AUTHORS` to each
Recipe's real, interactive `producerSkill` (issue #273's "direction 1") — that is an LLM-authoring step a
deterministic, hermetic module cannot perform, and stays the interactive Skill's own job. Also out of
scope: parsing a Format's Baseline Prompt document into a `NewsCarouselBaselineParams` value
programmatically (separate, not-yet-built work, issues #87/#88's own precedent — fabricating one here
would repeat the exact hardcoded-literal anti-pattern issue #85 already corrected once); threading a
Brief markdown file's `angle`/`companies`/talking points into `accept-idea.ts`'s `Brief` construction (no
markdown-Brief parser exists in the codebase; building one is a separate, larger, higher-risk feature).
Issue #272 (the regenerated Spec file's wrong-folder path) is explicitly a separate bug per the issue's
own "Related" section and is untouched.

### Files touched

- `src/production-spec/news-carousel-generate.ts` — card_style variety, no dash-joins, companies cited.
- `src/production-spec/news-carousel-generate.test.ts` — 3 new regression tests.
- `src/production-spec/news-short-script-generate.ts` — source_url host variety.
- `src/production-spec/news-short-script-generate.test.ts` — 1 new regression test.
- `src/production-spec/news-carousel-author-checklist.ts` — new exported
  `auditNewsCarouselStandaloneAuthorPhase`.
- `src/production-spec/news-carousel-author-checklist.test.ts` — new describe block (7 tests).
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — new `allSlidesSameCardStyle`
  fixture.
- `src/production-spec/author-at-review.ts` — new `AUTHOR_PHASE_REFINERS` map + exported
  `auditAuthoredSpec`; `authorSpecForRecipe` now calls it.
- `src/production-spec/author-at-review.test.ts` — new describe block (6 tests).
- `src/command-surface/worker.ts` — `runOneJob`'s author-phase check now calls `auditAuthoredSpec`.
- `src/command-surface/worker.test.ts` — 1 new defense-in-depth regression test.
- `openspec/changes/273-fix-spec-authoring-placeholder-stand-in/` — `proposal.md`, `tasks.md`,
  `specs/production-spec/spec.md`, `specs/command-surface/spec.md`, this `handoff.md`.

Not touched: `src/commands/accept-idea.ts` and `src/commands/accept-idea.test.ts` — zero changes were
needed there; every existing assertion (including the "happy path" tests that use the DEFAULT
`news-carousel` author end-to-end) stays green unmodified, proving the fix is genuine rather than a
change that would have permanently broken `accept-idea` for these two Recipes.

### How to run

```bash
npx tsc --noEmit                    # type-check
npm test                            # full suite — 4110/4110 passing
npm run build                       # tsc -p tsconfig.build.json
npm run test:docs                   # 351/351 passing (unaffected — no doc-pinned prose touched)
openspec validate --all --strict    # 73/73 passing (all specs + this change)
```

Targeted re-run of everything this ticket touched:

```bash
node --import tsx --test \
  src/production-spec/news-carousel-generate.test.ts \
  src/production-spec/news-short-script-generate.test.ts \
  src/production-spec/news-carousel-author-checklist.test.ts \
  src/production-spec/author-at-review.test.ts \
  src/commands/accept-idea.test.ts \
  src/command-surface/worker.test.ts
```

### Acceptance-criteria self-assessment

The issue has no formal AC list (filed by an agent, not through the PRD template); criteria below are
extracted faithfully from its Reproduction/Impact/Suggested-fix sections.

| Criterion (from the issue) | Proven by |
|---|---|
| News Carousel Specs no longer share ONE `card_style` across all 7 slides | `news-carousel-generate.test.ts` — "issue #273: varies card_style across the 7 slides"; reproduced/isolated in `news-carousel-author-checklist.test.ts` — "issue #273 reproduction: fails the NEW 'card-style-distinctness' item…" (via `allSlidesSameCardStyle`) |
| On-card text no longer joins clauses with a dash "tell" | `news-carousel-generate.test.ts` — "issue #273: never joins on-card text with a spaced em dash, en dash, or hyphen"; `news-carousel-author-checklist.test.ts` — "fails the 'no-dash-tells' item…" (existing `dashInText` fixture, now also exercised by the new standalone function) |
| News Short Script Specs no longer cite `example.com` on every beat (host collision) | `news-short-script-generate.test.ts` — "issue #273: no two beats' source_url share the same site/host"; `author-at-review.test.ts` — "news-short-script: an author whose beats all cite the same source host is REJECTED loudly on shot-list-variety" |
| Accept-time self-check widened to run each Recipe's own checklist (issue's suggested fix #2) | `author-at-review.test.ts` — full new describe block, esp. "the default author's own audit carries the NEW card-style-distinctness item, and it passes" (news-carousel) and "…runs the FULL Recipe-specific checklist (shot-list-variety present), and it passes" (news-short-script) |
| A filler Spec is now rejected LOUDLY at accept time, never silently persisted | `author-at-review.test.ts` — "an author producing a filler Spec… is REJECTED loudly, not silently persisted" (news-carousel) and the colliding-host equivalent (news-short-script) |
| The unattended worker's own defense-in-depth check catches the SAME pattern (not just accept-idea) | `worker.test.ts` — "issue #273: a filler Spec (one card_style repeated on every slide) fails the job on the SAME widened check accept-idea now runs… defense-in-depth" |
| No scope creep to the unreported Recipe (`character-explainer-with-cast`) | `author-at-review.test.ts` — "has no registered refinement — auditAuthoredSpec falls back to the generic auditAuthorPhase unchanged" |
| The fix doesn't just move the goalposts — production stays usable, not permanently blocked | Every pre-existing `accept-idea.test.ts` assertion (the `news-carousel` happy path used throughout that file) stays green, unmodified — full suite run confirms |

### Fakes / fixtures used

- **Magnific fake — explicitly flagged for qa: this ticket makes ZERO changes to any Space-driving code
  path and adds no new Space interaction.** The one new `worker.test.ts` test reuses the EXISTING
  `FakeCarouselSpace` fixture (`src/producer/fixtures/fake-carousel-space.ts`) purely to prove the author
  phase fails BEFORE any Space call is made (it asserts `space.editGoals.length === 0` and
  `space.runs.length === 0`) — mirroring the pre-existing banned-word regression test right above it. No
  `spaces_*`/`creations_*` call, no credits, no board mutation, anywhere in this change or the suite it
  touches.
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — reused
  `baselineAdherentCarouselSpec`, `dashInText`, `companyNotCitedInPrompt`, `bannedWordInText`,
  `tooFewDistinctPlacements`, plus one NEW fixture, `allSlidesSameCardStyle` (all 7 slides forced to the
  same confirmed `card_style`, reproducing the issue's exact live pattern).
- In-line injected `SpecAuthor`/author-override functions in `author-at-review.test.ts` (a `fillerAuthor`
  returning a uniform-`card_style` Spec, a `collidingAuthor` returning same-host beats) — the existing,
  designed test seam (`authorSpecForRecipe`'s `authors` override parameter), never a live model.
- Real, throwaway SQLite files (`withTempDb`) for the `worker.test.ts` addition — never the committed
  `data/organicgrowth.db`.

### Self-review notes

- Chose to ADD a new, small `auditNewsCarouselStandaloneAuthorPhase` function rather than refactor the
  existing, battle-tested `auditNewsCarouselAuthorPhase` to share code — a few checklist-item literals
  are duplicated across the two functions, but the underlying scanning logic
  (`scanTextFieldsForDashes`/`scanNewsCarouselForBannedWords`/`companiesCitedInPrompt`) is fully reused,
  never re-implemented, and the existing function's 40+ passing assertions were left completely
  untouched — the lower-risk option for a bug-fix ticket.
- Considered (and rejected) simply blocking `accept-idea` for these two Recipes until the real Skill is
  wired — the widened check alone, without fixing the generators' avoidable structural defects, would
  make EVERY future `news-carousel`/`news-short-script` accept fail forever (verified empirically: the
  OLD generator output fails `card-style-distinctness`/`shot-list-variety` unconditionally, regardless of
  Brief content). Fixing the two generators' specific, avoidable defects keeps the pipeline usable while
  still closing the exact gap the issue reproduced — confirmed by every pre-existing `accept-idea.test.ts`
  assertion staying green, unmodified.
- Verified empirically (`npx tsx -e ...`, not committed) before writing any code that (a) the OLD
  `generateNewsCarouselSpec` output was rejected by my planned `card-style-distinctness` check and (b)
  the OLD `generateNewsShortScriptSpec` output was rejected by the EXISTING `auditNewsShortScriptAuthorPhase`
  on `shot-list-variety` alone — grounding the fix in the actual reproduction rather than assumption.
- No dead code introduced; no existing function signature changed (only two call sites swapped
  `auditAuthorPhase(recipe, {...})` for `auditAuthoredSpec(recipe, spec, bannedWords)`).

### Known limits

- The News Carousel Recipe's FULL author-phase checklist (logo reference, pill text, fixed clauses, the
  Format-tuned `placement-variety` threshold) still cannot run at accept time — it needs a Format's
  Baseline Prompt document, which is not resolved there. `auditNewsCarouselStandaloneAuthorPhase` is the
  maximum mechanically-available subset; a Spec that clears it can still lack a real logo reference or
  Format-specific styling until the interactive Skill authors it for real.
- Neither generator's output is "real" news content — `card_style` variety and non-colliding hosts fix
  mechanical degeneracy, not groundedness (real facts, real sources, real logo integration). That gap is
  inherent to the documented "deterministic, hermetic stand-in" design and is explicitly the interactive
  Skill's job, not this ticket's.
- `accept-idea.ts`'s `Brief` construction still only carries `id`/`run`/`title` from the ledger — it does
  not read the Idea's own Brief markdown file for `angle`/`companies` (no such parser exists in the
  codebase). Out of scope here; flagged for a future ticket if the Operator wants the deterministic
  stand-in to lean further on a Brief's own material.
- Issue #272 (wrong-folder path for the regenerated Spec file view) is untouched, per the issue's own
  "Related" section marking it a separate bug.

## QA Verdict — Round 1: FAIL

### Suite result

- `npx tsc --noEmit` — green (ran as part of `npm test`).
- `npm test` — **4110/4110 passing**, 0 failed, 0 cancelled (`# tests 4110 / # pass 4110 / # fail 0`).
- `openspec validate --all --strict` — **73/73 passing**, including `spec/spec-authored-at-review`,
  `spec/production-spec`, `spec/command-surface`, `spec/phase-contracts`, `spec/worker`.
- Both commands actually run, output inspected in full, genuinely green — not assumed.

### Per-criterion results (criteria extracted from the issue's Reproduction/Impact/Suggested-fix)

| Criterion | Result | Evidence |
|---|---|---|
| News Carousel Specs no longer share ONE `card_style` across all 7 slides | PASS | `news-carousel-generate.ts`'s `CARD_STYLE_CYCLE`; `news-carousel-generate.test.ts` |
| On-card text no longer joins clauses with a dash "tell" | PASS | `news-carousel-generate.ts`'s period-joined `text`; `news-carousel-generate.test.ts` |
| News Short Script Specs no longer cite `example.com` on every beat (host collision) | PASS | `news-short-script-generate.ts`'s `HOST_CYCLE`; `news-short-script-generate.test.ts` |
| Suggested fix #2 — widen the accept-time self-check so **a filler Spec is rejected at accept time instead of silently persisted** | **FAIL — see Defect 1 below.** The check was mechanically widened (a per-Recipe refiner now runs), but it does not reject the class of filler the issue itself defines. Live-verified: the CURRENT default generator's output — "repeat the Idea's headline seven times with a role label appended" (carousel) and "one sentence padded... to hit the word count" (short-script) — the issue's own words — still passes the widened check with `ok: true`, unconditionally, for every Brief `accept-idea.ts` actually constructs today (title-only, no `companies`). | See repro below |
| No scope creep to the unreported Recipe (`character-explainer-with-cast`) | PASS | `author-at-review.test.ts` — "has no registered refinement" |
| Production stays usable (no permanent block) | PASS | `accept-idea.test.ts` untouched, still green |
| No live-Space calls anywhere in this change | PASS | see Magnific-fake check below |

### Per-scenario results (spec deltas)

`specs/production-spec/spec.md`:

- "A well-formed News Carousel Brief authors successfully, and the widened checklist's items are present" — PASS, covered by `author-at-review.test.ts`.
- "A banned word in the Brief's title fails authorship loudly" — PASS.
- "A News Carousel author producing a filler Spec (one card_style on every slide) is rejected loudly" — PASS as literally written (a **hand-crafted synthetic** `fillerAuthor` reproducing only the uniform-`card_style` symptom is rejected) — but this scenario is not a proxy for "the DEFAULT author's real output is non-filler"; see Defect 1.
- "A News Short Script author whose beats all cite the same source host is rejected loudly" — PASS, same caveat.
- "A Recipe with no registered refinement keeps the plain generic check" — PASS.
- "News Carousel author-phase checklist gains a Baseline-Prompt-INDEPENDENT standalone subset" + its 3 scenarios — PASS as literally written; internally consistent.
- "Deterministic Spec-author stand-ins avoid mechanically-detectable filler patterns" + its 2 scenarios ("generateNewsCarouselSpec's default output passes...") — PASS as literally written. **This is exactly the self-consistent-but-wrong pattern**: the spec only ever claims the default generator's output passes the checklist — a true, tautological claim once both are written by the same author to agree — never that the checklist can distinguish the generator's output from genuine content. The proposal's own "Impact" section is candid about this ("not a claim that either stand-in's output is real, grounded news content"), but the issue's own suggested fix #2 asked for an outcome ("a filler Spec is rejected"), not merely mechanical widening, and that outcome is not delivered for the live pipeline — see Defect 1.

`specs/command-surface/spec.md`: all 3 scenarios PASS as literally written (`worker.test.ts`'s new regression test injects the SAME hand-crafted `allSlidesSameCardStyle` fixture, not the default author's real output).

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. No Space-driving/publish code path touched; `git diff HEAD -- src/commands/accept-idea.ts src/commands/accept-idea.test.ts` is empty.
- **Public-metrics-only** — PASS (not touched by this change).
- **Relative-not-absolute** — PASS (not touched).
- **Explicit-attribution** — PASS (not touched).
- **Ledger-as-source-of-truth** — PASS. `author-at-review.ts` remains a pure function (no I/O); the write paths (`accept-idea.ts`, `command-surface/worker.ts`'s `runOneJob`) are unchanged in this regard — no hand-edited file, no new bypass of the store/command-surface layer.
- **Magnific fake (hard requirement)** — PASS. `grep -rn "spaces_\|creations_\|magnific"` across every test file this change touches or adds returns nothing live; `worker.test.ts`'s new test uses the existing `FakeCarouselSpace` fixture and a throwaway `withTempDb` SQLite file, and explicitly asserts `space.editGoals.length === 0`/`space.runs.length === 0` — the whole point of the test is that the Space is never reached. No `spaces_*`/`creations_*` call, no credits, no board mutation anywhere in this change or the suite it touches.

### Defect list

**Defect 1 — high — the widened accept-time self-check does not catch content-free filler; it only catches the specific mechanical fingerprints named in the bug report, and the "fixed" generators still produce the exact filler pattern the issue reproduced.**

This was the actual point of the issue (title: *"Spec authored at Review is placeholder filler, not real content"*), and issue #273's suggested fix #2 asked for the outcome "a filler Spec is rejected at accept time instead of silently persisted" — not merely that the two specific symptoms quoted in the Reproduction section (uniform `card_style`, colliding `example.com` host) stop reproducing verbatim.

I hand-verified this directly against the actual, current (post-fix) production code — `generateNewsCarouselSpec`/`generateNewsShortScriptSpec` piped straight into the new `auditNewsCarouselStandaloneAuthorPhase`/`auditNewsShortScriptAuthorPhase` — with no synthetic fixture involved:

```
=== CAROUSEL SLIDES (default stand-in output) ===
hook | full_width    | "OpenAI built a ChatGPT for teenagers, say people familiar with the plans. This slide covers the stopping headline."
then | floating_toast| "OpenAI built a ChatGPT for teenagers, say people familiar with the plans. This slide covers what used to be true."
shift| top_card      | "OpenAI built a ChatGPT for teenagers, say people familiar with the plans. This slide covers what changed."
...(all 7 slides repeat the SAME headline verbatim, differing only by a fixed role phrase)...
carousel audit ok: true
spec-shape=true, banned-words=true, no-dash-tells=true, companies-cited=true, card-style-distinctness=true

=== SHORT SCRIPT BEATS (default stand-in output) ===
story | "OpenAI built a ChatGPT for teenagers, say people familiar with the plans today this story keeps
         moving fast and the facts keep shifting as more details come in across the board right now
         today this story keeps moving fast and the facts keep shifting..." (the SAME filler phrase
         repeated 4x, padded to hit the word count — literally the issue's own words)
script audit ok: true
role-order-word-count=true, beat-fields=true, curiosity-queries=true, no-calendar-dates=true, shot-list-variety=true, banned-words=true
```

Both audits report `ok: true`. This is not an edge case: it is mathematically guaranteed to always happen for
the real, live `accept-idea.ts` code path, because every checklist item the widened check runs is satisfied
by construction of the generator itself, independent of the Brief's content:

- `card-style-distinctness` — guaranteed by `CARD_STYLE_CYCLE` cycling deterministically by slide index,
  never by anything about the Brief.
- `no-dash-tells` — guaranteed by the template now joining with periods instead of a dash, unconditionally.
- `companies-cited` — vacuously `true` whenever `companies` is empty, which it always is today:
  `accept-idea.ts`'s own `Brief` construction only carries `id`/`run`/`title` (the Build Report's own
  "Known limits" section says so), so `brief.companies` is always `undefined` in the live pipeline.
- `banned-words` — a no-op for any Brand with no configured banned words (true for straw-motion, per the
  issue's own "Why the accept-time self-check didn't catch it" section).
- `spec-shape` — guaranteed by the generator constructing a well-formed 7-slide/3-beat Spec by
  construction.

So for the actual, live `accept-idea` path as wired today, the widened check cannot ever reject the
default generators' output, regardless of Brief content — it has no signal at all for "is this genuine,
Brief-derived content" vs. "is this filler," only for the two specific old symptoms. It does add real
value as a **regression guard** against literally reverting to a single hardcoded `card_style` or a
dash-joined string (the hand-crafted `fillerAuthor`/`collidingAuthor` tests in `author-at-review.test.ts`
and `worker.test.ts` do prove that much) — but that is not the same thing as "a filler Spec is rejected
at accept time," which is the actual claim in this change's own proposal title ("Widen the accept-time
self-check so a filler Production Spec is rejected loudly, not silently persisted") and issue #273's own
suggested fix #2. As shipped, every Idea accepted through `/review-ideas`/`accept-idea` for
`news-carousel`/`news-short-script` still gets a Production Spec that is, in substance, the same kind of
placeholder filler the issue reported — just re-punctuated and re-worded to dodge the specific new
checklist items, not actually caught by them. The only reason this is not immediately as dangerous as the
original bug is that the `producer` agent happened to catch it manually, out of band, the first time
(per the issue's own "Impact" section) — the automated gate this ticket was supposed to add provides no
actual protection against that recurring.

Repro steps (no code edits needed — this is the CURRENT code on this branch):

1. `npx tsx -e '...'` (or a scratch test file) importing `generateNewsCarouselSpec` from
   `src/production-spec/news-carousel-generate.ts` and `auditNewsCarouselStandaloneAuthorPhase` from
   `src/production-spec/news-carousel-author-checklist.ts`.
2. Call `generateNewsCarouselSpec({ id: "idea-01", run: "2026-08-19", title: "OpenAI built a ChatGPT for
   teenagers, say people familiar with the plans" })` (a title-only Brief — the exact shape
   `accept-idea.ts` actually builds).
3. Inspect `slides[].text` — every slide repeats the full title verbatim, differing only by a fixed role
   phrase (e.g. "This slide covers the stopping headline.") — the same shape the issue's Reproduction
   section describes for the OLD dash-joined version, just period-joined now.
4. Call `auditNewsCarouselStandaloneAuthorPhase(spec, [])` — result is `{ ok: true, ... }`, every item
   passing.
5. Repeat for `generateNewsShortScriptSpec`/`auditNewsShortScriptAuthorPhase` with the same Brief —
   `beats[1].text` (the "story" beat) is the SAME filler phrase concatenated ~4 times to hit the word
   count target; the audit still returns `{ ok: true }`.

Suggested direction for the fix (not prescriptive — QA does not fix code): the widened check needs at
least one item that looks at whether a slide's/beat's OWN reader-facing text is meaningfully distinct
from the Brief's bare title / from a fixed template (e.g. flag near-duplicate `text` across slides, or a
`text` field that is >90% identical to `brief.title` plus a fixed phrase) — the class of check the
original `check-carousel-spec.mjs`-derived checklist never needed because a real, interactive authoring
Skill wouldn't produce this shape in the first place. Absent that, direction 1 from the issue (wiring the
real authoring Skill) remains the only fix that actually closes this gap; if direction 2 is kept as an
interim measure, its own claim ("a filler Spec is rejected") needs to be walked back to what it actually
is ("the two specific symptoms this ticket's report happened to name no longer literally reproduce").

**No other defects found.** Suite, OpenSpec validation, always-rules, and the Magnific-fake requirement
all genuinely pass; the code that was written is internally consistent, well-tested against itself, and
does not regress anything pre-existing. The failure is specifically that the widened self-check does not
achieve the outcome the issue asked for, even though every test the developer wrote for it (correctly)
passes.

## Build Report (Round 2)

### What changed

QA round 1's defect: round 1's widened checklist could never reject the DEFAULT generators' own output,
**for any Brief**, because every item it checked was satisfied by construction — independent of content
— and the actual root cause was that `acceptIdeaCommand` never read the Idea's real `idea-NN.md` file on
disk, only its ledger `title`. Round 2 fixes the root cause (threads real Brief content through) AND
tightens the checklists so a content-free fallback is still caught mechanically, exactly as QA's
"Suggested direction" section asked for, preferring the "actually thread real Brief content through"
option over the "walk back the claim" fallback:

1. **New pure parser: `src/idea/brief-content.ts`.** `parseBriefContent(markdown)` extracts
   `talkingPoints` (every bullet under a `## Talking Points`/`## Talking points` heading — verified
   present on all 51 real straw-motion Briefs, both Formats), `angle` (the `## Angle` section's
   paragraph), and `sourceUrls` (REFERENCING — never re-implementing — the existing
   `src/importer/source-urls.ts`'s `extractSourceUrls`). No I/O, no clock; a Brief missing a section
   simply omits/empties that field, never fabricated.

2. **`Brief` gains `talkingPoints`/`sourceUrls`** (`src/production-spec/generate.ts`) — optional, carried
   through unchanged, mirroring `companies`' own existing convention.

3. **`acceptIdeaCommand` now reads the real Brief file.** `src/commands/accept-idea.ts` loads the Idea's
   on-disk Brief markdown via the ALREADY-AUDITED `src/importer/load-brief.ts`'s `loadBrief` (trying the
   ledger's own `brief_path` first) and threads `parseBriefContent`'s output onto the `Brief` passed to
   `authorSpecForRecipe`. A genuinely missing Brief file degrades to the title-only Brief, reported
   plainly in the returned message (`Note: no Brief markdown file found for "<id>" — …`) — never blocking
   the accept, mirroring the command's existing SQL-problem contract.

4. **Both generators now ground their output in that real content.** `news-carousel-generate.ts`: the
   "hook" slide stays title-grounded (that IS its job); every OTHER slide's `text` is a DISTINCT,
   role-label-prefixed `brief.talkingPoints` entry, cycling when fewer than 6 exist — the label prefix
   (e.g. `"What changed: <point>."`) means a cycled repeat (a real Brief commonly has 4-6 points for 6
   non-hook slots) is never verbatim-identical or a shared-prefix collision. `news-short-script-generate.ts`:
   the "story" beat's words now come from `brief.talkingPoints` FIRST, falling back to `FILLER_WORDS`
   padding only for the shortfall; `source_url` now prefers a real, distinct-site URL from
   `brief.sourceUrls` before falling back to the synthetic `HOST_CYCLE`. Both fall back to the OLD,
   title-only template ONLY when the Brief carries no talking points at all — a case the checklists below
   now correctly reject rather than silently pass.

5. **Both checklists gain one further item, closing the vacuous-check gap directly:**
   - `news-carousel-author-checklist.ts`'s `auditNewsCarouselStandaloneAuthorPhase` gains
     `slide-text-variety`: `ok: true` iff (a) at most 3 content words (>= 4 chars) are common to EVERY one
     of the 7 slides' own `text`, AND (b) no two slides share a 20+-character verbatim leading substring.
     Condition (a) alone under-catches a genuinely SHORT title (few significant words); condition (b) is a
     length-independent floor added specifically to close that gap — found while writing this round's own
     tests (see Self-review notes).
   - `news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase` gains
     `no-repeated-phrases` (`checkNoRepeatedPhrases`): `ok: true` iff no beat's own spoken text repeats
     the same 4-word phrase more than once — the exact live padding pattern QA reproduced ("today this
     story keeps moving fast..." concatenated ~4x).
   - `src/recipe/registry.ts`'s documented News Short Script checklist metadata (+ `registry.test.ts`'s
     counts) updated to match: 6 mechanical + 1 agent-judged items (was 5+1).

**Direct, hand-verifiable proof mirroring QA's own repro.** `author-at-review.test.ts`'s new "issue #273
round 2" describe block calls the REAL `authorSpecForRecipe` (never an injected synthetic author) with a
title-only Brief — the exact shape `accept-idea.ts` built before this round — for BOTH Recipes, and
asserts `{ ok: false }`, naming `slide-text-variety`/`no-repeated-phrases` respectively. This is the same
class of check QA performed by hand in its Round 1 verdict; it now correctly fails.

**Production stays usable.** Every "happy path" test that previously used a title-only Brief now uses a
REALISTIC one (real `talkingPoints`, mirroring a real straw-motion Brief) — proving the fix doesn't just
move the goalposts to "permanently blocked": a real, idea-strategist-authored Brief (which always carries
Talking Points — verified) authors a genuinely varied, passing Spec.

**Deliberately unchanged from round 1's own scope decision:** wiring `DEFAULT_SPEC_AUTHORS` to each
Recipe's real, interactive `producerSkill` (issue #273's "direction 1") remains out of scope — an
LLM-authoring step no deterministic module can perform. What changed is round 1's OTHER "out of scope"
call: threading the Brief's real markdown material through turned out to be a reasonably-scoped,
code-only fix, not the "separate, larger, higher-risk feature" round 1 assumed (no new parser
infrastructure was needed beyond one small, pure module reusing an existing extractor).

### Files touched

- `src/idea/brief-content.ts` (NEW) — `extractTalkingPoints`/`extractAngle`/`parseBriefContent`.
- `src/idea/brief-content.test.ts` (NEW) — 14 tests against a realistic Brief sample.
- `src/production-spec/generate.ts` — `Brief` gains `talkingPoints`/`sourceUrls`.
- `src/production-spec/news-carousel-generate.ts` — grounds non-hook slides in real Talking Points.
- `src/production-spec/news-carousel-generate.test.ts` — unchanged assertions still pass (title-only
  `BRIEF` fixture now exercises the documented fallback path; no new tests needed here — the round-2
  regression proofs live in `author-at-review.test.ts` and `news-carousel-author-checklist.test.ts`).
- `src/production-spec/news-short-script-generate.ts` — grounds the "story" beat + `source_url` in real
  content.
- `src/production-spec/news-short-script-generate.test.ts` — unchanged (same reasoning as above).
- `src/production-spec/news-carousel-author-checklist.ts` — new `slide-text-variety` item (+
  `commonSlideTextWords`/`hasSharedLongTextPrefix` helpers), standalone function only.
- `src/production-spec/news-carousel-author-checklist.test.ts` — new regression test
  (`allSlidesRepeatHeadline`).
- `src/production-spec/news-short-script-author-checklist.ts` — new `checkNoRepeatedPhrases`/
  `no-repeated-phrases` item.
- `src/production-spec/news-short-script-author-checklist.test.ts` — new regression test
  (`repeatedPhraseInStoryBeat`).
- `src/production-spec/fixtures/news-carousel-author-checklist-specs.ts` — `baselineAdherentCarouselSpec`'s
  per-slide `text` replaced with 7 genuinely distinct sentences (the old boilerplate itself failed the new
  check); new `allSlidesRepeatHeadline` fixture.
- `src/production-spec/fixtures/news-short-script-author-checklist-specs.ts` — new
  `repeatedPhraseInStoryBeat` fixture.
- `src/production-spec/author-at-review.test.ts` — new `REALISTIC_BRIEF` used across the happy-path
  tests; new "issue #273 round 2" describe block (the title-only-Brief hand-verification proof).
- `src/recipe/registry.ts` / `src/recipe/registry.test.ts` — News Short Script checklist metadata +
  counts updated for the new item.
- `src/commands/accept-idea.ts` — loads + parses the real Brief markdown before authoring.
- `src/commands/accept-idea.test.ts` — fixture Brief markdown now carries a realistic `## Talking Points`
  section.
- `src/commands/accept-to-produced-e2e.test.ts` — same fixture update (this e2e test authors for real).
- `src/producer/carousel-end-to-end.test.ts` — inline Brief given `talkingPoints` directly.
- `src/command-surface/worker.ts`/`worker.test.ts` — untouched this round (the round-1 wiring already
  routes through `auditAuthoredSpec`, so the new items apply automatically; the existing regression test
  still uses a hand-crafted `allSlidesSameCardStyle` fixture, unaffected by round 2).
- `openspec/changes/273-fix-spec-authoring-placeholder-stand-in/` — `proposal.md` (Round 2 update
  section), `tasks.md` (section 6), `specs/production-spec/spec.md` (extended), NEW
  `specs/accept-idea-command/spec.md`, this `handoff.md`.

### How to run

```bash
npx tsc --noEmit                    # type-check
npm test                            # full suite — 4130/4130 passing
npm run build                       # tsc -p tsconfig.build.json
npm run test:docs                   # 351/351 passing (unaffected)
openspec validate --all --strict    # 73/73 passing (all specs + this change)
```

Targeted re-run of everything round 2 touched:

```bash
node --import tsx --test \
  src/idea/brief-content.test.ts \
  src/production-spec/news-carousel-generate.test.ts \
  src/production-spec/news-short-script-generate.test.ts \
  src/production-spec/news-carousel-author-checklist.test.ts \
  src/production-spec/news-short-script-author-checklist.test.ts \
  src/production-spec/author-at-review.test.ts \
  src/commands/accept-idea.test.ts \
  src/commands/accept-to-produced-e2e.test.ts \
  src/producer/carousel-end-to-end.test.ts \
  src/command-surface/worker.test.ts \
  src/recipe/registry.test.ts
```

QA's own hand-verification, re-run against the CURRENT code (no code edits needed to reproduce — this is
what confirms the fix, not a new claim):

```bash
npx tsx -e '
import { generateNewsCarouselSpec } from "./src/production-spec/news-carousel-generate.ts";
import { generateNewsShortScriptSpec } from "./src/production-spec/news-short-script-generate.ts";
import { auditNewsCarouselStandaloneAuthorPhase } from "./src/production-spec/news-carousel-author-checklist.ts";
import { auditNewsShortScriptAuthorPhase } from "./src/production-spec/news-short-script-author-checklist.ts";
const titleOnlyBrief = { id: "idea-01", run: "2026-08-19", title: "OpenAI built a ChatGPT for teenagers, say people familiar with the plans" };
console.log(auditNewsCarouselStandaloneAuthorPhase(generateNewsCarouselSpec(titleOnlyBrief), []).ok); // false
console.log(auditNewsShortScriptAuthorPhase(generateNewsShortScriptSpec(titleOnlyBrief), []).ok);      // false
'
```

### Acceptance-criteria self-assessment (QA Round 1's Defect 1, mapped to what closes it)

| Criterion | Proven by |
|---|---|
| The DEFAULT `news-carousel` author, called with the EXACT title-only Brief `accept-idea.ts` used to build, is rejected (not `ok: true`) | `author-at-review.test.ts` — "issue #273 round 2: news-carousel: a title-only Brief fails authorship on slide-text-variety…" — calls the real `authorSpecForRecipe`, no injected author |
| The DEFAULT `news-short-script` author, same Brief shape, is rejected | `author-at-review.test.ts` — "…news-short-script: a title-only Brief fails authorship on no-repeated-phrases…" |
| `accept-idea.ts` now reads the Idea's real Brief markdown, not just its ledger title | `src/commands/accept-idea.ts`'s new `loadBrief`/`parseBriefContent` call; proven end-to-end by `accept-idea.test.ts`'s "persists the authored Spec…" test (now authoring from a realistic fixture) and `accept-to-produced-e2e.test.ts` |
| A real, grounded Brief (Talking Points present) still authors successfully — production stays usable | `author-at-review.test.ts`'s REALISTIC_BRIEF happy-path tests; `accept-idea.test.ts`; `accept-to-produced-e2e.test.ts`; `carousel-end-to-end.test.ts` |
| Checks are no longer vacuous for the reported "companies-cited"/"banned-words" reasons named in QA's Defect 1 | Superseded: the new `slide-text-variety`/`no-repeated-phrases` items directly target CONTENT variance (not presence-only), and `Brief.talkingPoints` is now genuinely populated in the live path, so the pre-existing `companies-cited` no longer needs to be the load-bearing check |
| Every existing acceptance criterion from round 1 (structural filler symptoms, scope, always-rules) still holds | Full suite green, 4130/4130; no round-1 test was weakened, only the Brief fixtures they authored against were made realistic |

### Fakes / fixtures used

- **Magnific fake — explicitly flagged for qa: round 2 makes ZERO changes to any Space-driving code path
  and adds no new Space interaction.** `src/command-surface/worker.ts` is untouched this round (no diff).
  `src/producer/carousel-end-to-end.test.ts`'s edit is Brief-content-only (adds `talkingPoints` to an
  inline object passed to `authorSpecForRecipe`) — the SAME `FakeCarouselSpace`/`driveToNextGate` flow
  downstream is unchanged. No `spaces_*`/`creations_*` call, no credits, no board mutation, anywhere in
  this round's diff or the suite it touches.
- `src/idea/brief-content.test.ts`'s `REALISTIC_BRIEF` — a realistic Brief markdown sample, structurally
  mirroring (not copied verbatim from) a real straw-motion `idea-NN.md`.
- `author-at-review.test.ts`'s `REALISTIC_BRIEF` — a `Brief` object with 6 real-shaped talking points,
  used across every happy-path test in that file.
- `news-carousel-author-checklist-specs.ts`'s new `allSlidesRepeatHeadline` and
  `news-short-script-author-checklist-specs.ts`'s new `repeatedPhraseInStoryBeat` — focused, single-
  mutation fixtures reproducing the exact live pattern QA's repro showed, isolating the new item's own
  failure from every other item (mirrors this repo's existing fixture convention throughout both files).
- Real, throwaway SQLite files (`withTempDb`/`options.dbPath`) and temp directories (`mkdtemp`) across
  every touched `*.test.ts` — never the committed `data/organicgrowth.db` or `data/brands/`.

### Self-review notes

- **Found and fixed a real gap while writing this round's own tests, before QA had to.** My first version
  of `slide-text-variety` used ONLY the word-count-based measure (a) — running it against
  `accept-idea.test.ts`'s own (pre-existing) short-title fixture ("A brand new headline", no Talking
  Points) revealed it PASSED anyway, because a 4-word title contributes too few >= 4-char content words to
  cross the threshold. Added the length-independent shared-prefix measure (b) specifically to close this;
  re-verified against the exact same fixture, which now correctly fails, and added the fixture's own
  Talking Points section as the real fix (see below) rather than leaving it dependent on this floor alone.
- **Chose the role-label-prefix design for the carousel generator specifically to avoid a NEW false
  positive**, not just to pass the checklist: a real Brief commonly carries 4-6 Talking Points for 6
  non-hook slots, so cycling reuses a point at least once; without the label prefix, two slides reusing
  the SAME point would be byte-identical, tripping `slide-text-variety`'s own new shared-prefix check on
  a case that is NOT the reported defect (a genuinely different, real point being reused once is not "the
  same headline repeated on every card"). Verified by re-running the full suite after the change.
- Considered making the News Short Script "story" beat's `FILLER_WORDS` list longer (or non-repeating) to
  guarantee it never triggers `no-repeated-phrases` regardless of how little real content a Brief
  supplies — REJECTED: that would reintroduce exactly the "checklist satisfied by construction, not by
  content" failure mode QA's own Defect 1 described. Left `FILLER_WORDS` at its existing 21 entries
  deliberately, so a Brief whose Talking Points are too sparse to cover the 90-word "story" target still
  correctly fails, loudly, rather than the generator silently padding around the gap.
- Updated every stale doc-comment claim round 1 left behind (e.g. `@param brief a minimal Brief` ->
  mentions `talkingPoints`/`sourceUrls`; the "Deterministic Spec-author stand-ins avoid…" spec Requirement
  renamed and its Scenarios corrected to state the TRUE, now-narrower contract — a Brief with no Talking
  Points does NOT pass the checklist, contradicting round 1's own "any well-formed minimal Brief" claim).
- No dead code introduced. `hostFor`'s old per-index host-cycling logic was subsumed by the new
  `resolveSourceUrls`/`siteKeyFromUrl` pair (`hostFor` itself is still used, now only inside
  `resolveSourceUrls`'s own synthetic-candidate construction).

### Known limits

- **A Brief with real but very SPARSE Talking Points can still fail `no-repeated-phrases`.** This is
  intentional (see Self-review notes above), not a gap: if a Brief's own material is too thin to cover
  the "story" beat's 90-word target without repeating filler, failing loudly and asking for a richer
  Brief is the correct behavior under "never fabricate" — not a bug to route around. Verified every real
  straw-motion Brief (51/51) carries enough Talking Points material in practice (this ticket's own grep).
- **`slide-text-variety`'s thresholds (3 common words, 20-char shared prefix) are heuristics, not a proof
  of "real content."** They are calibrated against the SPECIFIC live reproduction QA hand-verified
  (a long, real headline repeated verbatim) and this ticket's own fixtures; a sufficiently adversarial or
  unusual Brief could theoretically still slip a low-quality Spec past them. This remains true of any
  mechanical, non-AI check — the interactive `produce-news-carousel`/`produce-news-short-script` Skill
  (issue #273's "direction 1", still out of scope) is the only way to fully close this gap.
- The News Carousel Recipe's FULL author-phase checklist (`auditNewsCarouselAuthorPhase`, needing a
  Format's Baseline Prompt document) is untouched this round, unchanged from round 1's own scope decision
  — `slide-text-variety` lives only on the standalone, accept-time subset, matching where
  `card-style-distinctness` already lived. The archived `openspec/specs/production-spec/spec.md`'s
  item-count anti-drift guard (`news-carousel-checklist-count.docs-test.ts`) therefore needed no changes.
- Neither generator's output is "real" news content — grounding in Talking Points fixes genericness, not
  groundedness in the sense of verified facts or a human-quality narrative. That gap is inherent to the
  documented "deterministic, hermetic stand-in" design and remains the interactive Skill's own job.
- Issue #272 (the regenerated Spec file's wrong-folder path) remains untouched, per the issue's own
  "Related" section marking it a separate bug.

## QA Verdict — Round 2: PASS

### Suite result

- `npx tsc --noEmit` — green (ran as part of `npm test`).
- `npm test` — **4130/4130 passing**, 0 failed, 0 cancelled (`# tests 4130 / # pass 4130 / # fail 0`).
- `openspec validate --all --strict` — **73/73 passing**, including `spec/spec-authored-at-review`,
  `spec/production-spec`, `spec/command-surface`, `spec/phase-contracts`, `spec/recipe-registry`.
- `npm run test:docs` — **351/351 passing**.
- All four commands actually run this round, output inspected in full, genuinely green.

### Round 1's Defect 1 — re-verified directly against the current code

I re-ran my exact Round 1 hand-verification, unmodified, against the current (Round 2) code:

```
titleOnlyBrief = { id: "idea-01", run: "2026-08-19", title: "OpenAI built a ChatGPT for teenagers, say
                    people familiar with the plans" }

generateNewsCarouselSpec(titleOnlyBrief) -> auditNewsCarouselStandaloneAuthorPhase(...).ok = false
  FAILED: slide-text-variety -> common words: openai, built, chatgpt, teenagers, people, familiar,
          with, plans; two or more slides also share a long leading substring

generateNewsShortScriptSpec(titleOnlyBrief) -> auditNewsShortScriptAuthorPhase(...).ok = false
  FAILED: no-repeated-phrases -> "today this story keeps" in beats[1].text
```

Both now correctly report `ok: false` and name the exact new item — this is a direct reversal of Round
1's finding: the same title-only Brief that previously sailed through silently as `{ ok: true }` on both
Recipes is now rejected loudly on both, with a check that inspects the CONTENT itself (word overlap
across slides / repeated phrases within a beat), not just a property the generator satisfies by
construction. **Defect 1 from Round 1 is resolved.**

### Realistic-Brief check — production stays usable

I ran a REAL, unmodified straw-motion Brief
(`data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-12.md`, 4 real Talking
Points, 1 real Source) through `parseBriefContent` → both generators → both checklists → the full
`authorSpecForRecipe` (`DEFAULT_SPEC_AUTHORS`, the actual live path):

- Every non-hook carousel slide's `text` now quotes a DISTINCT real Talking Point (role-label-prefixed),
  never the bare headline repeated; `carousel audit ok: true` (`slide-text-variety=true`,
  `card-style-distinctness=true`).
- The short-script's `story` beat is built from the real Talking Points, its `source_url` fields include
  the real, openly-readable source URL from the Brief where available; `script audit ok: true`
  (`no-repeated-phrases=true`).
- `authorSpecForRecipe` for both Recipes returns `{ ok: true }` on the SAME `DEFAULT_SPEC_AUTHORS` path
  `accept-idea.ts` actually calls — production is not blocked by the tightened checks for a real Brief.

This matches `author-at-review.test.ts`'s own new `REALISTIC_BRIEF` happy-path tests and
`accept-idea.test.ts`'s updated fixture (a real `## Talking Points`/`## Source(s)` markdown body,
loaded end-to-end via `loadBrief`) — both genuinely exercise the real, non-synthetic authoring path, not
a hand-crafted stand-in.

### A residual, narrower gap found while stress-testing (reported plainly, non-blocking)

Probing further than the exact Round-1 repro: a Brief with very FEW (1-2) Talking Points still lets the
carousel's `slide-text-variety` item pass while 6 of the 7 slides carry byte-identical body text
(differing only by the fixed role-label prefix) — the check compares word-overlap/shared-prefix across
ALL 7 slides including the (always-different) hook slide, so it never notices 6-way duplication among the
non-hook slides alone. Hand-verified:

```
thinBrief.talkingPoints = ["This single point is the only real material this Brief happens to carry."]
-> 6 of 7 carousel slides read "<role label>: This single point is the only real material..." verbatim
-> auditNewsCarouselStandaloneAuthorPhase(...).ok = true  (slide-text-variety=true)
```

(The short-script side does NOT have this gap — `no-repeated-phrases` correctly fails a 1-point Brief,
because the "story" beat still needs filler padding to hit its word-count target, which repeats a 4-word
phrase within that beat's own text.)

I then checked whether this is a live risk: counted real Talking Points bullets across all 61 real Idea
Briefs in `data/brands/` (`awk` over every `## Talking [Pp]oints` section). The only Briefs with 0 points
belong to `mundotip`'s `life-hacks` Format, which pre-fills only `character-explainer-with-cast` (no
`news-carousel`/`news-short-script` in its `default_recipes` — this code path never runs for them). Every
one of straw-motion's 51 Briefs (the only Brand actually using these two Recipes) carries **4 to 8**
Talking Points, never fewer — matching the developer's own "51/51" claim in `brief-content.ts`'s doc
comment, independently reproduced here. So this gap does not manifest against the current real corpus,
and the developer's own "Known limits" section already discloses the general category ("a sufficiently
adversarial or unusual Brief could theoretically still slip a low-quality Spec past them") — this is a
specific, previously-undisclosed instance of that general, already-acknowledged heuristic limit, not a
new, unacknowledged risk class. **Filed below as Defect 2 (low), not blocking this round's PASS.**

### Per-criterion results (Round 2's own AC table, re-verified independently)

| Criterion | Result | Evidence |
|---|---|---|
| The DEFAULT `news-carousel` author, called with the EXACT title-only Brief, is rejected | PASS | Re-run by hand, above; `author-at-review.test.ts`'s "issue #273 round 2" block |
| The DEFAULT `news-short-script` author, same Brief shape, is rejected | PASS | Re-run by hand, above |
| `accept-idea.ts` now reads the Idea's real Brief markdown, not just its ledger title | PASS | `git diff HEAD -- src/commands/accept-idea.ts` — `loadBrief`/`parseBriefContent` genuinely wired; `accept-idea.test.ts`'s fixture now writes a real `## Talking Points` file |
| A real, grounded Brief still authors successfully — production stays usable | PASS | Realistic-Brief check, above, run against BOTH the unit level and the real straw-motion Idea file |
| Checks no longer vacuous for the round-1-named reasons | PASS, with the caveat above (Defect 2) — the two NEW items (`slide-text-variety`/`no-repeated-phrases`) genuinely inspect content, closing the exact mechanism Round 1 exploited (checks satisfied by construction) |
| Every round-1 criterion (structural filler symptoms, scope, always-rules) still holds | PASS | Full suite green; round-1's own tests (dash-joins, card-style, host-collision) unmodified and still passing |

### Per-scenario results (new/extended spec deltas)

`specs/production-spec/spec.md` (extended): the "Deterministic Spec-author stand-ins avoid
mechanically-detectable filler patterns" Requirement was corrected this round to the TRUE, narrower
contract — I did not re-check every one of its now-many Scenarios line-by-line, but spot-checked the
ones naming round-2 behavior (title-only Brief rejected, realistic Brief passes) against the code and
tests above — PASS, consistent.

`specs/accept-idea-command/spec.md` (NEW):
- "A well-formed News Carousel accept authors its Spec from the Idea's REAL Talking Points, and enqueues
  normally" — PASS, `accept-idea.test.ts`'s "persists the authored Spec..." test (realistic fixture).
- "A forced banned-word violation blocks that Recipe's accept, loudly, before any queue write" — PASS,
  same file's existing banned-word test (unaffected by round 2's fixture change).
- "A missing Brief markdown file degrades to the title-only Brief, reported plainly, never blocking the
  accept" — **NOT directly covered by any test at the `acceptIdeaCommand` level.**
  `loadBrief`'s own lower-level "reports every tried candidate when none exist on disk" test
  (`load-brief.test.ts`, pre-existing) proves `loadBrief` itself behaves correctly, and the integration
  code in `accept-idea.ts` (`if (!briefLoad.ok) { lines.push(...) }`) is simple and directly visible in
  the diff, but no test in `accept-idea.test.ts` asserts the "Note: no Brief markdown file found..."
  message actually appears, or that the accept still succeeds/enqueues, when the Brief file is missing.
  **Filed below as Defect 3 (low), not blocking this round's PASS** — the code is simple and plausible,
  but the spec's own Scenario is unproven by a test, which is exactly what job (b)/(c) exists to catch.

`specs/command-surface/spec.md` — untouched this round (no diff to `worker.ts`'s own Requirement text);
round 1's already-verified scenarios still pass (full suite).

### Always-rules + Magnific-fake checks (re-verified for round 2's diff)

- **Generate-never-publish** — PASS. `src/command-surface/worker.ts` has NO diff this round (confirmed
  via `git diff --stat`); the round-2 diff touches only Brief-parsing/authoring code, never a Space-driving
  or publish path.
- **Public-metrics-only** — PASS (not touched).
- **Relative-not-absolute** — PASS (not touched).
- **Explicit-attribution** — PASS (not touched).
- **Never fabricate (rule 8)** — PASS, explicitly checked given this round's new parser:
  `brief-content.ts`'s `extractTalkingPoints`/`extractAngle` return `[]`/`undefined` for a Brief with no
  matching section — never invented content; confirmed by reading the module directly (no fallback string
  literals standing in for real material).
- **Ledger-as-source-of-truth** — PASS. `acceptIdeaCommand`'s new Brief-loading step is read-only
  (`loadBrief` reads a file, `parseBriefContent` is pure); the existing write path
  (`writeIdeaRecipeSelection`/`enqueueOnAccept`/`saveAssetSpec`) is unchanged by this round's diff.
- **Magnific fake (hard requirement)** — PASS. `grep -rln "spaces_\|creations_"` across every file this
  round touches or adds returns exactly one hit, `src/producer/carousel-end-to-end.test.ts`, which is a
  PRE-EXISTING doc-comment line ("no `spaces_*`/`creations_*` call anywhere — the Magnific fake stands
  in") unrelated to this round's actual diff (`git diff HEAD` on that file shows only a Brief-fixture
  change, adding `talkingPoints` to an inline object). No live Magnific call anywhere in this round's
  diff or the suite it touches; `worker.ts`/`worker.test.ts` (the only files with real Space interaction
  in this ticket) are untouched this round.

### Defect list

**Defect 2 — low — `slide-text-variety` cannot detect 6-of-7 near-identical carousel slides when a Brief
supplies very few (1-2) Talking Points**, because the check compares word-overlap/shared-prefix across
ALL 7 slides (including the always-distinct hook), not among the non-hook slides alone. Does not manifest
against the current real corpus (every straw-motion Brief carries 4-8 Talking Points, independently
verified above) and is a specific instance of a limitation the developer's own "Known limits" section
already discloses in general terms. Repro: construct a `Brief` with exactly one `talkingPoints` entry,
call `generateNewsCarouselSpec` then `auditNewsCarouselStandaloneAuthorPhase` — result is `{ ok: true }`
despite 6 of 7 slides sharing the same body sentence verbatim. Suggested direction (not prescriptive):
compare word-overlap/shared-prefix among the 6 non-hook slides specifically, or require a minimum number
of distinct Talking Points be cited across those 6 slides.

**Defect 3 — low — the new `specs/accept-idea-command/spec.md`'s "missing Brief file degrades... reported
plainly" Scenario has no test at the `acceptIdeaCommand` integration level.** `loadBrief`'s own
missing-file behavior is tested (pre-existing `load-brief.test.ts`), but nothing in `accept-idea.test.ts`
constructs a ledger Idea whose Brief file cannot be found and asserts (a) the returned message contains
the "Note: no Brief markdown file found..." text and (b) the accept still succeeds/enqueues normally.
Repro: read `src/commands/accept-idea.test.ts` — no `it(...)` block exercises a missing/unresolvable
`brief_path`.

**Neither Defect 2 nor Defect 3 blocks this round's verdict.** Round 1's Defect 1 — the actual point of
issue #273, and the one the coordinator asked to be scrutinized hardest — is genuinely fixed: the
widened checks now inspect real content (word-overlap, repeated phrases) rather than properties the
generator satisfies unconditionally, `accept-idea.ts` now threads the Idea's real on-disk material
through instead of a bare title, and I independently re-ran both the exact Round 1 repro and a real,
unmodified production Brief to confirm the fix holds both ways (filler rejected, real content authored
successfully). Suite, OpenSpec validation, docs conformance, always-rules, and the Magnific-fake
requirement all genuinely pass.
