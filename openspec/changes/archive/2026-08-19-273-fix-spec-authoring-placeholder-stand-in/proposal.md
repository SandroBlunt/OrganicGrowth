# Widen the accept-time self-check so a filler Production Spec is rejected loudly, not silently persisted

## Why

Issue #273 (filed live by the `producer` agent, 2026-08-19): every Production Spec authored via
`npm run accept-idea` for the `news-carousel` and `news-short-script` Recipes came out as obvious filler.
`src/production-spec/author-at-review.ts`'s own doc comment already names the root cause: its
`DEFAULT_SPEC_AUTHORS` map is a **deterministic, hermetic STAND-IN** for each Recipe's real,
interactive `producerSkill` — but that stand-in was never swapped out before ADR-0031 moved Spec
authorship to Review (accept time), and nothing caught how thin its output actually was:

- `news-carousel-generate.ts`'s `generateNewsCarouselSpec` hardcoded `card_style: "full_width"` on
  every one of the 7 slides, and joined each slide's on-card `text` with a spaced em dash (the exact
  AI-writing "tell" issue #108 already forbids everywhere else).
- `news-short-script-generate.ts`'s `generateNewsShortScriptSpec` put every beat's `source_url` on the
  SAME host (`example.com`), and its filler-padded beat text was read as "one sentence padded four
  times to hit the word count."
- `src/recipe/phase-contract.ts`'s `auditAuthorPhase` — the ONLY check `authorSpecForRecipe` ran before
  this ticket — is deliberately generic across every wired Recipe (shape + banned words only). It never
  ran either Recipe's OWN, richer author-phase checklist
  (`news-carousel-author-checklist.ts`'s `auditNewsCarouselAuthorPhase`,
  `news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase`), so a shape-valid,
  banned-word-clean filler Spec sailed through undetected and was persisted to both the SQL Asset row
  and the on-disk Spec file, ready for the Producer/worker to drive a real Space against.

The News Carousel Recipe's FULL checklist needs `NewsCarouselBaselineParams` — strings read from a
Format's own Baseline Prompt document (ADR-0015) — which is not resolved at accept time; reading and
parsing that document programmatically is separate, not-yet-built work (this module's own doc comment:
"HOW those params get read out of the actual Baseline Prompt document end-to-end is downstream work",
issues #87/#88's own precedent). Fabricating a stand-in `NewsCarouselBaselineParams` at accept time
would be exactly the anti-pattern issue #85 already corrected once (a Format-specific literal hardcoded
into a generic module) — this change deliberately does not do that.

## What changes

This change fixes both the STRUCTURAL defects the issue reproduced live, and widens the accept-time
self-check so the SAME class of defect is rejected loudly, mechanically, going forward — issue #273's
own "at minimum" suggested fix, applied as far as it can go without fabricating a Format-specific
literal:

- **`news-carousel-generate.ts`**: `card_style` now cycles through a small, distinct set instead of one
  hardcoded value; on-card `text` no longer joins clauses with a dash; when the Brief names real
  companies, every slide's `image_prompt` now cites them.
- **`news-short-script-generate.ts`**: each beat's `source_url` now cycles through 3 distinct,
  IANA-reserved documentation hosts (`example.com`/`.org`/`.net`) instead of colliding on one host.
  Both stand-ins remain deterministic, hermetic TEMPLATES — never a claim of real, grounded content;
  the fix is structural (no longer mechanically degenerate), not a claim of realism.
- **`news-carousel-author-checklist.ts`**: a NEW, exported `auditNewsCarouselStandaloneAuthorPhase`
  function — the Baseline-Prompt-INDEPENDENT subset of the existing, richer
  `auditNewsCarouselAuthorPhase` checklist (spec-shape, banned-words, no-dash-tells, companies-cited,
  reusing the SAME referenced scanners), PLUS one genuinely new, universally-computable item,
  `card-style-distinctness` — at least 2 distinct `card_style` values across the 7 slides, the weakest
  possible floor beneath the Format-tuned `placement-variety` item, directly targeting the reproduced
  "one card style for all seven slides" defect.
- **`author-at-review.ts`**: a new exported `auditAuthoredSpec(recipe, candidateSpec, bannedWords)` —
  runs a Recipe's own registered refinement (`news-carousel` -> the new standalone subset;
  `news-short-script` -> its existing, already-standalone-runnable FULL checklist) when one is
  registered, else falls back to the generic, cross-Recipe `auditAuthorPhase`, unchanged
  (`character-explainer-with-cast` keeps the plain generic check — this ticket reported no filler defect
  for it). `authorSpecForRecipe` now calls `auditAuthoredSpec` instead of `auditAuthorPhase` directly.
