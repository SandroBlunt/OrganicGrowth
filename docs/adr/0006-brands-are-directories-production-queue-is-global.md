# Brands are directories (not a registry); the Production Queue is global and brand-agnostic

**Status:** accepted — extends ADR-0004 (the serialized background Production Queue); aligns with
the Brand definition in CONTEXT.md.

OrganicGrowth manages many Brands. Each Brand owns its own Brand Profile, seeds, Your Data, ledger,
and ideas. We need a way to enumerate all Brands and to map a Brand slug to its on-disk paths — without
introducing a separate registry file that can drift out of sync with the actual on-disk state.

Separately, production (the Magnific Space) is **shared** across Brands: there is one Space, one
Production Queue, one single-concurrency lock. Each job carries a Brand tag so the Producer writes the
Cast/Asset back to the right Brand's ledger — but the queue itself has no Brand dimension.

**Decision**

- **Brands are directories, not a registry.** All state for a Brand lives under
  `data/brands/<slug>/`. The set of Brands IS the set of directories under `data/brands/` — there is
  no separate registry file. Adding a Brand is creating a new directory (scaffolded from
  `templates/brand-skeleton/`). Removing a Brand is removing the directory. There is nothing to drift.
- **The resolver is the single source of the path layout.** `src/brand/resolver.ts` is the **only**
  place the path convention is defined. Given a slug it returns the Brand's ledger path, brand-profile
  path, seeds path, ideas root, and Your Data directory. No other module invents Brand paths ad hoc.
- **The global Production Queue path is a constant, not a per-brand derivation.** `data/queue.json`
  is the single Production Queue for all Brands. The resolver exposes this as `DEFAULT_QUEUE_PATH` (the
  same constant `src/production-queue/store.ts` exports). It is NEVER derived from a Brand slug.
- **Slugs are filesystem-safe.** A Brand's on-disk slug is produced by `slugify()` in the resolver:
  lowercase, alphanumeric + hyphens only, max 64 chars. Canonical; no two Brands share a slug.
- **Defensive enumeration.** `listBrands()` reads `data/brands/` and returns the sorted Brand slug
  list. Dotfiles, files, and unreadable entries are silently skipped. A missing `data/brands/` returns
  `[]`; it never crashes.
- **Default Brand is `mundotip` for now.** Until later slices make the Brand explicit on every
  command, the modules that consume Brand-scoped state (ledger, brand-profile) default their path
  constants to the `mundotip` Brand. This is a transitional default, not a long-term singleton.

**Why**

- A file-based registry (e.g. `data/brands.yaml` listing Brand slugs) would need updating every time
  a Brand is added or removed — a second source of truth that can drift from the actual directories.
  Using the directory listing as the source of truth is simpler, more robust, and consistent with how
  OrganicGrowth uses plain files for all state.
- Keeping the Production Queue global matches the reality that the Magnific Space is the shared
  bottleneck. A per-Brand queue would still need a cross-Brand concurrency lock (so the Space is not
  double-booked), making it more complex for no benefit. ADR-0004's single-lock model extends cleanly.
- Putting the path layout in one module means any future path changes are one-file edits — callers
  just call `resolveBrand(slug)`.

**Consequences**

- `data/brands/<slug>/` is the Brand directory structure. Per-Brand state: `ledger.json`,
  `brand-profile.yaml`, `seeds.yaml`, `your-data/`, `ideas/`.
- `data/queue.json` remains at the root — global, brand-agnostic (do not move it).
- `src/brand/resolver.ts` owns the layout. Existing modules (`src/ledger/ledger.ts`,
  `src/production-spec/brand-profile.ts`) update their `DEFAULT_*_PATH` constants to point to the
  `mundotip` Brand's paths under `data/brands/mundotip/`.
- `templates/brand-skeleton/` holds the canonical empty Brand shape for bootstrapping.
- Later slices will add a `--brand <slug>` flag (or equivalent) to make the Brand explicit on
  every command, removing the transitional `mundotip` default.
