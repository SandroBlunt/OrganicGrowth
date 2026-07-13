# OrganicGrowth

OrganicGrowth is an organic-social **intelligence + production** system for **Facebook, Instagram, or
LinkedIn** (Facebook-first today): it finds trending themes, turns the strongest into brand-fit **Ideas**, renders each accepted
Idea into a publish-ready **Asset** via a Magnific flow, and tracks how the resulting posts perform —
feeding real performance back so the next round of ideas is sharper. It **generates the Asset but
never publishes**: a human reviews, publishes the Reel/Post to the Channel, and logs the URL. The
human gate moved from *creation* to *publication* — it was never removed (see ADR-0002).

> Domain doc for the **OrganicGrowth** repo. The `self-healing-marketing-agent` repo is a **high-level
> reference for the content-pipeline *shape* only** (find trends → suggest ideas → track performance →
> feed back); its technical implementation is considered **flawed and is not reused** — no scoring
> formulas, contracts, or modules carry over. OrganicGrowth defines a fresh process and a fresh technical
> approach. Captured during the design grilling; refined as decisions land.

## Language

**Brand** (the tenant; top of the tree):
One managed identity OrganicGrowth grows — its niche, voice, seed set, history, and the single
**Channel** it publishes to. The system manages **many Brands**; each owns its own **Brand Profile**,
seeds, **Your Data**, and ledger, and all of a Brand's state lives under its own directory. One Brand →
one Channel today (1:1). Research and idea generation are **per-Brand**; production (the Magnific Space)
is the shared part of the system.
_Avoid_: account, tenant, client.

**Channel** (a Brand's account):
The single account/Page a **Brand** publishes to and grows (e.g. "MundoTip"), on its platform
(Facebook today; Instagram or LinkedIn later). Exactly one per Brand — no longer a global singleton.
The "us" that a Brand's Profile and Relevance describe.
_Avoid_: profile, handle.

**Operator**:
The single human-in-the-loop who runs OrganicGrowth — sets the weekly Trend Research parameters, reviews
and rejects Ideas (with reasons), creates the content, and logs the Post URLs.
_Avoid_: user, admin (be specific — the Operator is the marketer driving the loop).

**Trend**:
A theme with current momentum on the Channel's platform, surfaced from Apify by scraping *other
people's* public posts (engagement + recency). Momentum is carried more by topics/formats/sounds than by
hashtags. For a Brand with `curated_sources` set in `seeds.yaml`, trend-scout surfaces Trends from the
Operator's own curated public newsletters instead of scraping peers — momentum there means editorial
prominence in the source, not peer over-performance.
_Avoid_: hashtag (a Trend is more than a tag), topic.

**Run** (weekly Trend Research Run):
One cycle of the pipeline, launched **weekly** by the Operator with basic parameters — trend-scout
scrapes Trends and idea-strategist turns the strongest into suggested Ideas for Review.
_Avoid_: batch, job.

**Idea** (canonical; the keystone output):
A brand-fit content concept derived from a Trend — angle, suggested format (Reel/photo), a hook
*concept*, talking points, a hashtag set, and a predicted Fit Score — handed to a human to execute.
Stops short of finished copy.
_Avoid_: draft, post, content piece (those imply finished/published work).

**Brief**:
The rendered, human-readable form of an Idea (what the human actually receives). Same thing as an
Idea, viewed as a deliverable.

**Review**:
The Operator's curation pass over a Run's suggested Ideas — accepting some, rejecting others with a
Rejection Reason. Done conversationally; the gate between a `suggested` and an `accepted` Idea.
_Avoid_: approval (it's richer — rejection carries feedback).

**Rejection Reason**:
The Operator's free-text, conversational explanation for rejecting a suggested Idea — captured at
Review. For v1 it is **logged only** (stored with the Idea); whether/how it later feeds back into
suggestions is a deferred decision.
_Avoid_: note, comment.

**Production Spec**:
The strict, schema'd JSON the **Producer** generates from an accepted Idea to drive the Space's
**"JSON master"** input node: 3 `character_concepts`, exactly 3 narrative `clips` (each with
`image_prompt` + `video_prompt`), and top-level `post_copy` (≤180 chars, 1–3 emojis) and 3
`thumbnails` — all bound by the Space's style guide (Pixar 3D, anthropomorphic character, ~8s clips,
9:16). The Space's flow — never the Spec — selects the actual image and video **models** (default =
whatever the Space is set to; the Operator overrides in the Space, see `docs/adr/0007`). The
machine-readable sibling of a **Brief**.
_Avoid_: prompt, payload, config (it's the Space's input *contract*).

**Cast**:
The set of candidate character images the **Producer** renders from a **Production Spec**'s
`character_concepts` and returns to the **Operator** to choose from — a second human gate, *inside*
production (the first being **Review**).
_Avoid_: characters, variants, options.

