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

**Code-backed (issue #84), with a REAL live Apify client (issue #200).** This command has a tested,
deterministic implementation behind it — `src/commands/track-performance.ts` (the orchestration shell)
plus `src/performance/selection.ts` / `score.ts` / `maturity.ts` / `metrics.ts` (pure deep modules) and
`src/apify/live/client.ts` (the live Apify adapter, implementing `PerformanceScrapePort`). Its full test
suite (`src/commands/track-performance.test.ts`, the `src/performance/*.test.ts` files, and
`src/apify/live/*.test.ts`) drives every scrape through a FAKE `PerformanceScrapePort` — this is never live Apify, and spends no credits (hermetic build); `src/apify/live/client.test.ts` proves the live
client's OWN request construction against an injected fake `fetchImpl`, also never a real network call.
At runtime, `npm run track-performance <brand>` uses the live client by default: it resolves
`APIFY_API_TOKEN` from `.env`/the shell (`src/apify/live/token.ts`) and sends it ONLY in an
`Authorization: Bearer <token>` header — NEVER a URL query string, so it can never reach shell history
or a proxy/access log that records request URLs (`src/apify/live/request.ts`). This retires the
performance-tracker agent's own hand-driven `curl` calls (which put the token in the URL) as the
sanctioned way to pull real metrics — running this command for real is now the sanctioned way.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's paths via the resolver. State the
   active Brand: "Tracking performance for Brand: `<brand>`."
2. **Run** `npm run track-performance <brand> [idea-id]` (or call `trackPerformanceCommand()` in
   `src/commands/track-performance.ts`). It:
   - **Selects** Brand `<brand>`'s ledger Ideas (from `data/brands/<slug>/ledger.json`) and, for each,
     every Asset with a `post_url` and status `posted` or `tracking` — one selection PER (Idea, Recipe),
     never per Idea (`src/performance/selection.ts`). Passing `<idea-id>` FORCES a re-pull of every one
     of that Idea's Assets, including an already-`scored` one.
   - For each selected Asset, detects its platform from its OWN `post_url` (never the Brand's Channel
     platform — `src/apify/platform.ts`), resolves that platform's `post_actor` from `seeds.yaml` (actor
     slugs are nested per platform, never flat `apify.post_actor`), and scrapes it via Apify. Maps the
     raw item defensively (`src/apify/normalize-metrics.ts`) — Facebook: `likes`→reactions,
     `comments`→comments, `shares`→shares, `viewsCount`→views; Instagram/YouTube as documented in
     `.claude/agents/performance-tracker.md`.
   - Computes the **Performance Score** (shares 0.35 · comments 0.25 · reactions 0.20 · views 0.20,
     normalised to the ONE Channel `ledger.baseline` — never a per-Recipe baseline, always-rules #4;
     `src/performance/score.ts`).
   - Updates that ONE Asset (`metrics`, `performance_score`, `status` per the maturity rule above —
     `tracking` while the Post is < 7 days old, `scored` once it is 7+ days old, decided from THAT
     Asset's OWN `posted_at` — `src/performance/maturity.ts` — `tracked_at`, `history`) via
     `AssetStore.writeAsset` in `data/brands/<slug>/ledger.json`. A sibling Asset for a DIFFERENT Recipe
     of the same Idea is left untouched by this write.
   - Also refreshes that SAME Asset's `post.json` (in its `idea-NN.<recipe>.output/` bundle — issue
     #112) from the ledger via `src/asset/output-bundle.ts`'s `refreshPostJson` — a GENERATED view,
     never a second store; a skipped Asset's `post.json` (if any) is left untouched.
   - **Never fabricates:** an Asset whose platform/actor isn't configured, whose scrape returns nothing
     or errors, or whose `posted_at` is missing/unparseable is SKIPPED and reported — nothing is written
     for it.
3. **Refresh the baseline:** recompute the ONE `ledger.baseline` for Brand `<brand>` (rolling median of
   recent scored posts' `metrics`, across every Recipe's Assets — falling back to whatever has been
   measured at all before anything has matured) and stamp `updated_at`. There is exactly one Channel
   baseline per Brand — never one per Recipe.
4. **Optional enrichment:** if a Meta Content export is present in `data/brands/<slug>/your-data/`,
   fold in Saves / Net-follows / watch-through by matching on Permalink.
5. **Report:** a table (Brand: `<brand>`) of Idea · Recipe · Post · Performance Score · headline
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
- **The Apify token is sent in a header, never a URL query string** (issue #200) — see
  `src/apify/live/request.ts`.
- Only score Assets with a logged `post_url`.
