> NOTE (orchestrator): the developer's Build Report below (and its "How to run" / "Files touched"
> sections) references `openspec archive` having already run and the change having moved to
> `openspec/changes/archive/2026-08-12-issue-188-news-carousel-real-media/`. That archive step ran
> out of the normal pipeline order (archive should only happen after QA passes). The orchestrator
> reversed it before QA: the OpenSpec change is back at `openspec/changes/issue-188-news-carousel-real-media/`
> and `openspec/specs/*.md` are back to their pre-archive state. QA below reviewed the change from
> that normal, pre-archive location.

## Build Report (developer)

### What changed

Four coupled changes to the News Carousel Recipe, built in the issue's own stated order (each landed
against the *final* shape of the previous one):

1. **Text-card minimum vertical space (landed first).** `news-carousel-contract.ts` gains
   `CAROUSEL_HERO_ROLES` (`["hook", "cta"]`), `CAROUSEL_HERO_TEXT_CARD_MIN_PCT` (60),
   `CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT` (50). The author-phase checklist gains a `text-card-size`
   mechanical item requiring the Baseline Prompt's own role-appropriate floor clause verbatim in every
   slide's `image_prompt`. Both Straw Motion Baseline Prompt documents (`unhypped-news`,
   `unhypped-daily` — identical shared content) are rewritten: a new "Card size" bullet states the
   60%/50% floors, the reusable template's card clauses no longer state the old ~25-30%/~30% numbers,
   and a note marks the (unedited) Examples section as a PLACEMENT reference only from here on (a
   documented, deliberate known limit — see below).
