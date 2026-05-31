# OrganicGrowth

**Organic-social intelligence for Facebook.** OrganicGrowth finds what's trending among your peers,
suggests brand-fit **content ideas** (briefs, not finished posts), and tracks how the posts you make
from them perform — feeding real performance back so next week's ideas are sharper.

> OrganicGrowth does **not** generate content. It hands the Operator a brief; a human writes the caption
> and shoots the Reel. See [`CONTEXT.md`](./CONTEXT.md) for the full domain language.

## The weekly loop

```
        ┌────────────────────── weekly ──────────────────────┐
        ▼                                                      │
1. /run-trends         trend-scout scrapes peer Pages (Apify) → Trends
                       idea-strategist → ~10 Idea briefs + Fit Scores
2. 👤 /review-ideas    you accept / reject (reasons logged), conversationally
3. 👤 (offline)        you create the content and post it to Facebook
4. 👤 /log-post        link the published Post URL → its Idea
5. /track-performance  performance-tracker pulls PUBLIC metrics (Apify) →
                       Performance Score → updates ledger + Your Data ──────┘
6. /report             pipeline state · Fit Score vs actual Performance
```

Steps marked 👤 are you (the **Operator**). Everything else is an agent or command.

## Quickstart

1. **Install** [Claude Code](https://claude.com/claude-code) and open this folder.
2. `cp .env.example .env` and paste your **`APIFY_API_TOKEN`** (apify.com → Settings → Integrations).
3. Edit **`data/brand-profile.yaml`** (your Channel, voice, brand-safety) and
   **`data/seeds.yaml`** (peer Pages to scrape, keywords, language, how many ideas).
4. Each week: `/run-trends` → `/review-ideas` → make + post your content → `/log-post …` → `/track-performance`.

## State (all in plain files)

| Path | What |
|---|---|
| `data/brand-profile.yaml` | Your Channel, voice, brand-safety rules |
| `data/seeds.yaml` | Weekly Trend-Research parameters (peer Pages, keywords, …) |
| `data/your-data/` | *Optional* Meta Content exports for richer enrichment (git-ignored) |
| `ideas/<run>/idea-NN.md` | One Brief per suggested Idea |
| `data/ledger.json` | The index: Idea ⇄ Post(URL) ⇄ Performance, with status |

## Two things worth knowing

- **Performance is public-metrics only.** Both agents use Apify, which sees reactions, comments,
  shares, and views — not Saves, Net-follows, or watch-through. Why, and how to enrich with a Meta
  export, is recorded in [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).
- **Measured relative to *your* baseline,** not absolute counts — one viral post can't define "good."
