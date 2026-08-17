---
description: Secrets, external data, and defensive parsing for OrganicGrowth
globs: *
---

# Data Handling

1. **Secrets in `.env` only.** `APIFY_API_TOKEN` lives in `.env` (git-ignored). Load it in Bash with
   `set -a; [ -f .env ] && . ./.env; set +a`. **Never print the token** or commit `.env`.
2. **Apify actors are configurable.** Read actor slugs from the Brand's own `seeds.yaml`
   (`resolveBrand(brand).seeds`, `src/brand/resolver.ts`, or `src/apify/platform.ts`'s
   `resolveApifyActor` for a wired platform), nested per platform (e.g. `apify.facebook.trends_actor`,
   `apify.facebook.post_actor`), or env overrides. Actor input/output schemas vary — read the returned
   JSON and map fields defensively.
3. **Private exports stay private.** Meta Content exports in the Brand's own `your-data/` directory
   (`resolveBrand(brand).yourData`) may contain non-public Insights; they are git-ignored. Treat them
   as the Operator's data — read, don't commit.
4. **Defensive numbers.** Coerce metric fields safely (missing → 0, note it). Never let one malformed
   record crash a Run.
5. **ISO-8601 timestamps** everywhere in the ledger (`posted_at`, `tracked_at`, `updated_at`).
6. **The ledger is canonical.** When in doubt about an Idea's state, trust the Brand's own ledger
   (`src/ledger/ledger.ts`) and keep the markdown briefs in sync with it.