**Character** (the lead):
The single **Cast** member the **Operator** selects; pinned in the Space as the visual reference every
clip and thumbnail is rendered against. The Producer resumes only once it is set.
_Avoid_: cast (the Cast is the set, the Character is the chosen one), actor.

**Asset**:
The publish-ready media (image/Reel) the **Producer** renders from an accepted Idea by feeding a
**Production Spec** into a pre-defined **Magnific Space** and running it. It exists but is **not
yet published** — the Operator reviews it and publishes it. One Idea yields at most one Asset.
_Avoid_: draft, content, creative, Creation (Magnific's own word), post (a Post is *published*).

**Space** (Magnific Space; a production format):
A pre-defined Magnific pipeline that renders one **organic content format** — a UGC-style video, an
image carousel, a Pixar-3D character Reel, etc. A Space is **brand-agnostic**: any **Brand** can render
through it. Spaces are the shared, **format-keyed** half of OrganicGrowth; the per-Brand half is
research and idea generation. Each Space carries its own input contract (the **Production Spec** shape)
and its own **Execution Protocol**; today one Space (the 9:16 character Reel) is wired.
_Avoid_: flow, template, pipeline (the Space *is* the pipeline).

**Producer**:
The agent that renders an accepted **Idea/Brief** into an **Asset** by driving a pre-defined Magnific
Space. It is a **thin, self-configuring runner**: it reads the Space's own generation contract (its
system prompt) and its **Execution Protocol** from the canvas, then executes. It **generates, never
publishes**.
_Avoid_: generator, studio, creator.

**Execution Protocol**:
The ordered set of run-points (which node to run, in which mode, and where the human **gates** are)
that tells the **Producer** how to drive a Space end-to-end. It lives **on the Space itself**, so it
evolves with the canvas rather than drifting in a separate repo; the Producer reads it at run time.
_Avoid_: script, pipeline (the Space is the pipeline; the Protocol is how to run it).

**Fallback Protocol**:
The Producer's recovery path when a run-point is missing, stale, or fails (e.g. the Space changed) —
and the way it sets node contents that can't be set directly (injecting the **Production Spec**,
pinning the **Character**): it delegates to the Space's in-canvas **agent** with a natural-language
goal instead of a fixed node run.
_Avoid_: error handling, retry.

**Production Queue**:
The serialized backlog of Space generations the **Producer** owns. The Space runs **one generation at
a time**, so accepting an Idea **enqueues** it and the Producer works the queue in order — one Space
run at once. An Idea paused at its **Cast** gate does **not** hold the Space: the Producer advances the
next queued generation while the Operator decides, then queues the **render** once a Character is
picked. There is **one global queue across all Brands** (the Space is the shared bottleneck, so it has a
single lock); each job is **tagged with its Brand** so the Producer writes the Cast/Asset back to that
Brand's ledger.
_Avoid_: batch, backlog, jobs.

**Post**:
The published content on the **Channel** — the Operator publishes an **Asset** to create it; the unit
OrganicGrowth measures. One Idea yields at most one Asset and at most one Post (zero if never
published).
_Avoid_: draft, idea, content.

**Performance**:
The results a Post earned on our **Channel**, attributed back to the Idea that seeded it. The **active
loop reads public metrics via Apify** (Reactions, Comments, Shares, Reel Views) by scraping the logged
Post URL. Richer first-party signals (Saves, Net-follows, watch-through, Distribution Multiplier) live
only in **Meta's Content export** — an *optional manual enrichment*, not in the automated loop.
_Avoid_: score (collides with Fit Score), metrics (too generic), likes (FB has reactions).

**Distribution Multiplier**:
Meta's own signal (e.g. `+0.1x`, `-3.7x`) for how much more/less a Post was distributed than the
Channel's baseline — a normalized over/under-performance indicator. Available only via the **Meta
export enrichment** — not publicly scrapable.
_Avoid_: reach (a raw count), virality.

**Performance Score**:
The single 0–1 headline number the feedback loop optimises for, distilled from the **public Apify
metrics** by normalising **shares, comments, reactions, and views** against the Channel's own recent
baseline and weighting them (default `0.35 / 0.25 / 0.20 / 0.20`). Relative by design, so a viral
outlier can't permanently redefine "good". Weights are tunable config. (With Meta-export enrichment,
Saves / Net-follows / watch-through can be folded in.)
_Avoid_: Fit Score (the pre-publication prediction), raw views.

**Fit Score**:
A pre-publication *prediction* (0–1) of how well an Idea suits the Channel and rides a live Trend —
our guess at an Idea's quality before a human acts on it. How it's computed is an open decision,
designed fresh for OrganicGrowth (not inherited).
_Avoid_: quality score, performance (Performance is *measured*, Fit Score is *predicted*).

