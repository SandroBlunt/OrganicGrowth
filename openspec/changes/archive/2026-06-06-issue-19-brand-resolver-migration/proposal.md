## Why

OrganicGrowth's state files today live directly under `data/` (`brand-profile.yaml`, `seeds.yaml`,
`ledger.json`, `your-data/`, `ideas/`), implicitly bound to a single Brand — **MundoTip**. There is
no on-disk structure that names the Brand, no enumerable Brand list, and no way to add a second Brand
without inventing new path conventions ad hoc. The system already has a multi-Brand ambition (CONTEXT.md:
"The system manages **many Brands**; each owns its own Brand Profile, seeds, Your Data, and ledger, and
all of a Brand's state lives under its own directory"), but the code doesn't reflect it yet.

This slice introduces **Brand** as the top-level on-disk tenant. The set of Brands is literally the set
of directories under the brands root (`data/brands/`) — there is no separate registry file that could
drift out of sync. A single deep module (`src/brand/resolver.ts`) is the *only* place the path layout
is defined: given a slug it returns the Brand's ledger, brand-profile, seeds, ideas root, and Your Data
directory. Adding a new Brand is just adding a new directory scaffolded from `templates/brand-skeleton/`.

The **global Production Queue** (`data/queue.json`) stays where it is — brand-agnostic, shared across
all Brands, because the Space is the shared bottleneck (ADR-0004; new ADR-0006). The resolver exposes
this path as a constant, not a per-brand derivation.

The existing weekly pipeline keeps working end-to-end: the modules that previously used hardcoded
`data/ledger.json`, `data/brand-profile.yaml`, and `data/seeds.yaml` now default to the `mundotip`
Brand's paths via the resolver, so the pipeline's behaviour is unchanged. Later slices will make the
Brand explicit on every command; this slice just lays the foundation.

## What Changes

- **New ADR-0006** (`docs/adr/0006-brands-are-directories-production-queue-is-global.md`) — captures
  the "brands are directories, not a registry; production queue is global and brand-agnostic" decision
  consistent with ADR-0004 and the CONTEXT.md Brand definition.

- **New deep module `src/brand/resolver.ts`** — the single home for the Brand path layout convention:
  - `slugify(name)` → filesystem-safe slug.
  - `resolveBrand(slug, brandsRoot?)` → the five per-Brand paths (ledger, brand-profile, seeds, ideas
    root, your-data dir) plus the constant global-queue path.
  - `brandExists(slug, brandsRoot?)` → boolean existence check.
  - `listBrands(brandsRoot?)` → sorted array of Brand slugs (directory listing; skips dotfiles and
    non-directories; a malformed or missing directory never crashes the call).
  - `DEFAULT_BRANDS_ROOT` (`data/brands`) and `DEFAULT_QUEUE_PATH` re-exported as a constant — the
    global Production Queue path is **never derived from a slug**.

- **MundoTip state migrated** under `data/brands/mundotip/`:
  - `data/brand-profile.yaml` → `data/brands/mundotip/brand-profile.yaml`
  - `data/seeds.yaml` → `data/brands/mundotip/seeds.yaml`
  - `data/ledger.json` → `data/brands/mundotip/ledger.json`
  - `data/your-data/` → `data/brands/mundotip/your-data/`
  - `ideas/2026-W22/` → `data/brands/mundotip/ideas/2026-W22/`
  - (All moved with `git mv` to preserve history; `data/queue.json` stays at the root — global queue.)

- **Default path constants updated** in existing modules so the pipeline defaults to `mundotip`:
  - `src/ledger/ledger.ts` — `DEFAULT_LEDGER_PATH` updated to `data/brands/mundotip/ledger.json`.
  - `src/production-spec/brand-profile.ts` — `DEFAULT_BRAND_PROFILE_PATH` updated to
    `data/brands/mundotip/brand-profile.yaml`.
  - (The `src/production-queue/store.ts` `DEFAULT_QUEUE_PATH` stays `data/queue.json` — global queue,
    not brand-scoped. The resolver re-exports this same constant unchanged.)

- **Brand skeleton template** at `templates/brand-skeleton/` — the canonical empty shape a new Brand
  starts from: `brand-profile.yaml` (minimal stub), `seeds.yaml` (empty seeds), `ledger.json` (empty),
  `your-data/.gitkeep`, and `ideas/.gitkeep`.

- **Tests** (`src/brand/resolver.test.ts`) — comprehensive unit tests using temp-dir fixtures; no live
  Magnific Space, no Apify, no network (this slice is pure filesystem + path logic).

## Capabilities

### Added Capabilities

- `brand-resolver`: The single deep module that owns the on-disk layout for a Brand's state.
  Given a slug it maps to per-Brand paths; it exposes the global Production Queue path as an
  immutable constant; it lists all Brands by enumerating the `data/brands/` directory; it
  validates slugs and never crashes on a malformed Brand directory (defensive parsing throughout).

## Impact

- **New code:** `src/brand/resolver.ts` + `src/brand/resolver.test.ts`.
- **New ADR:** `docs/adr/0006-brands-are-directories-production-queue-is-global.md`.
- **New template:** `templates/brand-skeleton/` (5 files).
- **Files moved** (via `git mv`): `data/brand-profile.yaml`, `data/seeds.yaml`, `data/ledger.json`,
  `data/your-data/`, `ideas/2026-W22/` → all under `data/brands/mundotip/`. `data/queue.json` NOT moved.
- **Modified:** `src/ledger/ledger.ts` (`DEFAULT_LEDGER_PATH`),
  `src/production-spec/brand-profile.ts` (`DEFAULT_BRAND_PROFILE_PATH`).
- **Existing tests:** All existing tests use temp-file fixtures and will remain green. The only
  existing test that references `DEFAULT_LEDGER_PATH` or `DEFAULT_BRAND_PROFILE_PATH` does so
  through the injected `path` argument — not the constant itself — so no test breaks.
- **No Magnific fake needed:** this slice is pure filesystem + path logic; no Space is touched.
- **Always-rules upheld:** ledger-as-source-of-truth (the migrated ledger is byte-for-byte
  identical; `DEFAULT_LEDGER_PATH` is updated so the existing commands still find it);
  generate-never-publish and public-metrics-only are unaffected (no production or metrics code
  changes); explicit-attribution and relative-not-absolute are unaffected.
