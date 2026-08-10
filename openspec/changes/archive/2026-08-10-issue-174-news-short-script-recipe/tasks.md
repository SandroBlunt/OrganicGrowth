## 1. Production-Spec contract, validator, banned-word scan (test-first)

- [x] 1.1 Write failing tests (`news-short-script-validate.test.ts`) for `validateNewsShortScriptSpec`:
  a well-formed Spec passes; missing/empty `beats`, wrong first/last role, a non-"story" middle beat, a
  malformed beat (missing `text`/`source_url`/`show_cue`), a `source_url`/`media_url` that doesn't look
  like a URL, and a total word count outside [120, 150] each fail with a specific error code.
- [x] 1.2 Implement `src/production-spec/news-short-script-contract.ts` (types + constants) and
  `-validate.ts`.
- [x] 1.3 Write failing tests (`news-short-script-brand-safety.test.ts`) for
  `scanNewsShortScriptForBannedWords`: a banned word in `text`, `show_cue`, `source_url`, or `media_url`
  is each caught; a clean Spec passes; an empty banned-words list always passes.
- [x] 1.4 Implement `src/production-spec/news-short-script-brand-safety.ts`, reusing
  `brand-safety.ts`'s `scanTextFields` core.
- [x] 1.5 Add `src/production-spec/fixtures/news-short-script-specs.ts` (a valid Spec + focused broken
  variants), mirroring `fixtures/news-carousel-specs.ts`.

## 2. Shot List media collection — best-effort, never fails the job (test-first)

- [x] 2.1 Write failing tests (`shot-list-media.test.ts`): a beat with a working `media_url` downloads
  and is marked `"downloaded"`; a beat whose download throws/fails is marked `"link"` with
  `reason: "download_failed"`; a beat with no `media_url` is marked `"link"` with
  `reason: "no_media_url"`, using `source_url`; results preserve beat order; the injected downloader is
  a local fake — no real network fetch anywhere in the test.
- [x] 2.2 Implement `src/asset/shot-list-media.ts`: `collectShotListMedia(spec, destDir, options)`,
  injectable `ShotListDownloader`, a default `fetch`-based implementation, per-beat try/catch so a
  single failure never throws out of the whole collection (ADR-0021).

## 3. Copy widens additively: optional title + description shape (test-first)

- [x] 3.1 Write failing tests (`copy/validate.test.ts`): `validateCopy` requires/length-checks `title`
  ONLY when `shape.titleMaxChars` is set; a present `title` is banned-word- and dash-scanned; omitting
  `titleMaxChars` leaves existing behavior (both wired Recipes) byte-for-byte unchanged.
- [x] 3.2 Widen `CopyShape`/`Copy` in `src/copy/contract.ts` (`titleMaxChars?`, `title?`); implement the
  `validateCopy` title checks in `src/copy/validate.ts` (new `title_missing`/`title_length` codes).
- [x] 3.3 Write a failing test (`copy/inject.test.ts`): `injectRequiredParts` preserves an input `title`
  through unchanged. Fix `src/copy/inject.ts` to spread `title` through.
- [x] 3.4 Write a failing test (`copy/platform-shape.test.ts`): `platformCopyShapeFor("youtube")` carries
  `titleMaxChars: 100`; `validateCopyForPlatform(copy, "youtube", baseShape, rules)` enforces it. Add the
  field to `src/copy/platform-shape.ts`'s youtube entry.
