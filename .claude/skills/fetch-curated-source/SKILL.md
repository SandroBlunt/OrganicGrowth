---
name: fetch-curated-source
description: >
  Use when trend-scout (curated mode) opens a curated RSS/Atom source and the fetch may be blocked.
  Climbs a three-rung fallback ladder — WebFetch, then a browser-UA curl, then the Apify RSS actor —
  cheapest and most stable first, so a source that blocks one path is still read by the next. A
  source is only ever reported unreachable after all three rungs fail (never silently skipped).
  Decided in issue #168.
---

# Fetch a curated source (fallback ladder)

Some outlets' feeds block the plain WebFetch path (verified 2026-08-10: The Verge AI, Ars Technica
AI, The Guardian AI — see `docs/research/2026-08-10-apify-rss-fetch-fallback.md`). A feed that
can't be opened at run time silently contributes nothing, which violates "never fabricate" in
spirit: the scan looks complete but isn't. So every curated-source fetch climbs this ladder and
**reports which rung served each source**.

## The ladder — try in order, per source

1. **WebFetch** the feed URL (free, today's path). Success = the response is actual feed content
   (RSS/Atom XML or feed JSON), not an error page.
2. **Browser-UA curl** (free). The block usually targets the WebFetch client, not the feed:

   ```bash
   curl -sL --max-time 30 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" "<feed-url>"
   ```

   `-L` matters — some feeds (e.g. beehiiv) sit behind a 301.
3. **Apify RSS actor** (~$0.0005 per run). Read the actor slug from the Brand's own `seeds.yaml`
   (`resolveBrand(brand).seeds`, `src/brand/resolver.ts`) under `apify.rss.feed_actor`; call it via the Apify API with
   `APIFY_API_TOKEN` loaded per the data-handling rules (`set -a; [ -f .env ] && . ./.env; set +a`
   — never print the token). **Batch every source that reached rung 3 into ONE actor run** — the
   actor accepts a list of feed URLs and returns parsed items (title, link, ISO date, summary).

## Rules

- **Stop at the first rung that returns real feed content.** Don't escalate a working source.
- **A source that fails all three rungs is reported unreachable, by name** — never padded over,
  never invented (always-rule 8). The Run's output notes it so the Operator can react.
- **Parse dates defensively.** Sort items by date and drop items older than the Format's
  `lookback_days`; some feeds carry stray ancient placeholder entries (e.g. TLDR AI ships one
  item dated 2018).
- **No per-source configuration.** The ladder is behavior, not config — a source that starts or
  stops blocking needs no file edit. The only wiring is the actor slug in `seeds.yaml`.
