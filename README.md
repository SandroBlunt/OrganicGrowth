# OrganicGrowth

**In plain terms:** OrganicGrowth grows your organic social presence — on **Facebook, Instagram,
YouTube, or LinkedIn** (Facebook-first today) — for you. It watches what's working for similar
accounts, writes post ideas that fit your brand, and **turns the best ones into finished,
ready-to-publish content** — then watches how your posts perform and uses that to make next week's
ideas even better.

One idea can become **more than one kind of content**. You choose which **Recipes** to run it through —
today there are two: a **Character Explainer Reel** (an AI-character explainer video) and a **News
Carousel** (a 7-slide image carousel). Each Recipe you pick produces **one finished, ready-to-publish
piece** — an **Asset**.

**What you do — a few minutes a week:**

1. **Approve** the ideas you like (reject the rest) — and pick which **Recipes** to make from each.
2. **Make the pick** each Recipe asks for (the Reel asks you to pick its character; the Carousel asks
   for nothing).
3. **Publish** the finished Asset and paste its link back.

Everything in between — trend research, idea writing, and production — runs on its own. No scripting,
filming, or editing.

> It **makes the Asset but never publishes it**: you review, make the picks, and publish. The gate is
> *publication*, not *creation*. Full domain language in [`CONTEXT.md`](./CONTEXT.md).

**The tools, and what each is for:**

- **Claude Code** — runs the AI agents that scout trends, write ideas, and produce each Asset.
- **Apify** — scrapes public metrics: peer trends on the way in, your posts' performance on the way back.
- **Magnific** — turns an idea into a finished Reel or Carousel. Each Recipe drives its own Magnific
  **Space**, and the **Space's flow picks the models** (the Carousel uses Nano Banana 2; the Reel's
  character art uses Nano Banana / Seedream). OrganicGrowth never hardcodes them — the Space's own
  setting is the default (see [`docs/adr/0007`](./docs/adr/0007-model-selection-lives-in-the-space.md)).

## Formats and Recipes