- **`command-surface/worker.ts`**: `runOneJob`'s own (defense-in-depth) author-phase check now also
  calls `auditAuthoredSpec` instead of `auditAuthorPhase` directly, so the attended-accept path and the
  unattended worker's own safety net stay the SAME bar, never two independently-drifting ones.

## Impact

- Affected capabilities: `production-spec` (the generators, the new standalone checklist subset, and
  `authorSpecForRecipe`/`auditAuthoredSpec`), `command-surface` (`runOneJob`'s author-phase check).
- No change to the Copy step, the gate/pick-gate mechanics, the ledger's Asset lifecycle, or any
  always-rule. Generate-never-publish, public-metrics-only, and ledger-as-source-of-truth all hold
  unchanged.
- Every existing `accept-idea.test.ts`/`author-at-review.test.ts`/`worker.test.ts` assertion that
  exercised the DEFAULT deterministic authors for `news-carousel`/`news-short-script` stays green,
  unmodified — proving this is a genuine fix (the improved stand-ins pass their own widened bar), not a
  regression that merely blocks the pipeline until the real Skill exists.
- Out of scope (explicitly, per the issue's own framing): wiring `DEFAULT_SPEC_AUTHORS` to each
  Recipe's real, interactive `producerSkill` (issue #273's direction 1) — that is an LLM-authoring step,
  not something a deterministic, hermetic module can perform, and remains the interactive
  `produce-news-carousel`/`produce-news-short-script` Skill's own job, later, once a Format's Baseline
  Prompt document is in hand. Also out of scope: parsing a Format's Baseline Prompt document into a
  `NewsCarouselBaselineParams` value programmatically (separate, not-yet-built work, issues #87/#88's
  own precedent). Issue #272 (the regenerated Spec file's wrong-folder path) is explicitly a SEPARATE bug
  per the issue's own "Related" section — not touched here.

## Round 2 update (QA round 1's finding — the above was insufficient on its own)

QA round 1 hand-verified that the checklist widened above can never reject the DEFAULT generators' own
output, **for any Brief**, because every item it checks is satisfied by construction of the generator —
independent of content: `card-style-distinctness` is guaranteed by a fixed cycle; `no-dash-tells` by
switching separators to periods; `companies-cited` is vacuously true because `accept-idea.ts` never
populated `brief.companies` in the first place; `banned-words` is a no-op for a Brand configuring none.
The root cause QA named: `acceptIdeaCommand` built its `Brief` from only the ledger Idea's `id`/`run`/
`title` — **never the real `idea-NN.md` file on disk**, where an Idea's actual story material (Talking
Points, Source(s), Angle) lives. No generator, however checklisted, can vary its output on content it was
never given.

This round REVERSES the "out of scope" call above on threading the Brief's real material through — it
turned out to be a reasonably-scoped fix, not the larger, higher-risk feature round 1 assumed:

- **`src/idea/brief-content.ts`** (NEW, pure): parses a Brief markdown's `## Talking Points`/`## Angle`
  sections; reuses `src/importer/source-urls.ts`'s existing `extractSourceUrls` for `## Source(s)`.
- **`accept-idea.ts`**: `acceptIdeaCommand` now loads the Idea's REAL on-disk Brief markdown (`loadBrief`)
  and parses it via the above, threading `angle`/`talkingPoints`/`sourceUrls` onto the `Brief` — degrading
  to the title-only Brief (reported plainly) only when the file genuinely cannot be found.
- **Both generators** now ground their output in `brief.talkingPoints`/`brief.sourceUrls` when present,
  falling back to the OLD, generic template only when the Brief carries none at all.
- **Both checklists** gain one further item each (`slide-text-variety`, `no-repeated-phrases`) that a
  content-free fallback Spec fails, but a Brief-grounded one does not — closing the exact vacuous-check
  gap QA's hand-verification demonstrated, proven by re-running that SAME hand-verification (see
  `handoff.md`'s Round-2 Build block).

Direction 1 (wiring the real, interactive authoring Skill) remains genuinely out of scope, unchanged —
this round's fix is a code-only, deterministic improvement to the hermetic stand-in, not a claim that its
output is real, grounded news content.
