## 1. Brand resolver gains `baselinePromptsRoot` (test-first)

- [x] 1.1 Write failing tests (`resolver.test.ts`): `resolveBrand` returns a `baselinePromptsRoot`
  field equal to `<brandsRoot>/<slug>/baseline-prompts`, for the default brands root, a custom brands
  root, and across different slugs.
- [x] 1.2 Implement `baselinePromptsRoot` on `BrandPaths` and in `resolveBrand`
  (`src/brand/resolver.ts`), updating the doc comments' per-Brand-path count (seven -> eight).

## 2. FormatStore gains `baselinePrompts` + `strRecord` (test-first, issue #83 AC1)

- [x] 2.1 Write failing tests (`store.test.ts`): a fully-populated `baseline_prompts` map parses
  verbatim (keys/values trimmed); a Format with the key entirely absent yields `{}` (the "none"
  result, not an error); non-string values, empty keys, and empty values are dropped rather than
  crashing; completely garbled `baseline_prompts` (a string, an array, `null`) degrades to `{}`
  without throwing.
- [x] 2.2 Implement `strRecord` (a pure string->string map parser mirroring `strArray`'s degrade-
  never-crash convention) and wire `baselinePrompts: strRecord(obj.baseline_prompts)` into
  `parseFormatFile` (`src/format/store.ts`).

## 3. `formatBaselinePromptsRoot` — path resolution (test-first)

- [x] 3.1 Write failing tests: resolves `<brandsRoot>/<brand>/baseline-prompts/<formatSlug>`; rejects
  a path-traversal Format slug before touching the filesystem (mirrors `formatFilePath`/
  `formatIdeasRoot`).
- [x] 3.2 Implement `formatBaselinePromptsRoot` in `src/format/store.ts`.

## 4. `resolveBaselinePromptPath` — pure path-safety guard (test-first, issue #83 AC3)

- [x] 4.1 Write failing tests (`baseline-prompt.test.ts`): resolves a plain relative filename;
  trims whitespace; rejects (never throws) an empty pointer, a whitespace-only pointer, an
  absolute-path pointer, and a path-traversal pointer that would escape the Format's own
  baseline-prompts directory (including a traversal that still "looks like" a normal relative path);
  still THROWS for an invalid Format/Brand slug (the pre-existing tenancy boundary, a different
  concern).
- [x] 4.2 Implement `resolveBaselinePromptPath` in `src/format/baseline-prompt.ts`.

## 5. `loadBaselinePrompt` — the async I/O shell (test-first, issue #83 AC1/AC3)

- [x] 5.1 Write failing tests: returns `{ found: true, recipe, pointer, path, content }` reading a
  real fixture document's exact content; returns `{ found: false, reason: "not-declared" }` for a
  Recipe the Format never declares a pointer for (AND for a Format whose `baseline_prompts` is
  entirely absent) — never a throw; returns `{ found: false, reason: "malformed" }` for a
  path-traversal pointer, never crashing and never reading outside the directory; returns
  `{ found: false, reason: "dangling" }` for a safe, well-formed pointer whose file does not exist on
  disk — including when the Brand's `baseline-prompts/` directory does not exist at all.
- [x] 5.2 Implement `loadBaselinePrompt` in `src/format/baseline-prompt.ts`, built on
  `resolveBaselinePromptPath` + `readFile`.

## 6. Straw Motion's real Baseline Prompt (issue #83 AC2)

- [x] 6.1 Byte-faithfully import the Operator's locked prototype
  (`.context/prototypes/baseline-prompt.md`) into
  `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` — verify with `cmp`/
  `diff` (byte-identical) and record the SHA-256 + byte length.
- [x] 6.2 Add `baseline_prompts: { news-carousel: news-carousel.md }` to
  `data/brands/straw-motion/formats/unhypped-news.yaml`.
- [x] 6.3 Write tests proving the real Format + real document round-trip:
  `loadFormat("straw-motion", "unhypped-news").baselinePrompts["news-carousel"]` equals
  `"news-carousel.md"`; `loadBaselinePrompt` against the real Format finds the real document; a
  dedicated test pins the committed document's SHA-256/byte length against the value computed from
  the original prototype at import time, so a future accidental edit is caught by `npm test`.

## 7. Architecture proof — reads go through the store (ADR-0014)

- [x] 7.1 Write a repo-wide scan test (`baseline-prompt.test.ts`, mirrors the existing
  `assetsRoot` scan in `brand-asset/store.test.ts`): no source file outside
  `src/format/store.ts`/`src/brand/resolver.ts` (and their own tests) references
  `.baselinePromptsRoot` directly.
- [x] 7.2 Confirm the test passes as-is (`loadBaselinePrompt` only ever calls
  `formatBaselinePromptsRoot`, never the raw field), proving the store-boundary discipline holds.

## 8. Docs — CLAUDE.md documents the new per-Brand directory

- [x] 8.1 Add `baseline-prompts/<format>/<recipe>.md` to `CLAUDE.md`'s State section's per-Brand file
  list, mirroring how `assets/<key>.<ext>` was documented when the `BrandAssetStore` landed.

## 9. Self-review + full-suite green

- [x] 9.1 Re-read every new/changed module for dead code, unused exports, and drifted docstrings.
- [x] 9.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 9.3 Write the Build Report into `handoff.md`, mapping every issue #83 acceptance criterion to
  its proving test(s), confirming byte-faithfulness (cmp/diff + checksum), flagging that no Magnific
  fake was needed, and listing known limits (document interpretation deferred to issue #87).
