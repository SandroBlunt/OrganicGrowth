## 1. Brand resolver gains `assetsRoot` (test-first)

- [x] 1.1 Write failing tests (`resolver.test.ts`): `resolveBrand` returns an `assetsRoot` field equal
  to `<brandsRoot>/<slug>/assets`, for the default brands root, a custom brands root, and across
  different slugs.
- [x] 1.2 Implement `assetsRoot` on `BrandPaths` and in `resolveBrand` (`src/brand/resolver.ts`),
  updating the doc comments' per-Brand-path count.

## 2. Brand-skeleton template ships an empty `assets/` directory (test-first)

- [x] 2.1 Write a failing test (`scaffold-brand.test.ts`): scaffolding a new Brand creates its
  `assets/` subdirectory, mirroring the existing `formats/` assertion.
- [x] 2.2 Add `templates/brand-skeleton/assets/.gitkeep` so `scaffoldBrand`'s recursive template copy
  materialises the directory with zero code changes to `scaffold-brand.ts`.

## 3. `mediaKindForFilename` — pure extension → MediaKind mapping (test-first)

- [x] 3.1 Write failing tests (`brand-asset/store.test.ts`): classifies common image/video/audio
  extensions (case-insensitively); returns `null` for an unrecognized extension or no extension at
  all; never throws.
- [x] 3.2 Implement `mediaKindForFilename` in `src/brand-asset/store.ts`.

## 4. `listBrandAssets` — directory enumeration (test-first, issue #82 AC1/AC2)

- [x] 4.1 Write failing tests: enumerates every recognized-media file in a Brand's `assets/`
  directory, keyed by filename basename, media-type aware, sorted by key; excludes dotfiles and
  unrecognized extensions (`README.md`, `.gitkeep`); returns `[]` (never throws) for a Brand with NO
  `assets/` directory at all; skips a directory entry that happens to carry a recognized-media
  extension; dedupes two files sharing the same key across extensions (first alpha-sorted wins).
- [x] 4.2 Implement `listBrandAssets` in `src/brand-asset/store.ts`, reusing `brandAssetsRoot` for path
  resolution (tenancy boundary via `resolveBrand`).

## 5. `getBrandAsset` — typed found/not-found lookup (test-first, issue #82 AC1/AC2)

- [x] 5.1 Write failing tests: returns `{ found: true, asset }` for an existing key, carrying the
  correct key/media/path; returns `{ found: false, key, message }` (never a throw) for a missing key
  when the `assets/` directory exists, naming the key, the Brand, and the Brand's actually-available
  keys; returns the SAME typed not-found shape (never a throw) for a Brand with no `assets/` directory
  at all; still throws for an invalid Brand slug (the tenancy boundary, a different concern than "not
  found"); media-type awareness holds for video and audio keys too.
- [x] 5.2 Implement `getBrandAsset` in `src/brand-asset/store.ts`.

## 6. Architecture proof — all reads go through the store (test-first, issue #82 AC3)

- [x] 6.1 Write a failing repo-wide scan test (`store.test.ts`): no source file outside
  `src/brand-asset/store.ts` (and the resolver that defines the `assetsRoot` path) references
  `.assetsRoot` directly.
- [x] 6.2 Confirm the test passes as-is (no other module reads `assetsRoot` yet — this slice is the
  first and only reader), proving the store-boundary discipline holds today and will keep holding as
  new callers are added later (they must go through `listBrandAssets`/`getBrandAsset`).

## 7. Docs — CLAUDE.md documents the new per-Brand directory

- [x] 7.1 Add `assets/<key>.<ext>` to `CLAUDE.md`'s State section's per-Brand file list, mirroring how
  `formats/<slug>.yaml` was documented when the FormatStore landed.

## 8. Self-review + full-suite green

- [x] 8.1 Re-read every new/changed module for dead code, unused exports, and drifted docstrings.
- [x] 8.2 Run `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run test:docs`, and
  `openspec validate --strict` for this change; all green.
- [x] 8.3 Write the Build Report into `handoff.md`, mapping every issue #82 acceptance criterion to its
  proving test(s), flagging that no Magnific fake was needed (and no real logo PNG ships here), and
  listing known limits (STOP-on-missing binding deferred to issue #88).