**Brand Profile**:
Our static brand rules and voice — niche, required CTA, required hashtag, banned words. The hard,
brand-safety constraints an Idea must respect.

**Your Data** (a.k.a. Channel History):
Our own past Posts and their Performance (the Meta export) — the anchor that Relevance is measured
against. Grows every cycle as new Posts are tracked.
_Avoid_: training data.

**Momentum**:
How hot a Trend is right now, derived from Apify engagement on *other people's* posts using it.

**Relevance**:
How well a candidate Trend/Idea resembles our top-performing past Posts. The method is an open
decision, designed fresh for OrganicGrowth.

## Relationships

- The **Operator** launches a weekly **Run** with basic parameters (niche, seeds/competitors, language, format, how many ideas)
- A **Run** scrapes **Trends** (Apify) and turns the strongest into **suggested Ideas**
- The **Operator Reviews** the suggested Ideas — **accepting** some, **rejecting** others with a **Rejection Reason**
- Each accepted **Idea** carries a predicted **Fit Score**; the **Producer** compiles it into a **Production Spec** (strict JSON), runs the **Space** to render a **Cast**, the **Operator** picks the **Character**, and the Producer resumes to render at most one **Asset** — which the Operator reviews and **publishes** into at most one **Post**, whose **URL is logged** for tracking (attribution is stated, never inferred)
- Production has **two human gates**: **Review** (accept the Idea) and **Cast** selection (pick the Character). The Producer pauses at each; nothing renders past a gate until the Operator acts
- **Accepting an Idea enqueues it** for production; the Producer drains the **Production Queue** in the background, **one Space generation at a time** (the Space has no parallelism). Gated Ideas never hold the Space
- A **Post** earns **Performance**, refreshed over time from the Meta export — a moving number, not a snapshot — which collapses to a **Performance Score**
- **Feedback** sharpens the next Run's Ideas:
  - **Performance feedback** *(active loop)* — *post-publication*: measured Performance Scores flow into **Your Data**, re-weighting **Relevance**
  - **Rejection feedback** *(logged only, v1)* — *pre-publication*: the Operator's rejection reasons are captured for later use, not yet wired into suggestions
- An Idea's **Fit Score** is a *prediction*; its **Performance Score** is the *truth* — the gap is the system's learning signal

## Example dialogue

> **Dev:** "When the idea-strategist suggests an **Idea**, does it write the caption?"
> **Marketing lead:** "No — it gives the human a **Brief**: the angle, the hook idea, the format,
> the hashtags, and why we think it'll land. The human writes the caption and makes the **Post**."
> **Dev:** "And the **Fit Score** on the Idea — is that how it performed?"
> **Marketing lead:** "No. **Fit Score** is our *guess* before posting. **Performance** is what
> actually happened after — Views, Shares, Saves, Net follows, watch-through. We keep both so we can
> see when our guesses were wrong and get better."

## Flagged ambiguities

- **platform** — OrganicGrowth grows organic presence on **Facebook, Instagram, or LinkedIn**.
  Production is identical across them (a 9:16 short video); only **trend-scout** and
  **performance-tracker** bind to a platform — via that platform's **Apify actors** (`seeds.yaml`) plus
  a per-platform metric mapping into the **Performance Score**. `platform` is a first-class field
  (`brand-profile.yaml`); **Facebook is the only wired platform today** — Instagram/LinkedIn are roadmap.
- **Apify does two jobs; Meta export is optional** — **Apify** scrapes *other people's* posts for
  **Trend** discovery AND *our own* posts (by logged URL) for **Performance** — both **public metrics
  only** (reactions, comments, shares, views). Richer first-party signals (Saves, Net-follows,
  watch-through, Distribution Multiplier) come only from **Meta's Content export**, used as optional
  manual enrichment.
- **"idea" vs "draft/content"** — the source repo's `ContentDraft` (finished hook + caption +
  hashtags) is *content generation*, which OrganicGrowth excludes. An **Idea** stops at a Brief; a **Post**
  is the finished thing, created by a human.
- **"score"** — split three ways: **Fit Score** (predicted, pre-publication), **Performance**
  (the measured bundle of metrics, post-publication), and **Performance Score** (the single headline
  number distilled from Performance that the loop optimises for). Never conflate.
- **raw vs relative** — the Channel can go viral off one Reel (May 2026: 14.4M views in a day), so
  absolute Views are a misleading signal. Prefer measures relative to the Channel's own baseline.
- **generate vs publish** — OrganicGrowth originally **never generated content** (an Idea stopped at a
  Brief; a human shot the Reel). As of June 2026 the **Producer** auto-renders an **Asset** from an
  accepted Idea via a Magnific flow. The human gate **moved from creation to publication**: the system
  now generates the Asset, but a human still reviews and **publishes** the Post. "Never generate
  finished content" is superseded by "never publish" (see ADR-0002).
