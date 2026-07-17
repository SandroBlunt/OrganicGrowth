## Why

Map #70's recipe-architecture wayfinding (ADR-0016) decided that a Recipe's canvas takes two typed
inputs — a named media-slot map and a prompt node — and that a **brand-asset** media slot (e.g. the
News Carousel Recipe's `"Brand Logo"`, `brandAssetKey: "brand-logo"`, wired descriptively in issue #81)
is filled from a new per-Brand store of reusable media: the **Brand Asset**. Nothing reads or lists a
Brand's committed media yet — issue #82 builds that store. It is the media parallel of the existing
per-Brand watermark @handle *text* parameter (`brand-profile.yaml`'s `production.watermark_handle`),
read the same way every other per-Brand file is: through a typed store, never a stray filesystem call.

## What Changes

- **A new per-Brand directory, `data/brands/<slug>/assets/`,** holds a Brand's reusable media
  (image/video/audio), committed to git like every other per-Brand document (ADR-0014: "documents the
  human authors or reads stay files"). `src/brand/resolver.ts`'s `BrandPaths` gains an `assetsRoot`
  field (`<brandsRoot>/<slug>/assets`), mirroring how `formatsRoot` was added for the FormatStore. The
  Brand-skeleton template (`templates/brand-skeleton/assets/.gitkeep`) ships the empty directory for
  every newly-scaffolded Brand, mirroring the existing `formats/.gitkeep`.
- **A new typed `BrandAssetStore`** (`src/brand-asset/store.ts`), joining ADR-0014's store list
  (ledger, queue, production-spec, format, asset, now brand-asset):
  - `listBrandAssets(brand, brandsRoot?)` enumerates the Brand's `assets/` directory — the set of
    Brand Assets IS the set of recognized-media files there (mirrors `listFormatSlugs`'s "the set of
    Formats is the set of files" convention). Each entry's **key** is its filename's basename with the
    extension stripped (the SAME key a Recipe's `BrandAssetMediaSlot.brandAssetKey` names, e.g.
    `"brand-logo"`); its **media kind** (`image | video | audio`) is inferred from the extension by the
    pure, exported `mediaKindForFilename`.
  - `getBrandAsset(brand, key, brandsRoot?)` looks up one Brand Asset by key. It **never throws** for a
    missing key or a missing `assets/` directory — both degrade to the same typed
    `{ found: false, key, message }` result (issue #82 AC1); a found key returns
    `{ found: true, asset }`. Only an invalid Brand **slug** still throws (the pre-existing tenancy
    boundary every other store enforces via `resolveBrand`) — a different concern from "this key isn't
    available."
  - A Brand with **no `assets/` directory at all** behaves exactly like a Brand with an empty one:
    `listBrandAssets` returns `[]` and `getBrandAsset` returns the same `found: false` shape — "no
    assets", never an error (issue #82 AC2), mirroring `listFormatSlugs`'s blanket-catch convention for
    a missing `formats/` directory.
  - **All reads go through the store** — no other module reads a Brand's `assetsRoot` directory
    directly (issue #82 AC3). Proven by a repo-wide scan test (`store.test.ts`) asserting no source
    file outside `src/brand-asset/store.ts` (and the resolver that defines the path) references
    `.assetsRoot`.
- **`CLAUDE.md`'s State section** documents the new `assets/<key>.<ext>` directory alongside the
  existing per-Brand file list, mirroring how `formats/<slug>.yaml` was documented when the FormatStore
  landed.

## Non-Goals (explicitly deferred to later slices in the map-#70 build chain)

- **Binding an actual Brand Asset into a Recipe's canvas media slot** (uploading it into the Space,
  media-type-aware) — the Producer rework, issue #88.
- **STOP-when-a-required-slot's-asset-is-missing behaviour** — this slice's store only ever *finds*
  and returns a typed not-found result; deciding to halt a production run on a missing REQUIRED asset
  is the future media-bind phase's contract (ADR-0016, ADR-0017), landing with issue #88.
- **Committing Straw Motion's real logo file** (`data/brands/straw-motion/assets/brand-logo.png`) —
  ships in a later, Operator-paired canvas session (Recipe build 5, per the issue's own text). This
  slice ships the store with test fixtures only.
- **A write path** (uploading/committing a new Brand Asset programmatically) — Brand Assets, like
  Format files, are hand-committed documents for the MVP (ADR-0014).

## Capabilities

### Added Capabilities

- `brand-asset-store`: a new typed store for a Brand's reusable media (image/video/audio), keyed by
  filename basename, media-type aware, with a never-throwing typed not-found lookup result.

### Modified Capabilities

- `brand-resolver`: `BrandPaths`/`resolveBrand` gain the `assetsRoot` path
  (`<brandsRoot>/<slug>/assets`), and the Brand-skeleton template ships an empty `assets/` directory
  for every newly-scaffolded Brand.

## Impact

- **New code:** `src/brand-asset/store.ts` (+`.test.ts`); `templates/brand-skeleton/assets/.gitkeep`.
- **Modified code:** `src/brand/resolver.ts` (+`.test.ts`) — `assetsRoot` field;
  `src/brand/scaffold-brand.test.ts` — one new assertion that scaffolding creates `assets/`; `CLAUDE.md`
  — documents the new directory.
- **Not touched:** `src/recipe/registry.ts` (its `BrandAssetMediaSlot.brandAssetKey` is unchanged — this
  slice is the store the key will eventually resolve through, not a change to the slot's own shape),
  `src/space-driver/**` (no driver/binding code is touched), `.claude/agents/producer.md` (the attended
  Producer does not yet read this store), `data/brands/**/assets/**` (no real Brand Asset file is
  committed by this slice).
- **Hermetic:** no Magnific fake is needed for this slice — no driver/Space-interaction code is touched,
  so there is nothing new to exercise through the fake boundary. The new module is pure, deterministic
  filesystem logic (a directory listing + a typed lookup), tested against temp-dir fixtures. No live
  `spaces_*`/`creations_*` call anywhere; this `developer` build was never given the Magnific MCP tools.
- **Always-rules upheld:** generate-never-publish (no publish/render code touched); ledger-as-
  source-of-truth (no ledger read/write path touched — Brand Assets are not ledger state, they are a
  Brand-scoped reusable-media store, same footing as `brand-profile.yaml`); public-metrics-only /
  relative-not-absolute / explicit-attribution are unaffected (no metrics/scoring/attribution code
  touched). The store-boundary discipline (rule 7 / ADR-0014) is the rule this slice most directly
  extends: a new kind of per-Brand state gains its own typed store rather than ad hoc file reads.
