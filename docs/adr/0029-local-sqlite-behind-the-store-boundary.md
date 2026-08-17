# Canonical state moves to local SQLite, behind the SAME store boundary ADR-0014 already asked for

**Status:** accepted — **supersedes ADR-0014's "keep JSON/YAML files behind the boundary for the MVP"
choice**; KEEPS and FULFILS ADR-0014's store-boundary + relational-modeling + stable-id principles.
Extends ADR-0006 (Brands are directories; one global queue). Operator decision recorded 2026-08-16,
epic #195.

ADR-0014 named this exact move as the eventual productization step and deliberately DEFERRED it:
"Productizing later = one new adapter (embedded SQLite → Postgres/Supabase) behind the same stores...
Embedded SQLite *now* was considered and deferred — inspectable, git-tracked state is worth more to a
solo attended Operator than transactions today." That trade-off has now inverted. Verified at epic
triage: two concurrent sessions on this folder (the Operator's own documented working style) silently
destroy each other's work, because every ledger write is read-whole-file → mutate-in-memory →
write-whole-file; the `lock` field meant to guard this lives *inside* the file being raced on, and has
separately gone missing from `data/queue.json` entirely; the ledgers hold 191 absolute
`/Users/CaxtonTaylor/...` paths welding them to one laptop; no file carries a version stamp,
`updated_at`, or an etag, and none can be backfilled onto; and three genuinely relational questions the
Operator needs answered (top Assets by Performance Score and what their specs had in common; every Idea
by hook type; how well Fit Score predicted Performance) are not answerable by eyeballing JSON/markdown
spread across two Brands, three Idea shapes, three ID schemes, and four folder layouts.

## Decision

- **One SQLite database file lives under `data/`**, opened **in-process** by Node via the **built-in
  `node:sqlite` module** — never a hosted service, never Postgres, never multi-tenant. No HTTP API
  server, no container, no daemon: the database is opened and closed within the same Node process that
  today reads/writes the JSON files. `node:sqlite` ships inside Node itself (verified present and usable
  without any flag on Node `v22.23.0`, the version this repo's `package.json` `engines.node: ">=22"`
  already requires) — so ADR-0014's "no new infra" concern is respected, not abandoned.
- **ADR-0014's store-boundary principle is KEPT and FULFILLED, not abandoned.** Every entity still sits
  behind a typed store (`IdeaStore`, `AssetStore`, `PostStore`, `QueueStore`, `FormatStore`, …) with a
  stable surrogate `id` and explicit foreign references — exactly what ADR-0014 asked for. What changes
  is only the ONE option every store already takes: `{ ledgerPath }` becomes `{ db }`. Store names,
  operation names, and return shapes are UNCHANGED (issue #202, not this ticket).
- **Documents a human authors or reads directly stay files** — Brand Profile YAML, Format YAML, the
  markdown Briefs, the Baseline Prompt documents, **and the Mention Handle Registry**
  (`data/mention-handles.yaml`, `src/mention-handle/store.ts`) — a small, hand-maintained, global
  mapping of company/product names to platform handles that the Operator adds and edits directly and
  changes rarely, matching this carve-out's shape exactly. This is recorded explicitly, not left
  implicit, because issue #202 named Mention Handle among the stores moving to SQL while #201's own
  schema AC never did — issue #222 (2026-08-17) correctly declined to invent a `mention_handle` table
  outside its own spec rather than silently dropping the store from its list, and issue #226
  (2026-08-17) is the Operator decision settling it here: it stays a file. **This carve-out is not
  permanent** — the one thing that would reopen it is issue #210's read-only Library: if handles need to
  appear there, `mention_handle` becomes a legitimate table (an additive migration, following
  `MIGRATION_2`'s own pattern). Until then, nothing else in the schema foreign-keys into it, so there is
  no structural need for it to be relational. This ADR governs the **relational/canonical state**
  ADR-0014 already scoped to the store boundary (the ledger, the queue), never every file under `data/`.
- **Every table carries a stable `id`, `created_at`, `updated_at`, and a `schema_version`** — the version
  stamp the file era never had and could never be backfilled onto.
- **Media stays on local disk**, never inside the database: the database holds a **root-relative storage
  key** plus `mime`, `bytes`, `checksum`; the media root is configuration. An absolute path is rejected
  **at the store boundary**, not merely discouraged (`src/db/storage-key.ts`'s
  `assertRootRelativeStorageKey`, wired into every write that carries a `storage_key` —
  `src/db/media-ref.ts`) — this is how the 191 machine-welded absolute paths are prevented from
  recurring in the new store.
- **A migration runner** (`src/db/migrate.ts`) creates the schema from empty and can upgrade it,
  recording which version a given database file is at (`schema_migrations`).
- **The schema is shaped so `account`, `user`, and `connection` can be added later** (a future
  migration) without reshaping `brand` — a nullable `account_id` column is a legal, non-rebuilding
  `ALTER TABLE` addition in SQLite. They are **not built now**: this stays a single-Operator, local,
  no-auth installation, carrying forward ADR-0014's "no multi-tenancy" spirit.

## Why local SQLite over the alternatives ADR-0014 already named

- **Hosted Postgres/Supabase** adds a network dependency and a credential to leak — exactly the class of
  one-way-door mistake phase 00 of epic #195 exists to close (a Zoho MCP credential was committed and
  had to be rotated) — plus hosting cost, for a single attended Operator on one laptop. None of that buys
  anything ADR-0014 did not already price out and decline.
- **A native SQLite npm package** (e.g. `better-sqlite3`) would add a compiled native module and its own
  per-machine/per-CI build step. Node 22's built-in `node:sqlite` avoids that cost entirely — still
  flagged "experimental" by Node itself, but sufficient for this LOCAL, single-process, no-concurrent-
  external-writer use, and it needs no `npm install` of a native dependency anywhere.
- **Staying on files** is not being declared wrong in hindsight — ADR-0014 was right that the boundary,
  not the storage technology, was the real foundation, and that boundary survives this move unchanged.
  What has changed is that the productization trigger ADR-0014 itself named — relational queries,
  concurrent-write safety, a real transaction — has now arrived, so ADR-0014's OWN deferred trigger
  fires.

## Consequences

- **The four existing integration ports are UNCHANGED**: `SpaceMcpPort`, `PerformanceScrapePort`,
  `MediaHostPort`, and the Zoho MCP schedule port. This ADR only touches the persistence seam.
- **Existing stores' tests swap their temp-`ledgerPath` fixture for a temp-`db` fixture** (issue #202),
  keeping the SAME store operations and return shapes — not built by this ticket.
- **Rule 7** (`.claude/rules/always/organicgrowth-rules.md`, "State lives in files, behind a store
  boundary") gains a citation to this ADR, noting the SQLite foundation now exists under `data/` but is
  not yet the backing of any store — it does not (yet) claim the swap itself has happened, since that
  would be false until issue #202 lands.
- **This ticket (#201) lands the database, its schema, and its migration runner only.** It does NOT swap
  any existing store's backing (issue #202) and does NOT run the one-shot importer against the real
  ~813 MB `data/` corpus (issue #204) — both are later, blocked-on-this-ticket slices.
- **`docs/adr/0014` carries a forward-pointer to this ADR** (the repo's established pattern — see how
  ADRs 0015–0018 point back at 0010/0013/0014), rather than being silently contradicted.
