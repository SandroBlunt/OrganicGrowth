# Post becomes its own record, reversing ADR-0011's declined split

**Status:** accepted — **supersedes, in part, ADR-0011** (`0011-ledger-grain-per-recipe-assets-attribution.md`).
Operator decision recorded 2026-08-16, epic #195. Extends ADR-0019 (multi-Channel).

ADR-0011 moved production state off the Idea onto a per-Recipe **Asset**, and — as PART of that same
decision — kept `post_url`, `posted_at`, and `performance_score` as **scalar fields on the Asset**
itself, rather than giving Post its own record. That was a deliberate, considered choice at the time
("the Asset is the real unit of production, publication, and measurement"), not an oversight. It has
not aged well: ADR-0019 (2026-07-24) later gave a Brand more than one Channel and let one Asset carry a
Copy variant **per targeted Channel platform** (ADR-0025) — so an Asset can now be genuinely published
to more than one Channel. A scalar `post_url` cannot represent "posted to Facebook AND LinkedIn,
separately, each measured against its own baseline" — there is only one field to hold one URL. ADR-0011
predates ADR-0019 by nine days and could not have seen this coming.

## Decision

- **Only the field-placement part of ADR-0011 is reversed.** Everything else ADR-0011 decided — the
  per-Recipe Asset grain, the Asset's own six-stage lifecycle (`queued → in_production → produced →
  posted → tracking → scored`), `pending_gate` as a pause inside `in_production` rather than a stage of
  its own, and attribution keyed on **(Idea, Recipe)** for the Asset itself — is KEPT, unchanged, and
  carried into the SQL schema (`asset`, `idea_recipe` — `docs/adr/0029`).
- **`post` becomes its own table**: `id, asset_id, channel_id, post_url, posted_at, tracking_state,
  created_at, updated_at, schema_version`, unique on `(asset_id, channel_id)`. An Asset now yields **one
  Post per Channel it is actually published to** — CONTEXT.md's existing "one Post per Recipe" statement
  narrows to "one Post per (Recipe, Channel actually published to)"; it still yields **zero** Posts if
  never published, and at most one Post per Channel (never a silent duplicate for the same Channel).
- **Performance becomes a time series, keyed off the Post, not the Asset.** `metric_snapshot` (dated
  reactions/comments/shares/views pulls) and `performance_score` (the computed 0–1 score, referencing
  the `channel_baseline` it was computed against) both carry a `post_id` foreign key. CONTEXT.md already
  says Performance is "a moving number, not a snapshot" — the old Asset-scalar model only ever had one
  slot for it (`metrics`/`tracked_at`/`history` bolted onto the Asset, ADR-0011's own extension). This
  ADR fixes the SHAPE the time series lives in; the claiming/write logic that actually populates it is
  issue #203's job, not this one's.
- **Attribution now has two layers, both explicit (always-rule 5).** The Asset's own `(Idea, Recipe)`
  attribution is unchanged. A Post ADDS a second, explicit link: `(Asset, Channel)` — never inferred from
  which Channel platform a Copy variant happened to target, always the Channel the Operator actually
  logged the URL against.

## Why now, not at ADR-0011's time

ADR-0011 could not see multi-Channel coming — ADR-0019 (multi-Channel, one primary, per-Channel tracking
deliberately deferred) landed nine days later, on an explicit separate Operator grilling. Once a Brand
can target more than one Channel and a Recipe can compose more than one Copy variant (ADR-0025), a
scalar `post_url`/`posted_at`/`performance_score` on the Asset is no longer just a modeling
simplification — it is a genuine data-loss risk: the second Channel's post either has nowhere to be
recorded, or overwrites the first Channel's own recorded result. Splitting Post into its own record is
also exactly the epic's own stated blocker for answering "what were my top 5 Assets by Performance
Score" — a per-Asset scalar cannot distinguish "posted once, scored well" from "posted to two Channels,
one scored well and one didn't."

## Consequences

- **The file-based ledger is unaffected by this ADR alone.** `src/asset/asset.ts`'s `LedgerAssetRecord`
  keeps its `post_url`/`posted_at`/`performance_score`/`metrics`/`tracked_at`/`history` fields exactly as
  ADR-0011 left them, and `AssetStore` (`src/asset/store.ts`) is not touched by this ticket (#201). This
  ADR fixes the FUTURE SQL shape (`docs/adr/0029`); migrating the file ledger's own writers onto the new
  shape is out of this ticket's scope — tracked as a known limit in this ticket's Build Report, expected
  to land alongside issue #202's store swap.
- **`/log-post`'s signature grows a Channel argument** once a command is rebuilt against the `post`
  table (`/log-post <brand> <idea> <recipe> <channel> <url>`) — not changed by this ADR itself, which is
  schema-only.
- **`docs/adr/0011` carries a forward-pointer to this ADR** (the repo's established pattern — see how
  ADRs 0015–0018 point back at 0010/0013/0014), rather than being silently contradicted.
