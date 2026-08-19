## MODIFIED Requirements

### Requirement: authorSpecForRecipe authors a candidate Spec and self-checks it against auditAuthorPhase in one call

`src/production-spec/author-at-review.ts`'s `authorSpecForRecipe(recipe, brief, bannedWords, authors?)` SHALL look up `recipe.slug`'s default author (from `DEFAULT_SPEC_AUTHORS`, overridable via the optional
`authors` parameter for tests), author a candidate Spec, then self-check it via
`auditAuthoredSpec(recipe, candidateSpec, bannedWords)`. `auditAuthoredSpec` SHALL run that Recipe's own
registered refinement from `AUTHOR_PHASE_REFINERS` (a Recipe-specific, standalone-runnable author-phase
auditor — one that needs no input beyond the candidate Spec and the Brand's banned words) when one is
registered for `recipe.slug`, else the generic, cross-Recipe `src/recipe/phase-contract.ts`'s
`auditAuthorPhase`. `AUTHOR_PHASE_REFINERS` SHALL register `news-carousel` ->
`auditNewsCarouselStandaloneAuthorPhase` and `news-short-script` ->
`auditNewsShortScriptAuthorPhase`; `character-explainer-with-cast` SHALL have no entry (unchanged
generic-only check). `command-surface/worker.ts`'s `runOneJob` SHALL call the SAME `auditAuthoredSpec`
for its own (defense-in-depth) author-phase check, so the accept-time self-check and the unattended
worker's own safety net are never two independently-drifting bars.
`authorSpecForRecipe` SHALL return `{ ok: true, spec, audit }` when the audit passes, or `{ ok: false,
audit }` (naming every failing checklist item) when it does not. A Recipe slug with no registered
author SHALL still return `{ ok: false }` naming the gap — never throw and never silently skip
authorship.

#### Scenario: A well-formed News Carousel Brief authors successfully, and the widened checklist's items are present

- **GIVEN** the `news-carousel` Recipe, a well-formed Brief, and no banned words
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called
- **THEN** it returns `{ ok: true }` carrying a Spec that ALSO passes `recipe.specShape.validate`
  directly (the same Spec the audit just checked, never a second, re-derived copy), and `audit.items`
  includes a `card-style-distinctness` item with `ok: true`

#### Scenario: A banned word in the Brief's title fails authorship loudly

- **GIVEN** the `news-carousel` Recipe, a Brief whose `title` contains a word later configured as banned
- **WHEN** `authorSpecForRecipe(recipe, brief, ["<that word>"])` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `banned-words` check failed, with a
  detail naming the exact hit

#### Scenario: A News Carousel author producing a filler Spec (one card_style on every slide) is rejected loudly, not silently persisted (issue #273)

- **GIVEN** the `news-carousel` Recipe and an injected author whose candidate Spec is structurally
  well-formed and banned-word-clean, but sets the exact SAME `card_style` on all 7 slides
- **WHEN** `authorSpecForRecipe(recipe, brief, [], { "news-carousel": fillerAuthor })` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `card-style-distinctness` item
  failed

#### Scenario: A News Short Script author whose beats all cite the same source host is rejected loudly (issue #273)

- **GIVEN** the `news-short-script` Recipe and an injected author whose candidate Spec is
  structurally well-formed and banned-word-clean, but whose beats' `source_url` all share one host
- **WHEN** `authorSpecForRecipe(recipe, brief, [], { "news-short-script": collidingAuthor })` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `shot-list-variety` item failed

#### Scenario: A Recipe with no registered refinement keeps the plain generic check, unchanged

- **GIVEN** the `character-explainer-with-cast` Recipe (no entry in `AUTHOR_PHASE_REFINERS`)
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called
- **THEN** the returned `audit.items` are exactly the two generic `auditAuthorPhase` items
  (`spec-shape`, `banned-words`) — no Recipe-specific item is added

#### Scenario: A title-only Brief (round 1's own residual gap) is REJECTED loudly, not silently authored as filler (issue #273 round 2)

- **GIVEN** the `news-carousel` Recipe and a Brief carrying only `id`/`run`/`title` (no `talkingPoints`) —
  the EXACT shape `accept-idea.ts` built before this round, and the shape it still falls back to when no
  Brief markdown can be found
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called (the DEFAULT author, never an injected
  synthetic one)
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `slide-text-variety` item failed —
  the generator has nothing but the bare headline to repeat across its 7 slides

#### Scenario: A title-only Brief fails News Short Script authorship on no-repeated-phrases, for the same reason (issue #273 round 2)

- **GIVEN** the `news-short-script` Recipe and the SAME title-only Brief
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called (the DEFAULT author)
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `no-repeated-phrases` item failed —
  the "story" beat's 90-word target has nothing real to draw from besides repeated filler padding

### Requirement: News Short Script author-phase checklist is graduated: Curiosity Queries, no calendar dates, and Shot List source variety (issue #187)

`src/production-spec/news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase` SHALL
layer a FOURTH new mechanical item, `no-repeated-phrases`, on top of the three issue #187 already added
(`curiosity-queries`, `no-calendar-dates`, `shot-list-variety`): `ok: true` iff no beat's own spoken
`text` repeats the same 4-word phrase more than once, via the new, exported `checkNoRepeatedPhrases`
(reject-only, mirroring `checkShotListVariety`'s own contract — report, never rewrite). This catches
issue #273 round 2's live reproduction: `news-short-script-generate.ts`'s stand-in used to pad a short
Brief title out to the "story" beat's 90-word target with a small, fixed `FILLER_WORDS` list, which — for
any real, few-word title — meant the SAME ~20-word filler phrase got concatenated ~4 times over.

#### Scenario: A beat padding itself out with the SAME phrase repeated fails ONLY no-repeated-phrases

- **GIVEN** an otherwise well-formed, banned-word-clean News Short Script Spec whose "story" beat's own
  `text` concatenates one ~11-word phrase 3 times over (keeping the WHOLE Spec's total word count inside
  120-150, isolating this one failure)
- **WHEN** `auditNewsShortScriptAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `no-repeated-phrases` item's `ok` is `false` (naming the
  repeated phrase and the beat), and `role-order-word-count`/`no-calendar-dates`/`shot-list-variety` all
  stay `ok: true`

## ADDED Requirements

### Requirement: News Carousel author-phase checklist gains a Baseline-Prompt-INDEPENDENT standalone subset, runnable before a Format's Baseline Prompt document is resolved

`src/production-spec/news-carousel-author-checklist.ts` SHALL expose
`auditNewsCarouselStandaloneAuthorPhase(candidateSpec, bannedWords): PhaseAuditResult` — the subset of
`auditNewsCarouselAuthorPhase`'s full checklist that needs NO `NewsCarouselBaselineParams` argument (no
Format-specific literal is read), so it can run BEFORE a Format's Baseline Prompt document has been
resolved (e.g. at Review/accept time). It SHALL include `spec-shape` (referencing
`validateNewsCarouselSpec`), `banned-words` (referencing `scanNewsCarouselForBannedWords`),
`no-dash-tells` (referencing `scanTextFieldsForDashes` over each slide's `stat_callout`/`text`), and
`companies-cited` (referencing the SAME per-slide company-citation check the full checklist uses) — each
REFERENCING the SAME underlying check the full checklist already uses, never re-implementing it — PLUS
two genuinely NEW, universally-computable items: `card-style-distinctness` (issue #273 round 1), `ok:
true` iff the 7 slides' `card_style` values include at least `min(2, slide count)` distinct values; and
`slide-text-variety` (issue #273 round 2, QA round 1's own finding), `ok: true` iff (a) at most 3 content
words (>= 4 chars, case-insensitive) are common to EVERY one of the 7 slides' own `text`, AND (b) no two
slides' `text` share a verbatim leading substring of 20+ characters — a Spec whose slides all repeat the
same headline/sentence (round 1's own fix still let this happen: every slide carried the Brief's bare
`title` verbatim, just re-punctuated) fails one or both of these; grounding each slide in genuinely
different material (a distinct Talking Point per slide) fails neither. The function SHALL never throw for
any input shape, and its overall `ok` SHALL be `false` whenever the referenced structural validator fails
OR any item's `ok` is `false`.

#### Scenario: A baseline-adherent Spec passes every item without a NewsCarouselBaselineParams argument

- **GIVEN** a well-formed, genuinely varied 7-slide News Carousel Spec (distinct `card_style`s, no dash
  tells, every named company cited in its own slide's `image_prompt`)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `true` and every item's `ok` is `true`

#### Scenario: A Spec whose 7 slides all share ONE card_style fails ONLY the new card-style-distinctness item (issue #273's live reproduction)

- **GIVEN** an otherwise well-formed, banned-word-clean, dash-clean 7-slide Spec whose `card_style` is
  the exact same string on every one of the 7 slides
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `card-style-distinctness` item's `ok` is `false`, and every
  OTHER item's `ok` is `true`

#### Scenario: The new floor is weaker than the Format-tuned placement-variety item — 2 distinct styles is enough here even when it is not enough for the full checklist

- **GIVEN** a 7-slide Spec using exactly 2 distinct `card_style` values (below a Format's own
  `minDistinctCardStyles` of 3, so it would fail `auditNewsCarouselAuthorPhase`'s `placement-variety`
  item under that Format's `NewsCarouselBaselineParams`)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the `card-style-distinctness` item's `ok` is `true` and the result's `ok` is `true`

#### Scenario: A Spec whose 7 slides all repeat the SAME headline verbatim fails ONLY the new slide-text-variety item (issue #273 round 2's live reproduction)

- **GIVEN** an otherwise well-formed, banned-word-clean, dash-clean, card-style-varied 7-slide Spec whose
  `text` is the SAME headline sentence on every slide (differing only by a short role-label suffix — the
  EXACT pattern round 1's own fix still produced)
- **WHEN** `auditNewsCarouselStandaloneAuthorPhase(spec, [])` is called
- **THEN** the result's `ok` is `false`, the `slide-text-variety` item's `ok` is `false` (naming the
  shared content words and/or the shared leading substring), and every OTHER item's `ok` stays `true`

### Requirement: Deterministic Spec-author stand-ins ground their output in the Brief's own real story content, not just its bare title

`generateNewsCarouselSpec` (`news-carousel-generate.ts`) SHALL vary `card_style` across its 7 slides
(never one hardcoded value for every slide), SHALL never join a slide's on-card `text` with a spaced em
dash, en dash, or hyphen-as-dash, and SHALL, when `brief.companies` is non-empty, cite every named
company in every slide's own `image_prompt` (issue #273 round 1). **Issue #273 round 2 (QA round 1's own
finding — round 1 alone was insufficient):** the "hook" slide's `text` SHALL be the Brief's own `title`;
every OTHER slide's `text` SHALL be drawn from a DISTINCT entry of `brief.talkingPoints` (the Brief's own
real `## Talking Points` bullets, `src/idea/brief-content.ts`), prefixed with that slide's own role label
so two slides that legitimately reuse the SAME point (a real Brief commonly carries fewer than the 6
non-hook slots need) never end up verbatim-identical or sharing a long leading substring. Only when the
Brief carries NO `talkingPoints` at all SHALL this generator fall back to the OLD, title-grounded
template — a structurally valid Spec `slide-text-variety` (above) correctly rejects, rather than this
generator ever inventing content it was never given.

`generateNewsShortScriptSpec` (`news-short-script-generate.ts`) SHALL vary each beat's `source_url` host
across a small, fixed cycle of distinct hosts (never one colliding host for every beat) as a FALLBACK,
preferring a real, distinct-site URL from `brief.sourceUrls` first when available (issue #273 round 1 +
round 2). **Issue #273 round 2:** the "story" beat's spoken `text` SHALL draw its words from
`brief.talkingPoints` (concatenated in order) FIRST when the Brief has any, falling back to the fixed
`FILLER_WORDS` padding cycle only for whatever real content doesn't cover; "hook"/"cta" stay
title-grounded (their 20-word targets never need more real words than a real headline already supplies).

Both remain deterministic, hermetic templates (no model call, no I/O, no clock) — this Requirement fixes
mechanically-detectable degeneracy AND threads real, per-story Brief content through when it is available
(round 2); it is not a claim that either stand-in's output is real, grounded news content when the Brief
itself carries none.

#### Scenario: generateNewsCarouselSpec's output passes auditNewsCarouselStandaloneAuthorPhase when the Brief carries real Talking Points

- **GIVEN** a well-formed Brief carrying a `title` and 4+ distinct `talkingPoints`, and no banned words
- **WHEN** `generateNewsCarouselSpec(brief)`'s result is passed to
  `auditNewsCarouselStandaloneAuthorPhase(result, [])`
- **THEN** the result's `ok` is `true`

#### Scenario: generateNewsCarouselSpec's output FAILS auditNewsCarouselStandaloneAuthorPhase when the Brief carries no Talking Points at all (issue #273 round 2)

- **GIVEN** a Brief carrying only `id`/`run`/`title` (no `talkingPoints`)
- **WHEN** `generateNewsCarouselSpec(brief)`'s result is passed to
  `auditNewsCarouselStandaloneAuthorPhase(result, [])`
- **THEN** the result's `ok` is `false`, naming `slide-text-variety` — the generator degrades to the
  title-grounded fallback, which the checklist correctly rejects, rather than silently authoring filler

#### Scenario: generateNewsShortScriptSpec's output passes auditNewsShortScriptAuthorPhase when the Brief carries real Talking Points totaling enough real words

- **GIVEN** a well-formed Brief carrying a `title`, `talkingPoints` totaling comfortably more than the
  "story" beat's 90-word target, and no banned words
- **WHEN** `generateNewsShortScriptSpec(brief)`'s result is passed to
  `auditNewsShortScriptAuthorPhase(result, [])`
- **THEN** the result's `ok` is `true`

#### Scenario: generateNewsShortScriptSpec's output FAILS auditNewsShortScriptAuthorPhase when the Brief carries no Talking Points at all (issue #273 round 2)

- **GIVEN** a Brief carrying only `id`/`run`/`title` (no `talkingPoints`)
- **WHEN** `generateNewsShortScriptSpec(brief)`'s result is passed to
  `auditNewsShortScriptAuthorPhase(result, [])`
- **THEN** the result's `ok` is `false`, naming `no-repeated-phrases` — the "story" beat has nothing real
  to draw from besides the fixed filler cycle, repeated

### Requirement: A pure Brief-content parser extracts the real story material a Brief's markdown actually carries

`src/idea/brief-content.ts` SHALL expose `parseBriefContent(markdown: string): { angle?, talkingPoints,
sourceUrls }` — PURE (no I/O, no clock), parsing one Idea's Brief markdown content (the SAME string
`src/importer/load-brief.ts`'s `loadBrief` already reads off disk) into: `talkingPoints` (via the new,
exported `extractTalkingPoints` — every bullet under a `## Talking Points`/`## Talking points` heading,
trimmed, deduplicated, a wrapped continuation line folded into the previous bullet, `[]` when the Brief
has no such section), `angle` (via the new, exported `extractAngle` — the `## Angle` section's own
paragraph, whitespace-collapsed, `undefined` when absent or blank), and `sourceUrls` (REFERENCING —
never re-implementing — `src/importer/source-urls.ts`'s existing `extractSourceUrls`). A markdown Brief
missing any given section SHALL simply omit/empty that field — never fabricated, never guessed. This
module SHALL never throw for any string input.

#### Scenario: A realistic Brief yields all three fields

- **GIVEN** a Brief markdown carrying an `## Angle` paragraph, a `## Talking Points` section with 4
  bullets (one wrapping onto a second physical line), and a `## Source(s)` section with 2 URLs
- **WHEN** `parseBriefContent(markdown)` is called
- **THEN** it returns `angle` as the whitespace-collapsed paragraph, `talkingPoints` as the 4 bullets (the
  wrapped one folded into ONE logical point), and `sourceUrls` as the 2 URLs, in each section's own order

#### Scenario: A title-only Brief yields no angle and empty talkingPoints/sourceUrls — never fabricated

- **GIVEN** a Brief markdown carrying only a title heading, no other section
- **WHEN** `parseBriefContent(markdown)` is called
- **THEN** it returns `angle: undefined`, `talkingPoints: []`, and `sourceUrls: []`
