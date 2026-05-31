# Subtext

Subtext is an organic-social **intelligence** system for **Facebook** (Pages & Reels): it finds
trending themes, suggests brand-fit content **ideas** for a human to execute, and tracks how the
resulting posts perform — feeding real performance back so the next round of ideas is sharper. It
does **not** generate finished content; a human writes the captions and shoots the Reels.

> Domain doc for the **Subtext** repo. The `self-healing-marketing-agent` repo is a **high-level
> reference for the content-pipeline *shape* only** (find trends → suggest ideas → track performance →
> feed back); its technical implementation is considered **flawed and is not reused** — no scoring
> formulas, contracts, or modules carry over. Subtext defines a fresh process and a fresh technical
> approach. Captured during the design grilling; refined as decisions land.

## Language

**Channel** (our Facebook Page):
The single Page we publish to and grow (e.g. "MundoTip"). The "us" that Brand Profile and Relevance
describe.
_Avoid_: account, profile, handle.

**Operator**:
The single human-in-the-loop who runs Subtext — sets the weekly Trend Research parameters, reviews
and rejects Ideas (with reasons), creates the content, and logs the Post URLs.
_Avoid_: user, admin (be specific — the Operator is the marketer driving the loop).

**Trend**:
A theme with current momentum on Facebook, surfaced from Apify by scraping *other people's* public
Reels/Pages (engagement + recency). On FB, momentum is carried more by topics/formats/sounds than by
hashtags.
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

**Post**:
The published content a human created by executing an Idea; the unit Subtext measures. One Idea
yields at most one Post (zero if the human never actions it).
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
designed fresh for Subtext (not inherited).
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
decision, designed fresh for Subtext.

## Relationships

- The **Operator** launches a weekly **Run** with basic parameters (niche, seeds/competitors, language, format, how many ideas)
- A **Run** scrapes **Trends** (Apify) and turns the strongest into **suggested Ideas**
- The **Operator Reviews** the suggested Ideas — **accepting** some, **rejecting** others with a **Rejection Reason**
- Each accepted **Idea** carries a predicted **Fit Score** and is executed by the Operator into at most one **Post**, whose **URL is logged** for tracking (attribution is stated, never inferred)
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

- **platform** — Subtext targets **Facebook** (Pages/Reels), not Instagram. The source repo's
  Instagram framing is replaced; `platform` stays a field but defaults to `facebook`.
- **Apify does two jobs; Meta export is optional** — **Apify** scrapes *other people's* posts for
  **Trend** discovery AND *our own* posts (by logged URL) for **Performance** — both **public metrics
  only** (reactions, comments, shares, views). Richer first-party signals (Saves, Net-follows,
  watch-through, Distribution Multiplier) come only from **Meta's Content export**, used as optional
  manual enrichment.
- **"idea" vs "draft/content"** — the source repo's `ContentDraft` (finished hook + caption +
  hashtags) is *content generation*, which Subtext excludes. An **Idea** stops at a Brief; a **Post**
  is the finished thing, created by a human.
- **"score"** — split three ways: **Fit Score** (predicted, pre-publication), **Performance**
  (the measured bundle of metrics, post-publication), and **Performance Score** (the single headline
  number distilled from Performance that the loop optimises for). Never conflate.
- **raw vs relative** — the Channel can go viral off one Reel (May 2026: 14.4M views in a day), so
  absolute Views are a misleading signal. Prefer measures relative to the Channel's own baseline.
