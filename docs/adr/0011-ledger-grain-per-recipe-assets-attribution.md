# Ledger grain: per-Recipe Assets, per-Asset lifecycle, per-(Idea, Recipe) attribution

**Status:** accepted — **amends ADR-0006** (ledger/queue layout). Captured in the 2026-07 grilling.

Today production state is flat scalars on the one Idea record (`status`, `cast`, `character`,
`asset_url`, `post_url`, `performance_score`). With one Idea → many Assets (ADR-0009), a scalar status
can't say "Reel in production while carousel already posted", and a single `asset_url`/`post_url` is
overwritten by the second Recipe.

## Decision

- **Production state moves off the Idea onto a per-Recipe Asset.** Each Idea carries a list of Assets,
  one per chosen Recipe: `{ recipe, status, spec_path, copy, asset_url, produced_at, post_url,
  posted_at, performance_score, pending_gate }`.
- **The production stages belong to the Asset** — not the Recipe (a fixed plan with no state), not the
  Idea. An Asset moves through **`queued → in production → produced → posted → tracking → scored`**. A
  human pick (e.g. the character pick) is a **pause inside "in production"**, named by `pending_gate` —
  **not** a stage. `casting` is retired as a status.
- **The Idea keeps only `suggested / accepted / rejected`** plus a **derived roll-up** computed from its
  Assets (the way `resolvePhase` already folds many Ideas into one Brand phase).
- **Attribution is keyed on (Idea, Recipe).** `/log-post` becomes `/log-post <brand> <idea> <recipe>
  <url>`, writing `post_url`/`posted_at` onto **that** Asset. Attribution stays explicit, never inferred
  (rule 5).
- **Fit vs Performance.** Fit Score stays one **per-Idea** prediction for v1; the gap is defined as
  Fit(Idea) vs an aggregate over that Idea's Posts (e.g. the **best** Post), recorded as a 1:N
  relationship so a per-Post result is never presented as if it judged the per-Idea prediction. Keep
  **one Channel baseline** (one account = one Post stream); the strategist's relevance term narrows to
  same-Format history once a Format has enough scored Ideas, falling back to all-Format while thin.
- **The spec file path gains a Recipe segment** so two Recipes of one Idea don't overwrite each other's
  Spec.
- **Migration (one-time, idempotent).** Converge the two live ledgers (mundotip / straw-motion) onto one
  shape, relabel the live media-sense `format:reel` to a distinct media/recipe field (never
  reinterpreted as the editorial **Format**), and add an empty `assets:[]`. The reader stays tolerant so
  un-migrated records still load.

## Why

The Asset is the real unit of production, publication, and measurement once an Idea fans out. Moving the
lifecycle onto it is the load-bearing schema change — and it is nearly **free now** (no live ledger has
a populated Asset), expensive the moment the first real Asset lands.

## Consequences

- `IdeaStatus`, `LedgerAsset`, the phase-resolver (`PendingGate`), the queue key/lock, and the spec path
  all gain a Recipe dimension.
- The queue's per-Idea idempotency guard and single lock re-key to `(brand, idea_id, recipe)` so a
  second Recipe's job is not dropped as a duplicate.
