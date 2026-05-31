---
description: Secrets, external data, and defensive parsing for Subtext
globs: *
---

# Data Handling

1. **Secrets in `.env` only.** `APIFY_API_TOKEN` lives in `.env` (git-ignored). Load it in Bash with
   `set -a; [ -f .env ] && . ./.env; set +a`. **Never print the token** or commit `.env`.
2. **Apify actors are configurable.** Read actor slugs from `data/seeds.yaml` (`apify.*`) or env
   overrides. Actor input/output schemas vary — read the returned JSON and map fields defensively.
3. **Private exports stay private.** Meta Content exports in `data/your-data/` may contain non-public
   Insights; they are git-ignored. Treat them as the Operator's data — read, don't commit.
4. **Defensive numbers.** Coerce metric fields safely (missing → 0, note it). Never let one malformed
   record crash a Run.
5. **ISO-8601 timestamps** everywhere in the ledger (`posted_at`, `tracked_at`, `updated_at`).
6. **The ledger is canonical.** When in doubt about an Idea's state, trust `data/ledger.json` and keep
   the markdown briefs in sync with it.
