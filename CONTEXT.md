# OrganicGrowth

OrganicGrowth is an organic-social **intelligence + production** system for **Facebook, Instagram,
YouTube, or LinkedIn** (Facebook-first today): it finds trending themes, turns the strongest into brand-fit **Ideas**, produces each accepted
Idea through one or more **Recipes** — each rendering a publish-ready **Asset** via a Magnific **Space** — and tracks how the resulting posts perform —
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

**Format** (a Brand's editorial line):
The recurring editorial identity a **Brand** publishes under — its subject **and** treatment (e.g. Straw
Motion's **"Unhypped News"**: AI/tech news explained in-depth, in plain terms). A Format sits **above
Ideas** and holds many of them; a Brand may run one or several. It shapes what its Ideas are about and
how their copy reads. It **owns** its voice/treatment, its trend sources, and its peer-vs-curated mode —
so one Brand can run several Formats with different voices (ADR-0013). It carries the **default Recipes** its Ideas are produced through (the Operator
confirms or trims them at Review). Distinct from a **Recipe** (how the media is made): the bare word "format" used to
mean both — it now means **only** the editorial line.
_Avoid_: series, show, content pillar; and — critically — the *production/media* sense (that is a **Recipe**).

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
A brand-fit content concept derived from a Trend and belonging to one of the Brand's **Formats** —
angle, a hook *concept*, talking points, a hashtag set, and a predicted Fit Score — handed to a human to
execute. The Operator produces it through **one or more Recipes** (each making an **Asset**). Stops short
of finished copy.
_Avoid_: draft, post, content piece (those imply finished/published work).

**Brief**:
The rendered, human-readable form of an Idea (what the human actually receives). Same thing as an
Idea, viewed as a deliverable.

**Review**:
The Operator's curation pass over a Run's suggested Ideas — accepting some (and choosing the **Recipes**
each is produced through, pre-filled from the Format), rejecting others with a Rejection Reason. Done
conversationally; the gate between a `suggested` and an `accepted` Idea. Accepting enqueues **one
production job per chosen Recipe**.
_Avoid_: approval (it's richer — rejection carries feedback).

**Rejection Reason**:
The Operator's free-text, conversational explanation for rejecting a suggested Idea — captured at
Review. For v1 it is **logged only** (stored with the Idea); whether/how it later feeds back into
suggestions is a deferred decision.
_Avoid_: note, comment.

**Production Spec**:
The strict, schema'd JSON the **Producer** generates from an accepted Idea to feed a **Recipe**'s Space
media input — **the media instructions only**. Its **shape is per-Recipe** (the *Character Explainer with
Cast* Recipe's is 3 `character_concepts` + 3 narrative `clips` with `image_prompt` + `video_prompt` + 3
`thumbnails`, bound by that Space's style guide). **Copy is no longer in the Spec** — it is composed
separately (see **Copy**; ADR-0012). The Space's flow — never the Spec — selects the actual image/video
**models** (`docs/adr/0007`). The machine-readable, media-only sibling of a **Brief**.
_Avoid_: prompt, payload, config (it's the Space's input *contract*).

**Cast** (the *Character Explainer with Cast* Recipe's pick):
The set of candidate character images **that Recipe** renders from its **Production Spec**'s
`character_concepts` and returns to the **Operator** to choose from. It is **one Recipe's** pick-gate —
an *example* of a Recipe gate, not a universal step: other Recipes declare their own gates, or none.
_Avoid_: characters, variants, options.

**Character** (the *Character Explainer with Cast* Recipe's lead):
The single **Cast** member the **Operator** selects; pinned in the Space as the visual reference every
clip and thumbnail is rendered against. **Local to that Recipe** — another Recipe has no Character. The
Producer resumes only once it is set.
_Avoid_: cast (the Cast is the set, the Character is the chosen one), actor.

**Asset**:
The publish-ready deliverable a **Recipe** produces from an accepted Idea: the **media** (the Space's
Reel / image / carousel) **plus its tailored Copy** (caption, hashtags, mentions, CTA). It exists but is
**not yet published** — the Operator reviews it and publishes it. An Idea yields **one Asset per Recipe**
the Operator runs — several Assets if several Recipes are chosen.
_Avoid_: draft, content, creative, Creation (Magnific's own word), post (a Post is *published*).

**Copy** (a.k.a. Post Copy):
The tailored text that ships with one **Asset** — caption, hashtags, mentions, CTA. A **Recipe**'s
**copy step** composes it from the **Format**'s voice, the **Brand**'s hard rules (required CTA / hashtags,
banned words), and the **Idea**'s material, in the *shape* the Recipe's medium needs (a Reel caption vs a
carousel's per-card lines). **One per Asset/Post**, and **not** the Space's job — the Space makes media
only. (The watermark @handle is **not** copy — it is a Space parameter, its value inherited from the
Brand; ADR-0012.) A single shared, parameterized step produces it; before this change it was a dropped,
single-line template.
_Avoid_: caption (that is only one part), post_copy (the old single throwaway field).

**Space** (Magnific Space; the media engine):
A pre-defined Magnific pipeline that generates the **media** a **Recipe** needs — a UGC-style video, an
image carousel, a Pixar-3D character Reel. A Space is **brand-agnostic**: any **Brand** can render
through it. A Space makes **media only** — it does **not** write the post's copy (that is the Recipe's
copy step). A **Recipe** drives one (or more) Spaces; each Space carries its own input contract (the
**Production Spec** shape) and its own **Execution Protocol**. Today one Space (the 9:16 character Reel)
is wired.
_Avoid_: flow, template, pipeline (the Space *is* the pipeline); format (a Space is the media engine
inside a **Recipe**, not the editorial **Format**).

**Recipe** (a production plan; the shared unit of *making*):
The plan that turns one **Idea** into one **Asset** — which **Space** (or tools) generates the media, the
ordered steps to drive it, any human **pick-gate**, and the **copy step** that tailors the post's
caption / hashtags / mentions for this kind of content. A Recipe is **defined in OrganicGrowth's repo** — it names the
Space(s) and reads each Space's on-canvas run-points for the media, but owns the gates, the copy, and the
spec shape itself (ADR-0010). The **Operator picks one or many** Recipes per
Idea (a Reel, a carousel, a meme…); each yields its own Asset → Post. A Recipe is **brand-agnostic** and
shared — the per-Brand halves are the **Format** and idea generation. Today one Recipe is wired —
**Character Explainer with Cast** (cast → pick the **Character** → render).
_Avoid_: format (that is the editorial line), template, pipeline (a Space is a pipeline; a Recipe wraps
one), media output (that is the Recipe's *result*, not the plan).

**Producer**:
The agent that renders an accepted **Idea** into its **Assets** by running each chosen **Recipe** — for
each: driving the Recipe's **Space(s)** for the media (following the Space's on-canvas **Execution
Protocol**), pausing at the Recipe's **gates**, and running its **copy step**. A thin runner configured by
the in-repo **Recipe**. It **generates, never publishes**.
_Avoid_: generator, studio, creator.

**Execution Protocol**:
The ordered **media** run-points on a Space (which node to run, in which mode) — how to drive **that
Space's own nodes**. It lives **on the Space itself**, so it evolves with the canvas; the Producer reads
it at run time. It **no longer holds the end-to-end plan**: a **Recipe** (in our repo) owns the gates,
the copy step, and which Space(s) to drive (ADR-0010).
_Avoid_: script, pipeline (the Space is the pipeline; the Protocol is how to run its media nodes).

**Fallback Protocol**:
The Producer's recovery path when a run-point is missing, stale, or fails (e.g. the Space changed) —
and the way it sets node contents that can't be set directly (injecting the **Production Spec**,
pinning the **Character**): it delegates to the Space's in-canvas **agent** with a natural-language
goal instead of a fixed node run.
_Avoid_: error handling, retry.

**Production Queue**:
The serialized backlog of Space generations the **Producer** owns. Because the single attended Operator
drives **one generation at a time** (ADR-0008), accepting an Idea **enqueues one job per chosen Recipe**
and the Producer works the queue in order. A job paused at one of its Recipe's **gates** does **not**
hold the Space: the Producer advances the next queued generation while the Operator decides, then resumes
that job once the pick is in. There is **one global queue across all Brands**; each job is keyed by
`(brand, idea, recipe)` so the Producer writes that **Asset** back to the right Brand's ledger.
_Avoid_: batch, backlog, jobs.

**Post**:
The published content on the **Channel** — the Operator publishes an **Asset** to create it; the unit
OrganicGrowth measures. Each **Asset** becomes at most one Post (zero if never published), so an Idea
yields **one Post per Recipe** the Operator ran. Attribution to a Post is keyed on `(Idea, Recipe)`.
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

- The **Operator** launches a weekly **Run** for one of a Brand's **Formats**, using that Format's own sources, voice, and idea count
- A **Run** scrapes **Trends** (Apify) and turns the strongest into **suggested Ideas**
- The **Operator Reviews** the suggested Ideas — **accepting** some, **rejecting** others with a **Rejection Reason**
- At **Review** the Operator accepts an Idea **and chooses its Recipes** (pre-filled from the Format); each chosen **Recipe** becomes one production job. For each, the **Producer** drives that Recipe's **Space** for the media (pausing at the Recipe's own gates, e.g. the *Character Explainer with Cast* pick), then composes the **Copy** — yielding **one Asset per Recipe**. The Operator reviews each Asset and **publishes** it into a **Post**, logging the URL with its Recipe (attribution is stated, never inferred)
- The human gates are **Review** (accept the Idea + choose its Recipes), then **each Recipe's own pick-gate(s)** (zero, one, or several — the Reel's is the **Cast** pick), then **Publish**. The Producer pauses at each; nothing renders past a gate until the Operator acts
- **Accepting an Idea enqueues one job per chosen Recipe**; the Producer works the **Production Queue** in the Operator's session, **one generation at a time** (bounded by the single attended Operator, not by per-Space capacity). A job paused at a gate never holds the Space
- A **Post** earns **Performance**, refreshed over time from the Meta export — a moving number, not a snapshot — which collapses to a **Performance Score**
- **Feedback** sharpens the next Run's Ideas:
  - **Performance feedback** *(active loop)* — *post-publication*: measured Performance Scores flow into **Your Data**, re-weighting **Relevance**
  - **Rejection feedback** *(logged only, v1)* — *pre-publication*: the Operator's rejection reasons are captured for later use, not yet wired into suggestions
- An Idea's **Fit Score** is a *prediction* (one per Idea); a Post's **Performance Score** is the *truth* (one per Recipe/Post). The gap — Fit vs the Idea's best Post — is the learning signal, kept as a 1:N relationship so a per-Post result is never mistaken for a per-Idea judgement

## Example dialogue

> **Dev:** "When the idea-strategist suggests an **Idea**, does it write the caption?"
> **Marketing lead:** "No — it gives the human a **Brief**: the angle, the hook idea,
> the talking points, the hashtags, and why we think it'll land. The human writes the caption and makes the **Post**."
> **Dev:** "And the **Fit Score** on the Idea — is that how it performed?"
> **Marketing lead:** "No. **Fit Score** is our *guess* before posting. **Performance** is what
> actually happened after — Views, Shares, Saves, Net follows, watch-through. We keep both so we can
> see when our guesses were wrong and get better."

## Flagged ambiguities

- **Format vs Recipe** — "format" used to mean two different things: a Brand's **editorial line**
  (e.g. Straw Motion's *Unhypped News* — subject + treatment, holding many Ideas) and a **production
  recipe** (Reel / carousel / meme — how the media is made and its copy tailored). They are now split:
  **Format** = the editorial line (per Brand, *above* Ideas); **Recipe** = the production plan (shared;
  the Operator picks **one or many** per Idea, each yielding one **Asset** → one **Post**). The code's
  `formats: [reel]` in `brand-profile.yaml` (today the *media* sense) is to be renamed so "format" only
  ever means the editorial line.
- **platform** — OrganicGrowth grows organic presence on **Facebook, Instagram, YouTube, or
  LinkedIn**. Production is identical across them (a 9:16 short video); only **trend-scout** and
  **performance-tracker** bind to a platform — via that platform's **Apify actors** (`seeds.yaml`) plus
  a per-platform metric mapping into the **Performance Score**. `platform` is a first-class field
  (`brand-profile.yaml`); **Facebook, Instagram, and YouTube have verified Apify actors** (issue #48)
  — **LinkedIn is the one remaining roadmap platform**. A peer/competitor source's platform (for
  Trend Research) or a logged Post's platform (for Performance) is detected from its own URL, and can
  differ from the Brand's own Channel platform (e.g. a Facebook Channel with Instagram/YouTube
  competitors).
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
  accepted Idea via a Magnific **Space**. The human gate **moved from creation to publication**: the system
  now generates the Asset, but a human still reviews and **publishes** the Post. "Never generate
  finished content" is superseded by "never publish" (see ADR-0002).
