# Research: Apify actor as the fetch fallback for blocked RSS feeds (issue #168)

**Date:** 2026-08-10 · **Issue:** [#168](https://github.com/SandroBlunt/OrganicGrowth/issues/168)
**Question:** trend-scout's WebFetch tool is blocked by four outlets' AI-section RSS feeds (The Verge,
Ars Technica, The Guardian, ZDNet). Can an Apify actor fetch and parse those feeds instead, what does
it cost, and how would a per-source fetch strategy fit the existing config?

**Method:** every claim below was checked against the source that owns it — Apify's public store API
(`api.apify.com/v2/store`, `api.apify.com/v2/acts/...`), the actors' store pages, the outlets' own
feed URLs (fetched live with curl), and two live Apify runs against The Verge's AI feed. Source URL
cited per claim. Total live-test spend: **$0.0412**.

---

## TL;DR

- **Best candidate: `shahidirfan/rss-xml-scraper`** — a free actor (platform compute only,
  **$0.0005 measured per run**), takes multiple feed URLs, returns clean per-item
  title/link/ISO-date/summary, parsed The Verge's Atom feed correctly in a live test, and has
  custom user-agent + Apify Proxy options (exactly what a "blocked feed" fallback wants).
- **Runner-up: `automation-lab/rss-feed-reader`** — the most reliable record on paper (811/811 runs
  succeeded in 30 days) with the cleanest documented schema, but the live test found it **mangles
  Atom feeds**: `title`/`description` come back as the literal string `"[object Object]"`. The Verge's
  feed is Atom, so this bug hits one of our four targets. ~$0.04/run (pay-per-event).
- `apify/website-content-crawler` is the **wrong tool** — it crawls HTML pages into text/Markdown and
  does not parse feed XML into items.
- Three of the four feed URLs are confirmed good. **ZDNet's AI topic feed is functionally broken on
  ZDNet's side**: it serves the identical generic "Latest news" item set as every other ZDNet topic
  feed, with no category tags to filter on. Needs an Operator decision (keyword-filter or drop).
- **Honest caveat:** all four feeds returned HTTP 200 to plain `curl` with a browser user-agent from
  this machine. The block is specific to the WebFetch tool (its cloud IPs / fetch fingerprint), and
  trend-scout already has Bash. A `curl`-in-Bash fallback may be even simpler than Apify — noted as an
  alternative, not evaluated further here since the ticket asked about the Apify path.

---

## 1. Actor candidates

Surveyed via the Apify public store API (2026-08-10:
`https://api.apify.com/v2/store?search=rss%20feed`) and each actor's store page.

| Actor slug | Pricing | Users (total / 30d) | Last modified | 30-day run record | Verdict |
|---|---|---|---|---|---|
| **`shahidirfan/rss-xml-scraper`** | **Free** actor — pay platform compute only (measured $0.0005/run) | 109 / 11 | 2026-05-14 | 118 ok, 7 timed-out, 3 failed (~92%); last run 2026-08-10; 5.0★ (5 reviews) | **Best** — verified live, correct Atom parsing, proxy + UA options |
| **`automation-lab/rss-feed-reader`** | Pay-per-event: **$0.035/run start + $0.00115/item** (free tier; $0.001 on Bronze, cheaper above) | 127 / 35 | 2026-07-11 | 811 ok, 0 failed (100%); last run 2026-08-10 | Runner-up — cleanest schema, but **Atom title bug found live** (below) |
| `jupri/rss-xml-scraper` | Free actor — pay compute only | 935 / 38 | **2025-08-20 (~1 yr stale)** | 100% succeeded; 4.31★ | Usable but unmaintained for a year; looser output schema |
| `eloquent_mountain/rss-feed-aggregator` | **Rental**: $1.00/month + usage | 71 / 2 | n/a | 100% succeeded | Rental overhead for a 4-feed weekly job; tiny user base |
| `ef12/rss-scraper` | Pay-per-event: first 10 items free, then $0.01/item | 4 / 2 | n/a | 96.7% | One feed per run, 4 users total — skip |
| `apify/website-content-crawler` | Pay-per-usage (~$0.2/1k pages HTTP, $0.5–5/1k browser) | 146,127 / 9,093 | n/a | 4.51★ | **Wrong tool**: crawls HTML → text/Markdown for RAG; does not parse RSS/Atom XML into items |
| `apify/cheerio-scraper` (generic) | Free actor — pay compute | — | — | — | Could fetch the raw XML cheaply but returns nothing parsed without a custom `pageFunction` — build-your-own; the RSS-specific actors above make it unnecessary |

Also seen in the store sweep (not evaluated in depth): `technicaldost/rss-feed-scraper` (70 users,
pay-per-event), `santamaria-automations/rss-feed-reader` (28 users). Sources:
[shahidirfan](https://apify.com/shahidirfan/rss-xml-scraper) ·
[automation-lab](https://apify.com/automation-lab/rss-feed-reader) ·
[jupri](https://apify.com/jupri/rss-xml-scraper) ·
[eloquent_mountain](https://apify.com/eloquent_mountain/rss-feed-aggregator) ·
[ef12](https://apify.com/ef12/rss-scraper) ·
[website-content-crawler](https://apify.com/apify/website-content-crawler) ·
[cheerio-scraper](https://apify.com/apify/cheerio-scraper). Stats and modified dates from
`https://api.apify.com/v2/store?search=...` and `https://api.apify.com/v2/acts/<user>~<name>`
(pricing: `currentPricingInfo.pricingPerEvent` on the store record).

## 2. Input / output schemas — top two candidates

### `shahidirfan/rss-xml-scraper` (best)

Input ([input schema page](https://apify.com/shahidirfan/rss-xml-scraper/input-schema)):

```json
{
  "urls": ["https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "..."],
  "maxEntries": 20,
  "extractContent": false,
  "autoExpandSnippets": false,
  "discoverFeeds": false,
  "userAgent": "",
  "proxyConfiguration": { "useApifyProxy": false }
}
```

- `urls` — **array of feed URLs**, several per run.
- `maxEntries` — per feed, default 20, `0` = all.
- `extractContent` / `autoExpandSnippets` — optionally fetch each article's full text (slower;
  leave off for trend digestion — the summary is enough).
- `userAgent` + `proxyConfiguration` — the escape hatches if an outlet ever blocks Apify's IPs too.

Output (observed live, 2026-08-10): one dataset row per item with `item_type: "entry"`, plus **one
feed-metadata row per feed to filter out** (`item_type` ≠ `entry`, carries `feed_type`,
`entries_count`). Entry fields observed:

```
title, link, published (ISO-8601), author, authors, description, summary,
summary_html, content, content_html, id, feed_url, raw_pub_date, raw_iso_date,
collected_at, item_type
```

Everything the trend-scout digest needs (title, link, publish date, summary) came back clean on the
Atom-format Verge feed.

### `automation-lab/rss-feed-reader` (runner-up)

Input ([input schema page](https://apify.com/automation-lab/rss-feed-reader/input-schema)):

```json
{ "feeds": ["<feed url>", "..."], "maxItemsPerFeed": 20 }
```

`feeds` (required, array) and `maxItemsPerFeed` (optional, default 50, 1–1000). Output per item:
`feedUrl, feedTitle, feedType, title, link, description, content, author, publishedAt, updatedAt,
categories, guid, imageUrl, error, fetchedAt`.

**Defect found in the live run:** on The Verge's **Atom** feed, `title`, `description`, and
`feedTitle` all came back as the literal string `"[object Object]"` (the parser stringifies Atom's
`<title type="text">` node instead of reading its text). `link`, `publishedAt`, `guid`, `categories`
were correct. The other three target feeds are RSS 2.0 and would likely parse fine, but The Verge is
one of the four targets, so this bug is disqualifying as-is.

## 3. The four feeds — verified

All fetched live with `curl` (browser user-agent) on 2026-08-10; all returned HTTP 200 with valid
feed XML. The feed's own `<title>` confirms its scope.

| Outlet | Feed URL | Format | Feed self-identifies as | Status |
|---|---|---|---|---|
| The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` | Atom | "AI \| The Verge" | ✅ confirmed |
| Ars Technica AI | `https://arstechnica.com/ai/feed/` | RSS 2.0 | "AI - Ars Technica" | ✅ confirmed |
| The Guardian AI | `https://www.theguardian.com/technology/artificialintelligenceai/rss` | RSS 2.0 | "AI (artificial intelligence) \| The Guardian" | ✅ confirmed (Guardian's convention: append `/rss` to any section/tag URL) |
| ZDNet AI | `https://www.zdnet.com/topic/artificial-intelligence/rss.xml` | RSS 2.0 | "Latest news" (!) | ⚠️ **URL is official but topic scoping is broken** — see below |

**ZDNet caveat (verified 2026-08-10):** ZDNet's own feed directory
([zdnet.com/rssfeeds](https://www.zdnet.com/rssfeeds/)) lists
`/topic/artificial-intelligence/rss.xml` as the AI feed, but the feed it serves is the generic
site-wide latest-news set: its 20 items were **byte-identical** (same link set) to both
`/news/rss.xml` and `/topic/security/rss.xml`, and the items carry **no `<category>` tags** to filter
on. In other words, every ZDNet topic feed is currently an alias of "Latest news". Options for the
Operator (not decided here): keyword-filter ZDNet items by title in trend-scout, or drop ZDNet from
the curated list until its topic feeds work again.

**Corroborating the block:** during this research, WebFetch failed even on `arstechnica.com` and
`theguardian.com` documentation pages ("unable to fetch from" both hosts), while plain `curl` with a
browser UA fetched all four feeds fine. The block is against the WebFetch tool's fetch path, not the
feeds themselves.

## 4. Live smoke test (The Verge AI feed)

Two runs on 2026-08-10, via `api.apify.com/v2/acts/<actor>/run-sync-get-dataset-items`, token loaded
from `.env` (never printed). Cost read back from each run record's `usageTotalUsd` /
`chargedEventCounts`.

| Run | Actor | Result | Duration | Actual cost |
|---|---|---|---|---|
| 1 (paid) | `automation-lab/rss-feed-reader`, `maxItemsPerFeed: 5` | SUCCEEDED — 5 items, correct links + ISO dates, **but Atom title bug** (`"[object Object]"`) | 2.8 s | **$0.04075** ($0.035 start + 5 × $0.00115) |
| 2 (free actor) | `shahidirfan/rss-xml-scraper`, `maxEntries: 5` | SUCCEEDED — 5 clean entries + 1 feed-meta row: real titles ("Ford's new AI assistant can check your fuel levels…"), ISO dates, authors, summaries | 7.3 s | **$0.00049** (platform compute only) |

Weekly-loop projection (4 feeds × ~20 items): `shahidirfan` ≈ **well under 1¢/run**;
`automation-lab` ≈ $0.035 + 80 × $0.00115 ≈ **$0.13/run**.

## 5. Config-shape options for a per-source fetch strategy (described, not decided)

Today: `data/brands/straw-motion/seeds.yaml` keys Apify actors **per platform** under `apify:`
(`apify.facebook.trends_actor` etc.), and
`data/brands/straw-motion/formats/unhypped-news.yaml` holds `sources.curated_sources` as a **flat URL
list**. Three ways a fetch strategy could land:

### Option A — per-source annotation in the Format file

`curated_sources` entries become *string or object*; a string keeps today's behavior.

```yaml
curated_sources:
  - https://ai-weekly.ai/                                    # plain → WebFetch as today
  - url: https://www.theverge.com/rss/ai-artificial-intelligence/index.xml
    fetch: apify-rss                                          # → the RSS actor
```

*Pro:* the strategy sits right next to the source it applies to; per-Format, explicit, auditable;
backward compatible. *Con:* mixes "how to fetch" (plumbing) into the Operator's editorial file; the
actor slug itself still needs a home (seeds.yaml, per Option B); every store/loader that reads
`curated_sources` must accept both shapes.

### Option B — treat "rss" as a platform in seeds.yaml

Follow the existing `apify.<platform>.<role>_actor` convention and add an explicit list of
actor-fetched sources:

```yaml
apify:
  rss:
    feeds_actor: shahidirfan/rss-xml-scraper
    actor_fetched_sources:            # exact URLs (or hosts) that skip WebFetch
      - https://www.theverge.com/rss/ai-artificial-intelligence/index.xml
      - https://arstechnica.com/ai/feed/
```

*Pro:* zero change to the Format file (stays a flat list, editorial-only); matches the existing
per-platform actor convention exactly; one obvious place to swap the actor slug. *Con:* the source
list is now split across two files that must stay in sync; seeds.yaml is documented as legacy/"not
the source of truth for a Run's sources" (ADR-0013), so putting per-source routing there bends that
rule — though seeds.yaml *is* still where actor slugs live.

### Option C — convention only: automatic fallback, no per-source config

No routing config at all. trend-scout tries WebFetch first for every curated source; on a
block/failure it batches the failed URLs into **one** run of the actor named at
`apify.rss.feeds_actor` in seeds.yaml (the actor takes multiple URLs per run). Only the actor slug is
configured.

*Pro:* zero config churn; self-healing when outlets add or drop blocks; the flat `curated_sources`
list stays untouched. *Con:* one wasted failed WebFetch per blocked feed per run; behavior is
implicit — nothing in config says *why* a source went through Apify, which is harder to audit than a
declared strategy; needs a reliable "this was a block, not a transient error" test.

(A+C hybrid is possible: convention-first with an optional per-source override.)

---

## Sources

- Apify store pages: [shahidirfan/rss-xml-scraper](https://apify.com/shahidirfan/rss-xml-scraper) ·
  [automation-lab/rss-feed-reader](https://apify.com/automation-lab/rss-feed-reader) ·
  [jupri/rss-xml-scraper](https://apify.com/jupri/rss-xml-scraper) ·
  [eloquent_mountain/rss-feed-aggregator](https://apify.com/eloquent_mountain/rss-feed-aggregator) ·
  [ef12/rss-scraper](https://apify.com/ef12/rss-scraper) ·
  [apify/website-content-crawler](https://apify.com/apify/website-content-crawler) ·
  [apify/cheerio-scraper](https://apify.com/apify/cheerio-scraper)
- Apify public API (stats, pricing, modified dates, run costs): `https://api.apify.com/v2/store`,
  `https://api.apify.com/v2/acts/<user>~<name>`, `.../runs/last`
- Input schemas: [shahidirfan input](https://apify.com/shahidirfan/rss-xml-scraper/input-schema) ·
  [automation-lab input](https://apify.com/automation-lab/rss-feed-reader/input-schema)
- Outlets' feeds (fetched live 2026-08-10):
  [The Verge AI](https://www.theverge.com/rss/ai-artificial-intelligence/index.xml) ·
  [Ars Technica AI](https://arstechnica.com/ai/feed/) ·
  [The Guardian AI](https://www.theguardian.com/technology/artificialintelligenceai/rss) ·
  [ZDNet AI](https://www.zdnet.com/topic/artificial-intelligence/rss.xml) ·
  [ZDNet feed directory](https://www.zdnet.com/rssfeeds/)
- Repo config referenced: `data/brands/straw-motion/seeds.yaml`,
  `data/brands/straw-motion/formats/unhypped-news.yaml`