- [x] 3.5 Export `assembleCaption`/`joinSentences` from `src/copy/draft.ts` (zero behavior change) and
  write failing tests + implementation for `src/copy/news-short-script-draft.ts`'s
  `newsShortScriptDraftCopy` — a deterministic title (≤`titleMaxChars`, from the Idea's own title) +
  description (from `angle`/`mediaContext`) drafter, always passing `validateCopy` for the shape it was
  drafted for (mirrors `defaultDraftCopy`/`skillDraftCopy`'s own guarantee).
- [x] 3.6 Fix `src/asset/asset.ts`'s `parseCopy` to carry `title` through a ledger round-trip; write a
  failing round-trip test first.

## 4. Output bundle: title line + the script/shot-list files (test-first)

- [x] 4.1 Write a failing test (`asset/output-bundle.test.ts`): `captionText` prepends `Title: …` when
  `copy.title` is present, and is byte-for-byte unchanged when it is absent. Implement in
  `src/asset/output-bundle.ts`; also carry `title` through `cloneCopy` (so `post.json` never drops it).
- [x] 4.2 Write failing tests (`asset/news-short-script-output.test.ts`): `scriptText` joins beats' `text`
  as clean paragraphs (no cues/URLs); `shotListText` renders each beat's role/show_cue/source plus its
  media outcome (downloaded filename or a marked link). Implement
  `src/asset/news-short-script-output.ts` (`scriptText`, `shotListText`, `writeScriptText`,
  `writeShotListText`).

## 5. Register the Recipe (test-first)

- [x] 5.1 Write failing tests in `recipe/registry.test.ts`: `listWiredRecipeSlugs()` includes
  `"news-short-script"`; it declares `gates: []`, no `space`/`canvasInputs`; its `specShape.validate`/
  `scanBannedWords` are the SAME functions (reference equality) as task 1's exports; its `copyShape`
  carries `titleMaxChars: 100` and mirrors `platformCopyShapeFor("youtube")`'s other bounds (zero
  drift); its `copySkill` is `"write-social-copy"`; its `phases` are all six, in order, with
  `bind-media`/`gate`/`render` EMPTY checklists (ADR-0021) and `author`/`copy` checklists referencing
  task 1/3's own functions.
- [x] 5.2 Implement the `NEWS_SHORT_SCRIPT` entry in `src/recipe/registry.ts` and add it to `REGISTRY`.

## 6. The real, wired Recipe runs end-to-end with zero Magnific calls (test-first)

- [x] 6.1 Write the failing end-to-end test (`producer/news-short-script-end-to-end.test.ts`): author
  (self-audited, saved via the spec store) → bind-media (`bindMediaSlots` with `{}`, vacuously ok) →
  gate (assert zero gates) → Shot List media collection (fake downloader, one downloaded + one
  link-only beat) → copy (`newsShortScriptDraftCopy`, self-audited, real committed Straw Motion Brand
  Profile read-only) → save (`writeAsset` with `asset_paths` from the downloaded media) → output bundle
  (`writeScriptText`, `writeShotListText`, `writeCaptionText`, `refreshPostJson`) — confirm every
  written file exists and `post.json`'s `copy.title` round-trips. The file imports no
  `SpaceMcpPort`/Magnific fake anywhere — that absence is the zero-Magnific-calls proof.
- [x] 6.2 Confirm the test fails for the right reason before task 5's registration exists, then passes.

## 7. The authoring Skill + brand-profile YouTube Channel (test-first for the docs-test)

- [x] 7.1 Write `src/production-spec/produce-news-short-script-skill.docs-test.ts` (mirroring
  `produce-news-carousel-skill.docs-test.ts`): asserts the Skill's front-matter slug, its references to
  the real contract/validator/scanner/spec-store/baseline-prompt-loader modules, its STOP semantics, and
  that it never calls `spaces_*`/`creations_*`/never publishes.
- [x] 7.2 Write `.claude/skills/produce-news-short-script/SKILL.md`, mirroring
  `produce-news-carousel`'s shape: read the Format's Baseline Prompt (`news-short-script` pointer) +
  the Idea brief, author the beats (hook → story → cta) + Shot List, self-audit against the author
  Phase Contract, emit the Spec through the spec store.
- [x] 7.3 Add an additive section to `.claude/skills/write-social-copy/SKILL.md` describing composing a
  title + description Copy for a Recipe whose `copyShape.titleMaxChars` is set; add a few new assertions
  to `src/copy/write-social-copy-skill.docs-test.ts` pinning it (never remove/alter an existing
  assertion).
- [x] 7.4 Add YouTube to `data/brands/straw-motion/brand-profile.yaml`'s `channel` list (non-primary,
  `url: https://www.youtube.com/@strawmotion`).

## 8. Full-suite green + self-review + Build Report

- [x] 8.1 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 8.2 Self-review pass: remove dead code, tighten module boundaries, confirm every issue #174
  acceptance criterion maps to a specific test.
- [x] 8.3 Write the Build Report into `handoff.md`.