- A **Format** is your Brand's editorial line — its voice, where it looks for trends, and how many ideas
  a run produces (e.g. Straw Motion's *Unhypped News*). It lives in `data/brands/<slug>/formats/<slug>.yaml`.
- A **Recipe** is a reusable, in-repo production plan (`src/recipe/registry.ts`) — its gates, its spec
  shape, its copy shape, and which Magnific Space it drives. Two are wired today:
  **Character Explainer with Cast** (one pick — the character) and **News Carousel** (no picks).

One **Idea** → the Recipes you choose at Review → **one Asset per Recipe** → one Post per Asset. Gates,
the production spec, and the copy step are all **per-Recipe** (ADRs 0009–0018).

## How it delivers value (the weekly loop)

```
1. /run-trends <brand> <format>   trend-scout scrapes peer accounts (or digests curated
                                  newsletters) → Trends; idea-strategist → Idea briefs + Fit Scores
2. 👤 Review        /review-ideas — accept / reject (reasons logged). Accepting also PICKS the
                    Idea's Recipes (pre-filled from the Format) and queues one job per Recipe.
3. Produce          producer works the queue IN YOUR SESSION (attended): builds each Recipe's
   (attended)       Production Spec → drives that Recipe's Magnific Space, one generation at a
                    time, pausing only at that Recipe's own gate(s)
4. 👤 Recipe pick   each Recipe's own gate — the Reel: /pick-cast to choose the character; the
                    Carousel: nothing (zero gates, runs straight through). producer then renders
                    the Asset and writes its Copy
5. 👤 Publish       you post each Asset → /log-post <brand> <idea> <recipe> <url> links the Post
6. /track-performance  performance-tracker pulls PUBLIC metrics (Apify) → a Performance Score per
                       Asset (relative to your baseline) → ledger
7. /report          pipeline state · Fit Score vs the best measured Performance · what's feeding back
```

👤 = you (the **Operator**). Three human gates — **Review**, **each Recipe's own picks**, **Publish** —
everything between runs itself. Production is **attended**: it runs in your session and you approve the
Magnific calls as they happen — there is no unattended background worker
([`docs/adr/0008`](./docs/adr/0008-producer-drives-the-space-attended.md)).

## A two-sided solution

**1 · Local — today.** Runs on your machine with **Claude Code** as the agent enabler. Four content
agents — `trend-scout`, `idea-strategist`, `producer`, `performance-tracker` — run as Claude Code
subagents/commands over plain-file state. Each Recipe's production procedure is a Skill the
recipe-generic `producer` loads by slug and runs as its own authoring craft (`produce-news-carousel`,
`produce-character-explainer`).
External muscle: **Apify** (scraping) and one **Magnific Space per Recipe via MCP**.

**2 · Cloud — later (planned).** The hands-off steps (trend research, performance tracking) packaged as a
hosted instance so they run without your laptop. **Production stays attended by design** — you're already
present for the picks, so it runs in your session, not a background host.

Same agents, same file contracts.

## Technologies

- **Claude Code** + **Anthropic Claude** (Opus / Sonnet) — the agent runtime.
- **Apify** — public-metric scraping (peer trends + your post performance).
- **Magnific Spaces (via MCP)** — content production; one Space per Recipe (a character-Reel Space and a
  single-lane Carousel Space today).
- **Plain files** (YAML / JSON / Markdown) behind a typed store layer — all state, no database.
- *(later)* **Alibaba Cloud** — the persistent hosted instance for the hands-off steps.

## Quickstart

1. **Install** [Claude Code](https://claude.com/claude-code) and open this folder.
2. `cp .env.example .env` → paste your **`APIFY_API_TOKEN`**. Connect the **Magnific MCP** for production.
3. Set up your Brand under `data/brands/<brand>/`: **`brand-profile.yaml`** (Channel, brand-safety),
   **`seeds.yaml`** (the Apify actor slugs per platform), one **`formats/<format>.yaml`** per editorial
   line (voice, trend sources, `default_recipes`, `ideas_per_run`), and any reusable media in
   **`assets/`** (e.g. your `brand-logo.png` for the Carousel).
4. Each week, per Format: `/run-trends <brand> <format>` → `/review-ideas <brand>` → make each Recipe's
   pick (`/pick-cast <brand> <idea-id> <n>` for the Reel) → publish + `/log-post <brand> <idea-id>
   <recipe> <url>` → `/track-performance <brand>`. (`/run-pipeline <brand>` conducts the whole loop.)

## State (all in plain files, behind a typed store)

Scoped per Brand under `data/brands/<slug>/` (the Production Queue is the one brand-agnostic exception):

| Path | What |
|---|---|
| `brand-profile.yaml` | Brand-wide hard rules — banned words, required CTA/hashtags, watermark handle, Channel/platform |
| `seeds.yaml` | The Apify actor slugs, per platform |
| `formats/<format>.yaml` | One per editorial line — voice, trend sources/mode, `default_recipes`, `ideas_per_run` |
| `assets/<key>.<ext>` | Reusable **Brand Assets** (media) that fill a Recipe's canvas slots (e.g. `brand-logo`) |
| `baseline-prompts/<format>/<recipe>.md` | A Format's per-Recipe baseline-prompt document (the look) |
| `ideas/<format>/<run>/idea-NN.md` | One Brief per suggested Idea (older runs sit one level up, at `ideas/<run>/` — the ledger's recorded path wins) |
| `ideas/<format>/<run>/idea-NN.<recipe>.spec.json` | A chosen Recipe's Production Spec (written when the job is produced) |
| `ideas/…/idea-NN.<recipe>.output/` | The Asset's self-contained publish + tracking bundle (renamed from `.assets/`) — the downloaded media in post order, `caption.txt` (paste-ready caption + hashtags), and `post.json` (a *generated view* of the ledger — never a second store; kept on your disk, not in git) |
| `ledger.json` | The index: each Idea's **per-Recipe Assets** (Cast/character, Copy, media file paths, Post URL, Performance, status) |
| `your-data/` | *Optional* Meta Content exports for richer enrichment (git-ignored, never committed) |
| `data/queue.json` | The production queue, keyed `(brand, idea, recipe)` (brand-agnostic) |

Each Idea holds **one Asset per chosen Recipe**, moving through `queued → in_production → produced →
posted → tracking → scored` (ADR-0011). A human pick is a pause inside `in_production`, not a status.

## Worth knowing

- **Performance is public-metrics only** (Apify): reactions, comments, shares, views — not Saves,
  Net-follows, or watch-through. See [`docs/adr/0001`](./docs/adr/0001-apify-public-metrics-for-performance.md).
- **Relative to *your* baseline,** not absolute counts — one viral post can't define "good." Each
  Recipe's Asset is scored on its own.
- **Attribution is explicit:** a Post links to a specific `(Idea, Recipe)` only via the `post_url` you
  log — never inferred.
- **One bundle folder holds everything to post and track:** an Asset's `.output/` directory carries its
  media, `caption.txt`, and `post.json` (generated from the ledger — `/log-post`/`/track-performance`
  keep it refreshed automatically). An Asset produced before this existed keeps its old `.assets/`
  folder untouched; nothing needs migrating.
- **Why it produces but never publishes:** [`docs/adr/0002`](./docs/adr/0002-producer-generates-asset-human-publishes.md).
  The Producer drives the Space **attended** ([`0008`](./docs/adr/0008-producer-drives-the-space-attended.md),
  supersedes the old background queue), each Recipe is defined in-repo with its Space media-only
  ([`0009`](./docs/adr/0009-format-vs-recipe-multi-format-model.md)–[`0018`](./docs/adr/0018-per-recipe-producer-procedure-is-a-skill.md)),
  and the Space — not OrganicGrowth — picks the models
  ([`0007`](./docs/adr/0007-model-selection-lives-in-the-space.md)).

---

_Created 2026-06-04 · Updated 2026-07-21 (Format/Recipe model, two wired Recipes, attended production)._
