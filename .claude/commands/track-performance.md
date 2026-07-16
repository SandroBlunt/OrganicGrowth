---
name: track-performance
description: "Pull public metrics for a named Brand's logged Posts via Apify, compute Performance Scores relative to the Channel baseline, and update the feedback loop."
---

# /track-performance

Usage: `/track-performance <brand> [<idea-id>]`

Measure how a Brand's logged Posts performed and feed it back. `<brand>` is required — omitting it
is an error, never a silent default. Optional: an `<idea-id>` (default = every Asset, across every
chosen Recipe, for this Brand's Ideas with status `posted` or `tracking` — ADR-0009/0011). Re-run
anytime — Performance is a moving number until a post matures.

**Per-Asset, per-Recipe (issue #56).** Production state — and now Post/Performance state — lives on
each Idea's per-Recipe **Asset** (`data/brands/<slug>/ledger.json`, `Idea.assets[]`), not on a flat
per-Idea scalar. One Idea can carry SEVERAL posted Assets (one per chosen Recipe) at once, each with
its own `post_url`/`performance_score`/`status` — tracking always updates the ONE Asset a metrics pull
is for, keyed `(Idea, Recipe)`, never inferred and never collapsed onto the other Recipe's Asset.

**The `posted → tracking → scored` transition.** A freshly logged Post is `posted` (per Asset). The
first (and every early) tracking pull sets that Asset to `tracking` — measured, but the numbers are
still climbing. Once the Post is **7+ days old** (by the Asset's own `posted_at`), its metrics have
effectively settled, so the pull sets that Asset to `scored` — final for the feedback loop. A `scored`
Asset is not re-selected by default (pass its Idea's `<idea-id>` explicitly to force a re-pull of every
one of that Idea's Assets).

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's paths via the resolver. State the
   active Brand: "Tracking performance for Brand: `<brand>`."
2. **Select** Brand `<brand>`'s ledger Ideas (from `data/brands/<slug>/ledger.json`) and, for each,
   every Asset with a `post_url` and status `posted` or `tracking` — one selection PER (Idea, Recipe),
   never per Idea.
3. **Invoke performance-tracker with Brand `<brand>`.** It scrapes each selected Asset's post metrics
   via Apify (`apify.facebook.post_actor` — actor slugs are nested per platform in `seeds.yaml`, never
   flat `apify.post_actor`), computes the **Performance Score** (shares 0.35 · comments 0.25 ·
   reactions 0.20 · views 0.20, normalised to the ONE Channel `ledger.baseline` — never a per-Recipe
   baseline, always-rules #4), and updates that ONE Asset (metrics, `performance_score`, `status` per
   the maturity rule above — `tracking` while the Post is < 7 days old, `scored` once it is 7+ days
   old — `tracked_at`, `history`) via `AssetStore.writeAsset` in `data/brands/<slug>/ledger.json`. A
   sibling Asset for a DIFFERENT Recipe of the same Idea is left untouched by this write.
4. **Refresh the baseline:** recompute the ONE `ledger.baseline` for Brand `<brand>` (rolling median of
   recent scored posts, across every Recipe's Assets) and stamp `updated_at`. There is exactly one
   Channel baseline per Brand — never one per Recipe.
5. **Optional enrichment:** if a Meta Content export is present in `data/brands/<slug>/your-data/`,
   fold in Saves / Net-follows / watch-through by matching on Permalink.
6. **Report:** a table (Brand: `<brand>`) of Idea · Recipe · Post · Performance Score · headline
   metrics · vs baseline; call out winners and misses; note how the baseline shifted (this is what
   sharpens next week's ideas for Brand `<brand>`). Also note the Idea's Fit Score as a SEPARATE,
   explicit 1:N comparison against its Assets' best Performance Score — never a 1:1 judgement of one
   specific Post (`/report <brand>` shows this breakdown in full).

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`, and land on the ONE Asset the
  metrics pull is actually for — sibling Assets of the same Idea (a different chosen Recipe) are
  untouched.
- **Public metrics only** via Apify (see `docs/adr/0001`). No Saves/follows/watch-through unless a
  Meta export is supplied.
- **Relative, not absolute** — always score vs the Brand's own SINGLE Channel baseline; never a
  per-Recipe baseline.
- **Never fabricate.** Report failed scrapes and missing fields honestly.
- Only score Assets with a logged `post_url`.