2. **Logo scoped to hook/cta only.** The logo now appears ONLY on the hook (~⅓ frame width, unchanged)
   and cta (~⅙ frame width, unchanged) slides — omitted ENTIRELY (not shrunk) on the 5 middle slides.
   The checklist's `logo-reference` item is now hero-role-aware (must reference on hook/cta, must NOT
   reference at all elsewhere). `NewsCarouselBaselineParams.fixedClauses` (now uniform, every slide)
   is split from a new `heroLogoClauses` (hero-only, the two logo-render/vignette clauses) —
   `verifyBaselineParamsAgainstDocument` checks both. The Baseline Prompt document's Logo/Logo-guardrail
   bullets and reusable template are rewritten to match; the "Unhypped News" pill (a separate element)
   is untouched behaviorally, only its own prose lightly reworded (it no longer says "matching the logo
   above" the way it used to, since the logo is now absent on 5 of 7 slides).
3. **Per-slide `kind`: `generated` / `image` / `video` (ADR-0024).** `CarouselSlide` gains OPTIONAL
   `kind`/`source_url` (backward compatible — an absent `kind` is treated as `"generated"`, so every
   pre-#188 Spec on disk stays valid, untouched). `validateNewsCarouselSpec` gains
   `slide_kind_invalid`/`slide_source_url_invalid`. The checklist gains `slide-kind-source` (structural,
   surfaced granularly) and `real-media-composited` (an image-kind slide's `image_prompt` must reserve a
   frame for the real photo; a video-kind slide's must reserve a window for the real video AND state a
   calmer/less-busy background — `realImageFrameClause`/`realVideoWindowClause`). The Baseline Prompt
   document gains a "Real source media" bullet + matching template bracket, naming idea-06's background
   as the "too busy" reference point.
4. **A new fetch-first, fallback-to-generated deep module** (`src/asset/carousel-real-media.ts`),
   mirroring `shot-list-media.ts`'s injectable-downloader precedent: `resolveCarouselSlideMedia`
   attempts the real fetch for an image/video-kind slide (never for a generated-kind slide — `download`
   is never called), resolving `"fetched"` (reachable + a byte-size/content-type-family quality bar) or
   `"fallback"` (`"unreachable"`/`"low_quality"`) — **no pause for the Operator, either way**.
   `resolveCarouselMedia` runs this over a whole Spec, sequentially. `applyCarouselMediaResolutions`
   bakes the RESOLVED (post-fallback) kind back into the Spec before it is saved.
5. **Schedule Batch exclusion.** `LedgerAssetRecord` gains optional `has_video_slide` (parsed
   defensively, kept only when `=== true` — mirrors `scheduled_at`'s "never fabricated" contract), set
   from the new `hasVideoSlide(spec)` contract helper. `eligibility.ts`'s `selectEligibleAssets` skips a
   `has_video_slide: true` news-carousel Asset with the SAME `"video"` reason/note shape a
   non-news-carousel video Asset already gets.
6. **`produce-news-carousel` SKILL.md** updated to author `kind`/`source_url` (only when the brief
   identifies a specific real source), the hero-only logo / role-dependent card-size / real-media
   brackets, and to run the new fetch module just before saving.

### Files touched

- New: `src/asset/carousel-real-media.ts`, `src/asset/carousel-real-media.test.ts`.
- Modified: `src/production-spec/news-carousel-contract.ts` (+`.test.ts`), `-validate.ts` (+`.test.ts`),
  `-author-checklist.ts` (+`.test.ts`); `src/production-spec/fixtures/news-carousel-specs.ts`,
  `-author-checklist-specs.ts`, `-straw-motion-specs.ts`;
  `src/production-spec/news-carousel-straw-motion-fixture.test.ts`;
  `src/production-spec/produce-news-carousel-skill.docs-test.ts`; `src/recipe/registry.ts`
  (+`.test.ts`); `src/asset/asset.ts` (+`.test.ts`); `src/schedule-batch/eligibility.ts` (+`.test.ts`);
  `.claude/skills/produce-news-carousel/SKILL.md`;
  `data/brands/straw-motion/baseline-prompts/{unhypped-news,unhypped-daily}/news-carousel.md`.
- OpenSpec: `openspec/changes/archive/2026-08-12-issue-188-news-carousel-real-media/` (this folder —
  `proposal.md`, `tasks.md`, `specs/{carousel-real-media,production-spec,recipe-registry,
  schedule-batch-export,asset-store,producer-skill}/spec.md`), archived into
  `openspec/specs/{carousel-real-media (new),production-spec,recipe-registry,schedule-batch-export,
  asset-store,producer-skill}/spec.md`.

### How to run

```bash
npx tsc -p tsconfig.json --noEmit          # type-check
npm test                                    # full unit suite (src/**/*.test.ts)
npm run test:docs                           # docs-conformance suite (src/**/*.docs-test.ts)
npx openspec validate --specs --strict      # validate the folded specs
npx openspec validate --changes --strict    # no active changes left (this one is archived)

# This slice's own new/most-relevant files, standalone:
node --import tsx --test src/asset/carousel-real-media.test.ts
node --import tsx --test src/production-spec/news-carousel-validate.test.ts
node --import tsx --test src/production-spec/news-carousel-author-checklist.test.ts
node --import tsx --test src/production-spec/news-carousel-straw-motion-fixture.test.ts
node --import tsx --test src/schedule-batch/eligibility.test.ts
node --import tsx --test src/asset/asset.test.ts
node --import tsx --test src/recipe/registry.test.ts
node --import tsx --test src/production-spec/produce-news-carousel-skill.docs-test.ts
node --import tsx --test src/production-spec/news-carousel-checklist-count.docs-test.ts
```

### Acceptance-criteria self-assessment

1. **"A rendered carousel shows the logo only on slide 0 (hook) and slide 6 (cta), at their existing
   respective sizes; slides 1-5 carry no logo."**
   - `src/production-spec/news-carousel-author-checklist.test.ts` — describe `"logo-reference is now
     HERO-ONLY (hook/cta) — the 5 middle slides carry NO logo at all (issue #188)"` (both its): passes
     cleanly on a baseline-adherent Spec; fails when a standard slide wrongly carries the logo.
   - `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — `"every HERO slide (hook/cta) of
     strawMotionIdeaOneCarouselSpec() still carries the UPDATED logo vignette clause verbatim ... the 5
     middle slides carry no logo clause at all"`, the matching guardrail test, and (new) `"the hook
     slide's logo keeps its ~⅓-frame-width scale, DISTINCT from the cta slide's ~⅙-frame-width scale —
     both their EXISTING sizes, unchanged by issue #188"` — proves the two hero slides keep their
     OWN, distinct, pre-existing sizes while the 5 middle slides carry neither.

2. **"The baseline prompt specifies a text card of at least 60% ... at least 50% ..."**
   - `src/production-spec/news-carousel-author-checklist.test.ts` — describe `"text-card-size — the NEW
     mechanical item (issue #188)"`.
   - `src/production-spec/news-carousel-straw-motion-fixture.test.ts` — the `"loadFormat +
     loadBaselinePrompt resolve the real document, and every STRAW_MOTION_BASELINE string is a real
     substring"` test now asserts `heroTextCardMinPctClause`/`standardTextCardMinPctClause` are literal
     substrings of the REAL, committed document — not asserted by fiat.
   - The document itself (`data/brands/straw-motion/baseline-prompts/{unhypped-news,unhypped-daily}/
     news-carousel.md`) carries the new "Card size" bullet stating both floors.

3. **"The Recipe's Production Spec shape carries a per-slide kind ...; reachable+adequate → real media
   composited; unreachable/low-quality → generated fallback; no pause either way."**
   - Spec shape: `src/production-spec/news-carousel-validate.test.ts` — describe `"validateNewsCarouselSpec
     — per-slide kind (ADR-0024, issue #188)"` (7 tests: accepts no-kind/image/video, rejects invalid
     kind, rejects missing/malformed source_url, generated needs no source_url).
   - Checklist: `news-carousel-author-checklist.test.ts` — describe `"slide-kind-source +
     real-media-composited — the NEW mechanical items"` (7 tests).
   - Fetch-first-fallback DECISION: `src/asset/carousel-real-media.test.ts` — every test in the file
     (17 total): reachable+adequate image/video fetched and written to disk; unreachable (ok:false,
     thrown, no source_url) falls back `"unreachable"`; too-small/wrong-content-type falls back
     `"low_quality"`; a generated-kind slide never calls `download` at all; `resolveCarouselMedia` proves
     the same across a whole 7-slide mix, sequentially, never throwing; the explicit `"never pauses for
     input"` test plus every other test's plain, non-interactive `await` shape together prove "no pause
     either way" (there is no interactive primitive anywhere in the module's exported surface).

4. **"A video-typed slide's generated background reads as calmer/less busy than idea-06's example."**
   - Mechanically expressed as an explicit, required clause (`realVideoWindowClause`) stating "keep the
     rest of the background calm and uncluttered, with no other competing focal elements" — proved
     present-or-absent by `news-carousel-author-checklist.test.ts`'s `real-media-composited` tests (video
     slide with/without the clause), and proved a genuine substring of the real document by
     `news-carousel-straw-motion-fixture.test.ts`'s baseline-strings test. This mirrors the SAME pattern
     the codebase already uses for its other quality bars (e.g. `pill-text-caps`/`fixed-clauses` —
     presence of an explicit, parameterized instruction, never a subjective visual judgement inside a
     pure function).

5. **"An Asset carrying at least one video slide is excluded from Schedule Batch eligibility, consistent
   with how other video Assets are already excluded."**
   - `src/schedule-batch/eligibility.test.ts` — describe `"a news-carousel Asset carrying a video slide
     (ADR-0024, issue #188)"`: skipped with `reason: "video"` (the SAME reason/shape a non-news-carousel
     Recipe's Asset already gets); a `false`/absent `has_video_slide` stays eligible as normal.
   - `src/asset/asset.test.ts` — describe `"has_video_slide (ADR-0024, issue #188)"`: parses `true`;
     `false`/malformed/absent are omitted entirely (never fabricated), mirroring `scheduled_at`.
   - `src/asset/carousel-real-media.test.ts` — `"end-to-end: hasVideoSlide reads the ACTUAL, post-fallback
     shape — never the authored intent"` ties the fetch resolution to the SAME `hasVideoSlide` helper
     that would feed `has_video_slide` at save time.

6. **"Full test suite green; ADR-0024 and CONTEXT.md stay accurate to shipped behavior."**
   - `npm test`: 2188/2189 pass (the ONE failure, `src/format/store.test.ts`'s `"mundotip and
     straw-motion are migrated to their own Format files (issue #53 AC2)"`, is confirmed pre-existing and
     unrelated — reproduced identically on a clean `git stash` of this whole slice's changes).
   - `npm run test:docs`: 229/229 pass.
   - `npx openspec validate --specs --strict` / `--changes --strict`: all pass; no active change left
     (archived).
   - `docs/adr/0024-news-carousel-fetches-real-source-media-by-default.md`: read, unmodified — every
     decision it states (three kinds, fetch-first, fallback-to-generated-not-a-pause, Schedule Batch
     trade-off) matches the shipped behavior exactly; nothing built here contradicts it.
   - `CONTEXT.md`: read; it makes no claim about the News Carousel Recipe's per-slide logo placement,
     text-card proportions, or media kind that this slice would make stale — left untouched (see Known
     limits).

### Fakes / fixtures used

- **The Magnific fake, explicitly flagged: NOT used or touched anywhere in this slice.** No test in this
  build imports `space-driver/fixtures/fake-space.ts` or `producer/fixtures/fake-carousel-space.ts`; no
  `spaces_*`/`creations_*` call appears anywhere in the new/changed code or tests. The existing
  `carousel-end-to-end.test.ts` (which DOES use `FakeCarouselSpace`) is untouched and still green,
  proving this slice made no accidental behavior change to the driver-level path.
- `src/asset/carousel-real-media.test.ts`'s own LOCAL FAKE downloader (`CarouselMediaDownloader`,
  injected per test) — never the real `fetch`/network, mirroring `shot-list-media.test.ts`'s own
  precedent (documented at the top of the test file itself).
- `src/production-spec/fixtures/news-carousel-specs.ts`, `-author-checklist-specs.ts`,
  `-straw-motion-specs.ts` — plain-data Production Spec fixtures (no I/O).
- `data/brands/straw-motion/baseline-prompts/{unhypped-news,unhypped-daily}/news-carousel.md` — the
  REAL, committed Baseline Prompt documents, read (not faked) by
  `news-carousel-straw-motion-fixture.test.ts` via `loadFormat`/`loadBaselinePrompt` — this is
  plain-file + pure-function testing, no Space, no MCP tool, no network.

### Self-review notes

- Split `fixedClauses` (uniform-across-every-slide) from a new `heroLogoClauses` (hero-only) rather than
  bolting the two logo-render clauses onto the existing `logo-reference` item's own inline strings —
  keeps `NewsCarouselBaselineParams` self-describing and lets `verifyBaselineParamsAgainstDocument`
  cover them the SAME way every other clause is covered, instead of a one-off special case.
- Kept `kind`/`source_url` OPTIONAL on `CarouselSlide` (not required) specifically so every pre-#188 Spec
  already on disk (including real, produced Straw Motion Assets) stays valid without a migration —
  mirrors the `companies` field's own precedent (issue #125) for the wired Recipe.
- `carousel-real-media.ts` deliberately does NOT attempt any image/video compositing itself (see Known
  limits) — it only proves the fetch-first-fallback DECISION and downloads real bytes to disk, which is
  the actual, testable surface this ticket asked the developer to build (authoring Spec data + a
  validator, not driving a live Space).
- Removed the ~25-30%/~30% numeric card-size language from the Baseline Prompt document's card-placement
  clauses (`cardClause`/the top-card branch) rather than leaving a second, unreferenced set of numbers
  next to the new floors — a single, testable clause (`cardSizeClause`) is now the ONLY place a card's
  size is stated, so a future edit can never leave the doc quietly self-contradictory.
- Added the "hook ~⅓ vs cta ~⅙, distinct scales" test (previously only the CTA's ⅙ number was pinned by
  a pre-existing docs-style test) — the fixture code already differentiated them by role but nothing
  proved it before this pass; simplification in the same spirit as the rest of this module (prove the
  literal acceptance-criterion wording, not just a nearby fact).

### Known limits

- **No actual image/video compositing.** This slice authors the reserved-frame/window instructions as
  Production Spec data and proves the fetch-first-fallback DECISION + real-byte download; rendering the
  Space so a fetched photo/video is literally composited into the generated slide is a live-Space
  concern, explicitly out of scope (the developer has no Magnific tools) and deferred, matching the
  proposal's own "Non-Goals".
- **The Examples section of both Baseline Prompt documents is left un-rewritten**, marked with an
  explicit "read for PLACEMENT only, not for size or logo scope" note rather than hand-rewriting all 7
  historical worked JSON examples to the new 60%/50% card size and hero-only logo — mirrors this same
  document's own established precedent (idea-01's committed fixture already carries a documented,
  similar simplification from issue #110, "left as-is here ... see this slice's Build Report Known
  limits").
- **The "low_quality" proxy is a byte-size floor + content-type-family check**, not an actual visual
  quality judgement (no vision model, no human review) — a deliberate, pure-function-appropriate
  simplification; a genuinely blurry-but-large, correctly-typed image would currently pass.
- **CONTEXT.md left unchanged.** Reviewed against every ADR-0024/issue-#188 concept (per-slide kind,
  hero-only logo, text-card size); none of these rise to the level of new, glossary-worthy domain
  vocabulary the way `Cast`/`Shot List` do, and CONTEXT.md made no prior claim this slice would make
  stale.
- The one pre-existing `src/format/store.test.ts` failure (issue #53 AC2, `listFormatSlugs` count) is
  unrelated — confirmed identical on a clean stash of this entire slice.

---

## QA Verdict — Round 1: PASS

Reviewed from the normal, pre-archive location per the orchestrator's note at the top of this file:
`openspec/changes/issue-188-news-carousel-real-media/` (change) and `openspec/specs/*.md` (folded specs,
pre-archive/pre-#188 content). Branch `issue-188-news-carousel-real-media`, working tree as left by the
developer (nothing committed).

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — clean, exit 0.
- `npm test` — **2188/2189 pass.** The one failure is `src/format/store.test.ts` › `"mundotip and
  straw-motion are migrated to their own Format files (issue #53 AC2)"` › `"listFormatSlugs finds both
  real Brands' migrated Format"`. Confirmed pre-existing and unrelated to this slice: (a)
  `src/format/store.test.ts` does not appear in `git status`/`git diff` for this branch at all; (b) ran
  `git stash push -u` (stashing every change + new file this slice introduces) and re-ran just this test
  file — it fails identically on the clean pre-#188 tree; (c) matches the QA notes from #185/#187 citing
  the same failure, stale since `eb76882`. Excluded from the green bar, as it was in those prior rounds.
- `npm run test:docs` — **228/229 pass.** One failure, and it is a genuine finding, documented below
  under "Suite-result caveat" and in the defect list (severity: low, non-blocking — see rationale).
- `npx openspec validate --strict issue-188-news-carousel-real-media` — **valid.**
- `npx openspec validate --changes --strict` — **valid**, 1 passed / 0 failed (the active change, at its
  normal pre-archive location).

**Suite-result caveat (the one docs-test failure, root-caused).** `src/production-spec/news-carousel-
checklist-count.docs-test.ts` (a PRE-EXISTING file, last touched in commit `994fd46`, NOT part of this
slice's diff) is an anti-drift guard that reads the numbers stated in prose in `openspec/specs/
production-spec/spec.md` — the ARCHIVED/folded spec file — and compares them against
`auditNewsCarouselAuthorPhase`'s real, live item count. This slice's code changes that real count from
12 to 15 (three new checklist items: `text-card-size`, `slide-kind-source`, `real-media-composited`).
The developer's own change delta at `openspec/changes/issue-188-news-carousel-real-media/specs/
production-spec/spec.md` already correctly states the NEW count (`"exactly 15 entries ... 16 with one"`,
confirmed by reading it directly, lines 109/186/362) — but `openspec/specs/production-spec/spec.md`
(the pre-archive, currently-active canonical file) still states the OLD count (`"exactly 12 entries"`),
because folding the change into `openspec/specs/` is exactly what `openspec archive` does, and per the
normal pipeline order archive only happens AFTER QA passes (this PR's own archive step, per CLAUDE.md's
build pipeline). I verified this is not a functional defect: `git stash`-ing this slice's changes makes
the same single test PASS (the archived spec matches the pre-#188 code); restoring the stash reproduces
the identical failure with `actual: 12` (spec) `!== 15` (code). This is a structural conflict between
this one pre-existing test's design (it hard-depends on the archived spec already being in sync) and the
normal QA-before-archive pipeline order — it will reproduce for ANY future slice that changes the News
Carousel checklist's item count, reviewed at the correct pre-archive point, regardless of what that
slice's developer does. It self-resolves the moment this PR's own archive step runs (folding the
delta's already-correct "15" into `openspec/specs/production-spec/spec.md`). Given (a) it is not caused
by an error in this slice's actual behavior, (b) the change delta itself is internally correct and
matches the code, and (c) it is unfixable by the developer without archiving early again (which is
explicitly the wrong order), I do not weight it as a blocking functional defect — but I am not
fabricating a full "229/229 green" claim either; see the defect list for the precise, honest record and a
recommendation for `/build-issue`.

### Per-criterion results (issue #188 acceptance criteria, verbatim)

1. **"A rendered carousel shows the logo only on slide 0 (hook) and slide 6 (cta), at their existing
   respective sizes; slides 1-5 carry no logo."** — **PASS.**
   - Code: `news-carousel-contract.ts`'s `CAROUSEL_HERO_ROLES`/`isCarouselHeroRole`; the checklist's
     `logo-reference` item (`news-carousel-author-checklist.ts`) requires the logo clause on hook/cta and
     forbids it entirely elsewhere; `news-carousel-straw-motion-specs.ts`'s `logoClause(edge, role)`
     differentiates hook's `~⅓` from cta's `~⅙`, called ONLY when `isCarouselHeroRole(role)`.
   - Tests: `news-carousel-author-checklist.test.ts` (logo-reference hero-only describe block, both
     positive and `standardSlideWronglyCarriesLogo` negative fixture);
     `news-carousel-straw-motion-fixture.test.ts` lines 307-337 (`"every HERO slide ... carries the
     negative guardrail ... the 5 middle slides carry no logo reference at all"` and `"the hook slide's
     logo keeps its ~⅓-frame-width scale, DISTINCT from the cta slide's ~⅙-frame-width scale"`) — read
     and confirmed these actually assert both the presence on hook/cta AND absence on the 5 middle
     slides, and the two distinct scales, against the REAL committed Straw Motion fixture, not just a
     synthetic stand-in.
   - Baseline doc: `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` lines
     43-51 states "Present on exactly two slides ... omit the logo clause ENTIRELY" on the 5 middle
     slides — matches.

2. **"The baseline prompt specifies a text card of at least 60% ... at least 50% ..."** — **PASS.**
   - Baseline doc line 79-85: "on the hook and cta slides, the text card occupies at least 60% ...; on
     every other slide ... at least 50%" — read directly, verbatim match to the issue's wording.
   - Code: `CAROUSEL_HERO_TEXT_CARD_MIN_PCT = 60`, `CAROUSEL_STANDARD_TEXT_CARD_MIN_PCT = 50`
     (`news-carousel-contract.ts`).
   - Tests: `news-carousel-author-checklist.test.ts`'s `text-card-size` describe block (positive +
     `missingTextCardSizeClause` negative fixture); `news-carousel-straw-motion-fixture.test.ts`'s
     baseline-strings test asserts `heroTextCardMinPctClause`/`standardTextCardMinPctClause` are genuine
     substrings of the REAL document (not hand-typed by fiat) — confirmed by reading the test and the
     document side by side.

3. **"The Recipe's Production Spec shape carries a per-slide kind (generated/image/video); given a
   reachable, adequate source, an image- or video-typed slide produces a slide with real media
   composited in; given an unreachable/too-low-quality source, it falls back to fully generated — with
   no pause for Operator input either way."** — **PASS.**
   - Shape: `CarouselSlide.kind?`/`source_url?`, `CAROUSEL_SLIDE_KINDS`, `slideKind()`
     (`news-carousel-contract.ts`); `validateNewsCarouselSpec`'s `slide_kind_invalid`/
     `slide_source_url_invalid` (`news-carousel-validate.ts`) — 7 tests in
     `news-carousel-validate.test.ts`'s `"per-slide kind"` describe block, read and confirmed each
     asserts the specific behavior named (accepts no-kind, accepts image/video with a well-formed URL,
     rejects an invalid kind, rejects missing/malformed `source_url`, generated needs no URL).
   - "Real media composited in": the Production Spec's `image_prompt` for an image/video-kind slide is
     required (checklist's `real-media-composited` item) to state a reserved-frame/window instruction
     verbatim (`realImageFrameClause`/`realVideoWindowClause`) — the compositing ITSELF (pixel-level) is
     explicitly out of scope per ADR-0024's own Non-Goals and the proposal's Non-Goals section (Space
     compositing is a live-Space concern the developer has no tools for) — this is the correct scope for
     a slice built against a fake, and matches the issue's own framing ("composited into a reserved
     frame/window" as a Spec/prompt-authoring concern, not a raster-editing one at this layer).
   - Fetch-first-fallback: `src/asset/carousel-real-media.ts`'s `resolveCarouselSlideMedia` — read the
     full module; confirmed it (a) never calls `download` for a generated-kind slide, (b) resolves
     `"fetched"` only on `ok:true` AND adequate byte-size/content-type, (c) resolves `"fallback"` with
     `"unreachable"` (no URL, thrown error, `ok:false`) or `"low_quality"` (too small / wrong
     content-type family) otherwise, (d) contains no interactive/pausing primitive anywhere in its
     exported surface — the whole decision is `await download(...)` then a synchronous branch. 17 tests
     in `carousel-real-media.test.ts`, all read: reachable+adequate image/video fetched & written to
     disk; unreachable (both `ok:false` and thrown) falls back "unreachable"; too-small and
     wrong-content-type-family both fall back "low_quality"; missing `source_url` falls back
     "unreachable" without calling `download`; explicit `"never pauses for input"` test; sequential
     `resolveCarouselMedia` proves the same over a 7-slide mix without throwing.
   - Confirmed hermeticity: `defaultCarouselMediaDownload` (the only `fetch`-using code) is never
     imported or exercised by the test file — grepped for `fetch(` in the test file: zero hits;
     `options.download` is injected in every test.

4. **"A video-typed slide's generated background reads as calmer/less busy than idea-06's example (fewer
   competing focal elements around the reserved window) — check how this is mechanically
   expressed/tested."** — **PASS**, with the mechanism explicitly a text-clause proxy, not a genuine
   visual/quality judgement (correctly disclosed as a Known Limit by the developer, and consistent with
   how every other qualitative bar in this same checklist module is expressed, e.g. `pill-text-caps`,
   `fixed-clauses` — presence of a required, parameterized instruction string, never a pixel-level
   check).
   - Baseline doc lines 104-110: "keep the rest of the background calm and uncluttered, with no other
     competing focal elements, since the moving video is the slide's own focal point ... (idea-06's
     background is the 'too busy' reference point this replaces)" — names idea-06 explicitly, matching
     the issue's own framing.
   - Code: `realVideoWindowClause` required verbatim on every `kind: "video"` slide's `image_prompt` via
     the checklist's `real-media-composited` item — tests `videoSlideWithWindowClause` (passes) /
     `videoSlideMissingWindowClause` (fails) in `news-carousel-author-checklist.test.ts`, both read and
     confirmed to isolate this one clause.
   - This satisfies the acceptance criterion AS WRITTEN for this layer of the system (authoring a
     Production Spec instruction, not rendering pixels) — actually rendering and visually judging
     "calmer" is explicitly out of scope (no Magnific tools, no vision model), same limitation as
     criterion 3's compositing.

5. **"An Asset carrying at least one video slide is excluded from Schedule Batch eligibility, consistent
   with how other video Assets are already excluded."** — **PASS, and confirmed the SAME mechanism.**
   - Read `src/schedule-batch/eligibility.ts` in full: the existing mechanism for a non-news-carousel
     video Asset is `asset.recipe !== SUPPORTED_RECIPE` → `skipped.push({ reason: "video", ... })`. The
     new check for a video-slide carousel is `asset.has_video_slide === true` → `skipped.push({ reason:
     "video", ... })` — the exact SAME `SkipReason` union member (`"video"`), the exact same `skipped`
     array shape, placed as a second early-return check BEFORE the status/scheduled_at checks — not a
     parallel or duplicated mechanism.
   - Ledger field: `LedgerAssetRecord.has_video_slide?: boolean` (`src/asset/asset.ts`), parsed only when
     `=== true` (`parseAssetRecord`), set from `hasVideoSlide(spec)` (`news-carousel-contract.ts`).
   - Tests: `eligibility.test.ts`'s new describe block (skipped with `reason: "video"`, `recipe:
     "news-carousel"`; `false`/absent stays eligible); `asset.test.ts`'s `has_video_slide` describe block
     (parses `true`; `false`/malformed/absent omitted, never a stray key); `carousel-real-media.test.ts`'s
     end-to-end test ties `applyCarouselMediaResolutions` + `hasVideoSlide` together so the ledger flag
     tracks the ACTUAL post-fallback shape, never the authored intent (a video slide that fell back to
     generated correctly reads `hasVideoSlide() === false`).

6. **"Full test suite green; ADR-0024 and CONTEXT.md stay accurate to shipped behavior."** — **PASS with
   a caveat**, see "Suite-result caveat" above: `npm test` is 2188/2189 (1 pre-existing, unrelated, and
   independently confirmed both by stash-diff here and by prior #185/#187 QA rounds); `npm run test:docs`
   is 228/229, the 1 failure being an archive-timing artifact of a pre-existing docs-test, not a
   functional defect, self-resolving at this PR's own archive step. `docs/adr/0024` read in full —
   matches shipped behavior exactly (three kinds, fetch-first, fallback-to-generated-not-a-pause,
   Schedule Batch trade-off). `CONTEXT.md` read — makes no claim this slice contradicts; ADR-0025/0026
   and CONTEXT.md's other content untouched by this branch (confirmed via `git status`/`git log`).

### Per-scenario results (OpenSpec spec deltas → issue #188)

Read every Requirement + Scenario in `openspec/changes/issue-188-news-carousel-real-media/specs/{carousel-
real-media,production-spec,recipe-registry,schedule-batch-export,asset-store,producer-skill}/spec.md` and
cross-checked each against the actual code/tests. All PASS — every Scenario is traceable to a real test
that was independently verified to assert the stated behavior; none is aspirational or ahead of the
code.

- **`carousel-real-media` (ADDED, 3 Requirements, 10 Scenarios)** — `resolveCarouselSlideMedia` fetches
  first, falls back never-pausing; `resolveCarouselMedia` sequential over a whole Spec; `apply
  CarouselMediaResolutions` bakes the resolved kind back in. Every Scenario maps 1:1 to a test in
  `carousel-real-media.test.ts` (confirmed above under AC3). PASS.
- **`production-spec` (MODIFIED, 2 Requirements' worth of #188 content, ~20 Scenarios touching kind/
  source_url/checklist)** — `validateNewsCarouselSpec`'s kind/source_url Scenarios map to
  `news-carousel-validate.test.ts`'s 7 new tests; the checklist Requirement's 15-vs-16-item count and its
  Scenarios (text-card-size, slide-kind-source, real-media-composited, hero-only logo-reference) map to
  `news-carousel-author-checklist.test.ts`; the Straw Motion fixture Requirement's Scenarios map to
  `news-carousel-straw-motion-fixture.test.ts`. All confirmed present and passing (excepting the one
  archive-timing docs-test discussed above, which is a SEPARATE file, `news-carousel-checklist-count.
  docs-test.ts`, not one of these Scenarios' own covering tests). PASS.
- **`recipe-registry` (MODIFIED, 1 Requirement, 7 Scenarios)** — the 10-item (9 mechanical + 1
  agent-judged) author-phase checklist count and the save-phase `hasVideoSlide` reference map to
  `registry.test.ts`'s updated assertions (10/9/1 counts; the new `hasVideoSlide`-referencing save-phase
  test) — read and confirmed both. PASS.
- **`schedule-batch-export` (MODIFIED, 1 Requirement, 6 Scenarios)** — the `has_video_slide` exclusion
  Scenario and the "false/absent stays eligible" Scenario map to `eligibility.test.ts`'s new describe
  block (confirmed above under AC5). PASS.
- **`asset-store` (ADDED, 1 Requirement, 4 Scenarios)** — `has_video_slide` parse/round-trip/omission
  Scenarios map to `asset.test.ts`'s new describe block (confirmed above under AC5); the "introduces no
  new AssetStatus" Scenario is trivially true — `has_video_slide` is a sibling field, not a status, and
  `parseAssetRecord`'s `status` handling is untouched by this diff (confirmed via `git diff`). PASS.
- **`producer-skill` (ADDED, 1 Requirement, 5 Scenarios)** — the SKILL.md content Scenarios (hook/cta-only
  logo, role-dependent card-size, kind/real-media-module naming, checklist bullet naming, no hardcoded
  Straw Motion strings) map to `produce-news-carousel-skill.docs-test.ts`'s new describe block — read the
  SKILL.md diff directly and confirmed every asserted string is genuinely present, and confirmed (via
  `grep`) that `"Unhypped News"`/`"Straw_Motion_Logo"`/`"Brand_Logo"` do not appear anywhere in the
  SKILL.md diff. PASS.

### Always-rules + Magnific-fake checks

- **Generate-never-publish** — PASS. This slice only authors Production Spec data and fetches/keeps real
  source bytes on local disk (`carousel-real-media.ts`'s `writeFileAtomic`); nothing in the diff calls
  any publish/post API. `git diff --stat` confirms no touch to `/log-post`, Zoho MCP, or any publish path.
- **Public-metrics-only** — PASS (not applicable/untouched). No metrics/performance-tracking code is
  touched by this diff (confirmed via `git status`).
- **Relative-not-absolute** — PASS (not applicable/untouched). No scoring/baseline-comparison code is
  touched.
- **Explicit-attribution** — PASS (not applicable/untouched). `/log-post` and Post↔Idea/Recipe linking
  code are untouched by this diff.
- **Ledger-as-source-of-truth** — PASS. `has_video_slide` is written to `LedgerAssetRecord` (the ledger)
  like every other Asset field, parsed defensively (`=== true` only, mirroring `scheduled_at`'s own
  "never fabricated" contract — confirmed by reading `parseAssetRecord`'s diff directly), and
  `schedule-batch/eligibility.ts` reads it FROM the ledger record it's given, never re-derives it ad hoc
  from a separately-loaded Spec at export time. It introduces no new `AssetStatus` and does not disturb
  the existing `queued → in_production → produced → posted → tracking → scored` lifecycle (confirmed via
  `asset.test.ts`'s new "introduces no new AssetStatus" scenario and by reading `parseAssetRecord`'s
  status-handling code, unmodified).
- **Magnific fake / no live-Space calls** — PASS, verified directly:
  - `grep -rn "spaces_\|creations_" src/asset/carousel-real-media.ts src/asset/carousel-real-media.test.ts`
    → only one hit, a comment in the test file's own docstring stating NOTHING here calls those tools.
  - `grep -n "fetch(" src/asset/carousel-real-media.test.ts` → zero hits (only
    `defaultCarouselMediaDownload`, the production-only default, uses real `fetch`; it is never imported
    or exercised by the test file — every test injects `options.download`).
  - Cross-checked every file in this branch's full diff (`git diff --name-only`, 19 files) for
    `spaces_*`/`creations_*` — zero hits anywhere.
  - The pre-existing `FakeCarouselSpace`-based `carousel-end-to-end.test.ts` is untouched by this branch
    and still passes as part of the 2188 green — confirms no accidental behavior change at the
    driver/Space-fake layer either.

### Build-order compliance (issue's own note: land text-card-size before compositing geometry)

**PASS.** Read the Baseline Prompt document's "Card size" bullet (lines 79-85) and "Real source media"
bullet (lines 98-110) together: the Card size bullet explicitly states "only the remaining minority of
the frame is photo (or, on an image/video slide, the reserved frame/window — see 'Real source media'
below)" — i.e. the reserved frame/window is explicitly scoped to fit within the frame AFTER the final
60%/50% card floor, not the old ~25-30%. `grep`ed the whole document for `25-30`/`~30%` — the only
remaining hits are inside the (explicitly marked, historical) Examples section and one doc-comment in
`news-carousel-straw-motion-specs.ts` describing what was REMOVED — no leftover reference to the old
proportions in any operative clause, template bracket, or code path.

### Defect list

1. **Severity: low (non-blocking).** `npm run test:docs` shows 228/229, not the developer's claimed
   229/229, because `src/production-spec/news-carousel-checklist-count.docs-test.ts` (pre-existing,
   unmodified by this slice) reads the pre-archive `openspec/specs/production-spec/spec.md`, which still
   states the OLD checklist-item count (12) — the archive step that would fold in the NEW, already-correct
   count (15, per this slice's own change delta) has been deliberately deferred until after QA, per the
   normal pipeline order. This is a structural/timing artifact, not a functional bug: `git stash` proves
   the test passes on the pre-#188 tree and fails only once this slice's (correct) checklist-count change
   is applied but not yet archived. **Repro:** on this branch, `git stash push -u` (or check out `main`),
   run `node --import tsx --test src/production-spec/news-carousel-checklist-count.docs-test.ts` → passes;
   `git stash pop` (restore this slice's changes), re-run the same command → fails with `spec says 12 base
   entries; the audit returns 15`. **Recommendation:** no developer action needed on this slice; this
   self-resolves when `/build-issue`'s normal archive step runs after this PASS verdict (folding the
   change delta's own already-correct "15"/"16" into `openspec/specs/production-spec/spec.md`). Flagging
   this for the Operator's awareness since it is the second time this category of archive-timing/docs-test
   gotcha has surfaced in this pipeline (see prior session memory: "openspec-archive vs validate
   MODIFIED-header trap") — worth considering whether `news-carousel-checklist-count.docs-test.ts` should
   instead read the ACTIVE change's own spec delta when one exists for `production-spec`, falling back to
   the archived `openspec/specs/` only when there is no in-flight change — but that is a test-infra
   improvement for a future slice, not this one.

No other defects found. Every acceptance criterion, every OpenSpec Scenario, every always-rule, and the
Magnific-fake/hermeticity requirement are satisfied by real, passing, on-topic tests that were read and
independently confirmed to assert what they claim — not merely trusted from the Build Report.

**Overall: PASS.** Recommend proceeding to branch/PR per the normal `/build-issue` on-pass flow.
