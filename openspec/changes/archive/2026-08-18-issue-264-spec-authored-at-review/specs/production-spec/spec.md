## ADDED Requirements

### Requirement: A deterministic Spec author exists for every wired Recipe, mirroring the Copy step's own drafter seam

For every wired Recipe, a deterministic, hermetic function (no model call, no I/O, no clock) SHALL exist
that authors a candidate Production Spec conformant with that Recipe's own `specShape.validate` from a
minimal Brief (`id`, `run`, `title`, and optionally `angle`/`companies`) — mirroring
`src/copy/draft.ts`'s `CopyDrafter`/`skillDraftCopy` pattern, which already stands in for a Recipe's
copywriting Skill the same way. `src/production-spec/generate.ts`'s existing `generate` is this author
for `character-explainer-with-cast`; `src/production-spec/news-carousel-generate.ts`'s
`generateNewsCarouselSpec` is this author for `news-carousel`;
`src/production-spec/news-short-script-generate.ts`'s `generateNewsShortScriptSpec` is this author for
`news-short-script`. Each stands in, deterministically, for that Recipe's own `producerSkill` (an LLM
authoring step that runs interactively) — a real model call is never made by this module or any of its
callers.

#### Scenario: generateNewsCarouselSpec always produces a Spec its own Recipe accepts

- **GIVEN** any well-formed minimal Brief (a non-empty `id`/`run`/`title`)
- **WHEN** `generateNewsCarouselSpec(brief)` is called
- **THEN** the result has exactly 7 slides in the fixed role order `hook -> then -> shift -> proof ->
  different -> next -> cta`, each with a non-empty `card_style`/`stat_callout`/`text` (at most 140 chars)/
  `image_prompt`, and `validateNewsCarouselSpec(result).ok` is `true`

#### Scenario: generateNewsShortScriptSpec always produces a Spec whose total word count is in range

- **GIVEN** any well-formed minimal Brief
- **WHEN** `generateNewsShortScriptSpec(brief)` is called
- **THEN** the result's `beats` is `hook` first, `cta` last, with at least one `story` beat between them;
  each beat carries a well-formed `source_url`, a non-empty `show_cue`, and 3-5 `curiosity_queries`; the
  summed word count across every beat's `text` falls inside `[MIN_TOTAL_WORDS, MAX_TOTAL_WORDS]`; and
  `validateNewsShortScriptSpec(result).ok` is `true`

### Requirement: authorSpecForRecipe authors a candidate Spec and self-checks it against auditAuthorPhase in one call

`src/production-spec/author-at-review.ts`'s `authorSpecForRecipe(recipe, brief, bannedWords, authors?)` SHALL look up `recipe.slug`'s default author (from `DEFAULT_SPEC_AUTHORS`, overridable via the optional
`authors` parameter for tests), author a candidate Spec, then run it through the EXISTING
`src/recipe/phase-contract.ts`'s `auditAuthorPhase` — the SAME function `command-surface/worker.ts`'s
`runOneJob` already calls for its own author-phase check, never a second, parallel implementation. It
SHALL return `{ ok: true, spec, audit }` when the audit passes, or `{ ok: false, audit }` (naming every
failing checklist item) when it does not. A Recipe slug with no registered author SHALL return `{ ok:
false }` naming the gap — never throw and never silently skip authorship.

#### Scenario: A well-formed News Carousel Brief authors successfully

- **GIVEN** the `news-carousel` Recipe, a well-formed Brief, and no banned words
- **WHEN** `authorSpecForRecipe(recipe, brief, [])` is called
- **THEN** it returns `{ ok: true }` carrying a Spec that ALSO passes `recipe.specShape.validate`
  directly (the same Spec the audit just checked, never a second, re-derived copy)

#### Scenario: A banned word in the Brief's title fails authorship loudly

- **GIVEN** the `news-carousel` Recipe, a Brief whose `title` contains a word later configured as banned
- **WHEN** `authorSpecForRecipe(recipe, brief, ["<that word>"])` is called
- **THEN** it returns `{ ok: false }` whose `audit.items` names the `banned-words` check failed, with a
  detail naming the exact hit
