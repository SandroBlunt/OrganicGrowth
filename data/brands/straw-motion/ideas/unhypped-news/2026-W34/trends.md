# Trends — straw-motion / unhypped-news / 2026-W34 (curated sources)

**Mode:** curated (per `data/brands/straw-motion/formats/unhypped-news.yaml`, `sources.mode: curated`)
**Lookback:** 7 days (2026-08-13 to 2026-08-20)
**Sources configured:** https://ai-weekly.ai/, https://newsletter.evolvingai.io/

## Result: NO TRENDS PRODUCED — both curated sources unreachable

Both of this Format's curated sources were unreachable this Run, after climbing the full
three-rung fallback ladder (`.claude/skills/fetch-curated-source/SKILL.md`) for each:

### https://ai-weekly.ai/
1. **WebFetch** — failed. The outbound network proxy blocked the domain outright
   (`EGRESS_BLOCKED: Access to ai-weekly.ai is blocked by the network egress proxy`), not a
   site-side error.
2. **Browser-UA curl** — failed. Verbose curl showed the block happens at the proxy's CONNECT
   tunnel step itself (`HTTP/1.1 403 Forbidden` on `CONNECT ai-weekly.ai:443`), before any
   request reaches the site — so a different User-Agent cannot route around it.
3. **Apify RSS actor** (`shahidirfan/rss-xml-scraper`, per `seeds.yaml` `apify.rss.feed_actor`) —
   not attempted for real: no `APIFY_API_TOKEN` is available. Only `.env.example` exists in the
   repo root; there is no `.env` file to load, so this rung has no credential to run with.

### https://newsletter.evolvingai.io/
Same three-rung result as above: WebFetch egress-blocked, browser-UA curl blocked at the same
proxy CONNECT-tunnel step (403), and the Apify RSS rung unusable for lack of an `APIFY_API_TOKEN`.

## Why no Trends were invented

Per this agent's guardrails ("Never fabricate... if a curated source is unreachable, say so and
stop") and the fetch-curated-source skill's rule ("A source that fails all three rungs is
reported unreachable, by name — never padded over, never invented"), this Run produces **zero**
Trends rather than reconstructing or guessing at story content from memory or from another
Format's/Run's sources. `trends.json` is a genuinely empty array (`[]`) — not a partial or
best-effort list.

## What would unblock this Run

- Add an allow-rule for `ai-weekly.ai` and `newsletter.evolvingai.io` to the network egress
  proxy (both are fully public, no-login newsletter archives — the block is infrastructural,
  not a site policy), **or**
- Provide a real `APIFY_API_TOKEN` in `.env` (copy `.env.example` → `.env` and fill it in) so
  rung 3 (the Apify RSS actor `shahidirfan/rss-xml-scraper`) can fetch these sources' feeds
  instead.

Re-run `/run-trends straw-motion unhypped-news 2026-W34` once either fix is in place.
