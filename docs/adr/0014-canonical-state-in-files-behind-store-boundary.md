# Canonical state stays in files, behind a store boundary, modelled relationally

**Status:** accepted — extends ADR-0006; revises the spirit of rule 7 ("state lives in files"). Captured
in the 2026-07 grilling.

> **Extended by ADR-0016 (map #70):** the store list gains a **`BrandAssetStore`** for per-Brand reusable
> media (image/video/audio) under `data/brands/<slug>/assets/`.

All state is plain files today (ADR-0006). Multi-format makes the data **relational** (Idea → many
Assets → many Posts; Formats; Performance). The question raised was whether to move to a database now
for a productizable foundation, while keeping an MVP scope.

## Decision

- **The solid foundation is the boundary + the relational model, not the storage technology.** Put all
  canonical state behind a **typed store layer** (`IdeaStore`, `AssetStore`, `PostStore`, `QueueStore`,
  `FormatStore`) — no stray file I/O elsewhere — and give every entity a **stable id** with explicit
  references (Asset → its Idea + Recipe; Post → its Asset), so the JSON maps one-to-one onto future DB
  tables.
- **Keep JSON/YAML files behind that boundary for the MVP.** State stays inspectable, git-diffable, and
  Operator-editable; no new infra, and no migration beyond the multi-format reshape.
- **Documents the human authors or reads stay files** (brand-profile, the Format files, the markdown
  Briefs, media links); only the **relational state** (ledger, queue) sits behind the store.
- **Productizing later = one new adapter** (embedded SQLite → Postgres/Supabase) behind the same stores;
  the domain logic does not move. Embedded SQLite *now* was considered and deferred — inspectable,
  git-tracked state is worth more to a solo attended Operator than transactions today.

## Why

It de-risks the now-relational data without over-building, and turns "productize" into a contained
adapter swap rather than a rewrite. The relational modelling is done in the same pass that reshapes the
ledger for multi-format (ADR-0011), so it costs one migration, not two.

## Consequences

- The existing store modules (ledger, queue) are formalised behind interfaces; every new entity carries
  an id + foreign keys from day one.
- Rule 7 ("state lives in files") is reworded: state lives in files **behind a store boundary** for the
  MVP; the boundary — not the file format — is the productization contract.
