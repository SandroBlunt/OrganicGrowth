# OrganicGrowth

**Intelligence + production for Facebook organic social.** OrganicGrowth finds what's trending among
your peers, turns the strongest into brand-fit **Idea briefs**, **renders each accepted Idea into a
publish-ready Reel** via a Magnific Space, then tracks how your posts perform — feeding real
performance back so next week's ideas are sharper.

> It **generates the Asset but never publishes it**: a human reviews, picks the character, and posts.
> The gate is *publication*, not *creation*. Full domain language in [`CONTEXT.md`](./CONTEXT.md).

## A two-sided solution

**1 · Local — today.** Runs on your machine with **Claude Code** as the agent enabler. Four agents —
`trend-scout`, `idea-strategist`, `producer`, `performance-tracker` — run as Claude Code
subagents/commands over plain-file state. External muscle: **Apify** (scraping) and a **Magnific Space
via MCP** (the Reel).

**2 · Cloud — later.** The same agents packaged as a **persistent, headless instance on Alibaba
Cloud**, so you can drive the pipeline on the go and keep the agents always-on (queue draining,
performance tracking) without your laptop. *Planned, not yet built.*

Same agents, same file contracts — two runtimes.

## How it delivers value (the weekly loop)

```
1. /run-trends        trend-scout scrapes peer Pages (Apify) → Trends
                      idea-strategist → ~10 Idea briefs + Fit Scores
2. 👤 Review          /review-ideas — accept / reject (reasons logged). Accepting enqueues production.
3. Produce            producer builds a Production Spec → drives the Magnific Space →
   (background)       returns a character Cast, one generation at a time (serialized queue)
4. 👤 Cast pick       /pick-cast — choose the character; producer renders the Reel (the Asset)
5. 👤 Publish         you post the Asset to Facebook → /log-post links the Post to its Idea
6. /track-performance performance-tracker pulls PUBLIC metrics (Apify) → Performance Score → ledger
7. /report            pipeline state · Fit Score vs actual Performance · what's feeding back
```

👤 = you (the **Operator**). Three human gates — **Review, Cast pick, Publish** — everything between
runs itself.

## Technologies

- **Claude Code** + **Anthropic Claude** (Opus / Sonnet) — the agent runtime.
- **Apify** — public-metric scraping (peer trends + your post performance).
- **Magnific Spaces (via MCP)** — content production (Pixar-style anthropomorphic Reels).
- **Plain files** (YAML / JSON / Markdown) — all state, no database.
- *(later)* **Alibaba Cloud** — the persistent hosted instance.

## Quickstart

1. **Install** [Claude Code](https://claude.com/claude-code) and open this folder.
2. `cp .env.example .env` → paste your **`APIFY_API_TOKEN`**. Connect the **Magnific MCP** for production.
3. Edit **`data/brand-profile.yaml`** (Channel, voice, brand-safety) and **`data/seeds.yaml`** (peer
   Pages, keywords, language, idea count).
4. Each week: `/run-trends` → `/review-ideas` → `/pick-cast …` → publish + `/log-post …` → `/track-performance`.

## State (all in plain files)

| Path | What |
|---|---|
| `data/brand-profile.yaml` | Your Channel, voice, brand-safety rules |
| `data/seeds.yaml` | Weekly Trend-Research parameters (peer Pages, keywords, …) |
| `data/your-data/` | *Optional* Meta Content exports for richer enrichment (git-ignored) |
| `ideas/<run>/idea-NN.md` | One Brief per suggested Idea |
| `ideas/<run>/idea-NN.spec.json` | The Production Spec that drives the Space |
| `data/queue.json` | The serialized production queue |
| `data/ledger.json` | The index: Idea ⇄ Cast ⇄ Asset ⇄ Post(URL) ⇄ Performance, with status |

## Worth knowing

- **Performance is public-metrics only** (Apify): reactions, comments, shares, views — not Saves,
  Net-follows, or watch-through. See [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).
- **Relative to *your* baseline,** not absolute counts — one viral post can't define "good."
- **Why it produces but never publishes:** [`docs/adr/0002`](./docs/adr/0002-producer-generates-asset-human-publishes.md).
  How the Producer drives the Space: [`0003`](./docs/adr/0003-producer-execution-model-on-space-protocol.md)
  · [`0004`](./docs/adr/0004-producer-serialized-background-queue.md).

---

_Created 2026-06-04._
