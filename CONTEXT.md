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
One managed identity OrganicGrowth grows — its niche, voice, seed set, history, and the one or more
**Channels** it publishes to. The system manages **many Brands**; each owns its own **Brand Profile**,
seeds, **Your Data**, and ledger, and all of a Brand's state lives under its own directory. One Brand →
one-or-more Channels (ADR-0019), exactly one of them **primary** (§ Channel). Research and idea
generation are **per-Brand**; production (the Magnific Space) is the shared part of the system.
_Avoid_: account, tenant, client.

**Channel** (a Brand's account):
An account/Page a **Brand** publishes to (e.g. "MundoTip" on Facebook), on its platform. A Brand may
list several — Straw Motion targets Facebook, Instagram, LinkedIn, X, and TikTok — but exactly one is
marked **primary**: the Channel performance-tracker, the baseline, and ledger attribution still key off
of (ADR-0019; per-Channel performance tracking is a deliberate future epic, not built yet). The
non-primary Channels exist so Copy can be composed with a variant tuned per platform (`#128`/`#129`),
not because OrganicGrowth tracks or publishes to them itself. The "us" that a Brand's Profile and
Relevance describe.
_Avoid_: profile, handle.

**Format** (a Brand's editorial line):
The recurring editorial identity a **Brand** publishes under — its subject **and** treatment (e.g. Straw
Motion's **"Unhypped News"**: AI/tech news explained in-depth, in plain terms). A Format sits **above
Ideas** and holds many of them; a Brand may run one or several. It shapes what its Ideas are about and
how their copy reads. It **owns** its voice/treatment, its trend sources, its peer-vs-curated mode, and its **cadence**
(weekly or daily; ADR-0022) — so one Brand can run several Formats with different voices (ADR-0013). It also owns the **look** — a
per-Recipe **Baseline Prompt** (a referenced document the Recipe's **Skill** interprets to author the
media; ADR-0015). It carries the **default Recipes** its Ideas are produced through (the Operator
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
hashtags. For a **Format** that lists `curated_sources`, trend-scout surfaces Trends from the Operator's own
curated public sources (newsletters, RSS feeds) instead of scraping peers — momentum there means
editorial prominence in the source, not peer over-performance.
_Avoid_: hashtag (a Trend is more than a tag), topic.

**Run** (a Format's Trend Research Run):
One cycle of the pipeline for one **Format**, launched by the Operator at that Format's **cadence** —
weekly (named by ISO week, e.g. `2026-W32`) or daily (named by date, e.g. `2026-08-11`; ADR-0022) —
trend-scout surfaces Trends and idea-strategist turns the strongest into suggested Ideas for Review.
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

**Hook Type** (a closed vocabulary; one per Idea):
The one storytelling technique an Idea's Hook concept uses to earn the first three seconds — filled in
by idea-strategist when the Brief is written, alongside **Theme** below (`docs/adr/0029`'s schema:
`idea.hook_type`). **Closed**, not free text — an open field would reproduce today's problem (hook type
living only as prose inside a Brief markdown heading, spelled two different ways across the two Brands)
in a new location. The eleven values:

- `counter_intuitive` — The outcome runs against what you'd expect, and that gap is the hook.
- `surprising_number` — One stark figure — a price, a count, a stat — carries the whole open.
- `reframe` — A familiar thing is recast as something categorically different.
- `contradiction` — Two facts that seem to conflict are placed side by side.
- `underdog_upset` — A lesser-known challenger beats the established name at its own game.
- `reversal` — Something assumed settled or safe is undone, walked back, or removed.
- `skeptics_question` — Opens on doubt and promises an honest verdict, not the marketing.
- `collision` — Two unrelated events landing in the same moment force a comparison.
- `oddity` — One specific strange detail, out of pattern, demands an explanation.
- `irony` — An actor's own action undercuts the thing they claim to stand for.
- `unclassified` — No classifiable Hook concept exists to categorize — the importer's honest default,
  never a guessed technique.

`unclassified` (issue #219, Operator decision 2026-08-17) is the value the **importer** (issue #204)
assigns when a Brief carries no classifiable Hook concept at all (today: 10 of the 61 existing Briefs,
which have neither a `Hook concept`/`Hook Concept` heading nor a `format` field). It keeps `idea.hook_type`
`NOT NULL` — never nullable — while staying **distinguishable, in any query, from every real, classified
value**: nullable would have conflated "not yet classified" with "has no hook to classify."

_Avoid_: free-text hook description (the Brief's prose Hook concept stays free text; Hook Type is its
closed *category*, a separate field), sub-hook, angle (that's the Idea's own, broader term).

**Theme** (a closed vocabulary; one per Idea):
The subject category an Idea's story falls under — filled in alongside **Hook Type**, above
(`idea.theme`). Spans every Brand's Format (a household-tips Idea and an AI-news Idea both pick from
this SAME closed set, at this more abstract level) so the vocabulary stays useful across Formats rather
than needing a new list per Format. The ten values:

- `product_or_tool` — A new or updated product, model, app, or device is the subject.
- `pricing_or_cost` — Money is the throughline: a price, a discount, a valuation, or a spend.
- `safety_or_risk` — A danger, a failure, a leak, or a safety finding is the subject.
- `how_to_or_technique` — A concrete method or trick the viewer can copy.
- `industry_or_business` — A company move: funding, a deal, a partnership, a market shift.
- `policy_or_regulation` — A law, a rule, a government action, or an official stance.
- `comparison_or_benchmark` — Two or more things are measured or ranked against each other.
- `lifestyle_or_wellbeing` — A daily-life habit, a routine, or personal wellbeing.
- `culture_or_reaction` — Public sentiment, controversy, irony, or reaction to an event.
- `unclassified` — No classifiable subject exists to categorize — the importer's honest default, never
  a guessed category.

`unclassified` (issue #219, Operator decision 2026-08-17) is the value the **importer** (issue #204)
assigns when a Brief carries no classifiable subject at all — the same 10 headingless Briefs the Hook
Type entry above describes. It keeps `idea.theme` `NOT NULL` while staying **distinguishable, in any
query, from every real, classified value**, for the identical reason given above.

_Avoid_: topic (too vague — Theme is the CLOSED category, not an open label), niche (that's the Brand's
own vertical, e.g. "Life hacks, household tips & tricks" — Theme is per-Idea, not per-Brand).

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
Reel / image / carousel) — or, for a Space-less Recipe, the ready-to-record **script** with its **Shot
List** (ADR-0021) — **plus its tailored Copy** (caption, hashtags, mentions, CTA). It exists but is
**not yet published** — the Operator reviews it and publishes it. An Idea yields **one Asset per Recipe**
the Operator runs — several Assets if several Recipes are chosen.
_Avoid_: draft, content, creative, Creation (Magnific's own word), post (a Post is *published*).

**Copy** (a.k.a. Post Copy):
The tailored text that ships with one **Asset** — caption, hashtags, mentions, CTA. A **Recipe**'s
**copy step** composes it from the **Format**'s voice, the **Brand**'s hard rules (required CTA / hashtags,
banned words), and the **Idea**'s material, in the *shape* the Recipe's medium needs (a Reel caption vs a
carousel's per-card lines). **One Copy per Asset**, holding **one variant per targeted Channel platform the Recipe's own Copy
targets** (ADR-0025 — a Recipe declares its own compatible platform list; a Channel platform outside it
gets no variant) when the Brand targets more than one (`#129`) — each variant tuned to that platform's
own tone/length, composed from the SAME underlying material; a Brand with a single Channel still gets
exactly the one caption it always has. Composing is **not** the Space's job — the Space makes media only. (The watermark
@handle is **not** copy — it is a Space parameter, its value inherited from the Brand; ADR-0012.) A
single shared, parameterized step produces it; before this change it was a dropped, single-line
template.
_Avoid_: caption (that is only one part), post_copy (the old single throwaway field), Sign-off (that's
the script's own spoken closer — a different thing, see below).

**Sign-off** (a *News Short Script* Asset's own spoken closer):
The last spoken beat of a script, role `cta` in the beat order — **not** part of Copy, and not composed
by the copy step. Unlike Copy's own CTA, which must be fresh every time, a Sign-off deliberately
**rotates within a small fixed family** rather than being reinvented per script: a daily show earns
recognition through ritual repetition. Its content invites a comment/question about the viewer's own
life and how AI is affecting them, not a generic "follow us" (2026-08-12 grilling).
_Avoid_: CTA (ambiguous between this and Copy's own closer — say which one), outro.

**Shot List** (a script Asset's on-screen plan):
The per-beat plan that ships with a Space-less script **Asset** (e.g. *News Short Script*): for each
beat of the script, what to show on screen — the story's source page and its specific media,
**downloaded when possible** (video preferred), otherwise a clearly marked link. **No two beats in one
script repeat the same source page or the same site/company** — a Shot List must be distinct,
beat-to-beat. The Operator records and edits against it; re-using collected third-party media stays the
Operator's per-clip call. The produced script marks each beat's pairing inline with a `[Next shot]`
annotation — never spoken, a document marker only (2026-08-12 grilling).
_Avoid_: b-roll list, storyboard, assets (a **Brand Asset** is the Brand's own reusable media).

**Curiosity Queries** (a Shot List entry's research aid):
A short list of suggested search queries attached to one Shot List beat, meant to help the Operator find
better real source material for that beat — not content that appears in the video itself. Distinct from
the Shot List's own `source_url`/`media_url`/`show_cue`, which describe what the beat actually shows;
Curiosity Queries only exist to make finding that real material easier (2026-08-12 grilling).
_Avoid_: b-roll suggestions, research notes.

**Camera Hub Upload** (a *News Short Script* Asset's teleprompter-library offer):
For a produced *News Short Script* Asset, the **Producer** offers to upload its script (the SAME words as
`script.txt`, `[Next shot]` marker stripped) into Elgato Camera Hub's own teleprompter content library —
one JSON file per script plus a pointer list — so the Operator no longer copy-pastes it by hand before
recording. Offered conversationally, the SAME approval-before-action pattern the Schedule Batch offer
uses, and sweeps every not-yet-uploaded *News Short Script* Asset across every Run, never only the ones just
produced (no silent drops). Quitting Camera Hub first is the Operator's OWN manual step — the Producer
only verifies it, never scripts an automated quit; it does relaunch the app itself once its writes
succeed. Stamps a plain `camera_hub_uploaded_at` marker (mirrors `scheduled_at`: carries no lifecycle
meaning of its own — `status` is unchanged, no new `AssetStatus`). A failed upload never blocks the
Asset's produce/save step; `script.txt` stays available for manual copy-paste regardless (ADR-0027,
issue #189). Scoped to the *News Short Script* Recipe only — not a generic Recipe hook.
_Avoid_: Schedule Batch (that's Zoho/Zoho Social Brand-specific, images-only), export (this writes into a
third-party desktop app's own storage, not a file the Operator uploads elsewhere).

**Space** (Magnific Space; the media engine):
A pre-defined Magnific pipeline that generates the **media** a **Recipe** needs — a UGC-style video, an
image carousel, a Pixar-3D character Reel. A Space is **brand-agnostic**: any **Brand** can render
through it. A Space makes **media only** — it does **not** write the post's copy (that is the Recipe's
copy step). A **Recipe** drives one (or more) Spaces; each Space carries its own input contract (the
**Production Spec** shape) and its own **Execution Protocol**. A canvas takes **two typed inputs** —
**media slots** (filled by **Brand Assets** or idea-picks) and a **prompt node** (the Producer's authored
prompt; ADR-0016). Today one Space (the 9:16 character Reel) is wired.
_Avoid_: flow, template, pipeline (the Space *is* the pipeline); format (a Space is the media engine
inside a **Recipe**, not the editorial **Format**).

**Recipe** (a production plan; the shared unit of *making*):
The plan that turns one **Idea** into one **Asset** — which **Space** (or tools) generates the media, the
ordered steps to drive it, any human **pick-gate**, and the **copy step** that tailors the post's
caption / hashtags / mentions for this kind of content. A Recipe is **defined in OrganicGrowth's repo** — it names the
Space(s) and reads each Space's on-canvas run-points for the media, but owns the gates, the copy, and the
spec shape itself (ADR-0010) — plus its canvas's **two typed inputs** (media slots + a prompt node;
ADR-0016), its **Phase Contracts** (ADR-0017), and a producer **Skill** that authors the media prompt
(ADR-0018). The **Operator picks one or many** Recipes per
Idea (a Reel, a carousel, a meme…); each yields its own Asset → Post. A Recipe may drive **no Space at all** when its Asset is written words plus collected media (a
teleprompter script with its **Shot List**; ADR-0021). A Recipe is **brand-agnostic** and shared — the
per-Brand halves are the **Format** and idea generation. Today three Recipes are wired — **Character
Explainer with Cast** (cast → pick the **Character** → render), **News Carousel**, and **News Short
Script** (Space-less, ADR-0021) — per `src/recipe/registry.ts`'s registry, the single source of truth
for which Recipes are wired (never this document's own count).
_Avoid_: format (that is the editorial line), template, pipeline (a Space is a pipeline; a Recipe wraps
one), media output (that is the Recipe's *result*, not the plan).

**Producer**:
The agent that renders an accepted **Idea** into its **Assets** by running each chosen **Recipe** — for
each: running the Recipe's **Skill** to **author the media prompt** — its core craft, from the Brand's
rules, the Format's **Baseline Prompt**, and the Idea's brief — **binding media** into the canvas's slots,
driving the Recipe's **Space(s)** for the media (following the Space's on-canvas **Execution
Protocol**), pausing at the Recipe's **gates**, and running its **copy step**. It **self-audits** each
phase's output against that phase's **Phase Contract** before advancing (ADR-0017). A thin runner
configured by the in-repo **Recipe**. It **generates, never publishes**.
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

**Baseline Prompt** (a Format's per-Recipe look):
The **document** a **Format** holds for each **Recipe** it produces through — its **definitions** (card
styles, the pill/eyebrow text, logo placement, fonts), a **core structure example**, and **samples**. It
is the **look**, per **(Brand × Format)**, and lives as its own referenced file (not inline YAML). A
**Recipe Skill** reads and interprets it to author the media prompt (ADR-0015). *(Decided in map #70;
build pending.)*
_Avoid_: template, style guide (the Space's is separate), the Space's Execution Protocol.

**Brand Asset** (per-Brand reusable media):
Reusable **media** — image, video, or audio — a **Brand** stores under `data/brands/<slug>/assets/` (e.g.
`Brand_Logo`), committed to git and read via the `BrandAssetStore`. It fills a **Recipe**'s brand-asset
**media slots** at run time, reused every run — the media parallel of the Brand's watermark @handle text
parameter (ADR-0016). *(Decided in map #70; build pending.)*
_Avoid_: reference image (too narrow — assets are also video/audio), attachment.

**Media Slot & Prompt Node** (a Recipe's two typed canvas inputs):
The two kinds of input a **Recipe**'s canvas takes. A **media slot** is a named slot holding an image,
video, or audio — filled by a **Brand Asset** (reused) or an idea-pick (per Idea, from a gate), via a
named map the Recipe owns. A **prompt node** is the text the **Producer** authors to the Recipe's
contract. Authoring the prompt is the Producer's core craft; binding media is the second job (ADR-0016).
*(Decided in map #70; build pending.)*
_Avoid_: input, field (name the kind — media slot or prompt node).

**Phase Contract** (per-phase, checkable):
The **checklist** a production **phase**'s output must satisfy — author the prompt → bind media → gate →
render → copy → save, each with its own. The **Producer** self-audits its output against the phase's
contract before advancing (redraft, or STOP on a banned word / broken shape); a **QA** pass re-runs the
same checklist. Mechanical items stay as code (the spec validator, the copy check, the banned-word scan);
the rest are agent-judged (ADR-0017). This is OrganicGrowth's **observability** at production time.
*(Decided in map #70; build pending.)*
_Avoid_: validation (only the mechanical part is), test.

**Recipe Skill** (a Recipe's producer procedure):
The interpreting **Skill** the thin **Producer** runs for a Recipe (by the job's slug) — it reads the
Brand's rules + the Format's **Baseline Prompt** + the Idea's brief and **authors the media prompt** in
the baseline shape, self-checking against the author **Phase Contract** (ADR-0018). One per wired Recipe
(e.g. `produce-news-carousel`). *(Decided in map #70; build pending.)*
_Avoid_: producer.md (that thins to a conductor), instruction file (it is a Skill).

**Production Queue**:
The serialized backlog of Space generations the **Producer** owns. Because the single attended Operator
drives **one generation at a time** (ADR-0008), accepting an Idea **enqueues one job per chosen Recipe**
and the Producer works the queue in order. A job paused at one of its Recipe's **gates** does **not**
hold the Space: the Producer advances the next queued generation while the Operator decides, then resumes
that job once the pick is in. There is **one global queue across all Brands**; each job is keyed by
`(brand, idea, recipe)` so the Producer writes that **Asset** back to the right Brand's ledger.
_Avoid_: batch, backlog, jobs.

**Schedule Batch** (turning a Run's produced *News Carousel* **Assets** into scheduled **Posts**):
For a Run's produced, not-yet-posted *News Carousel* Assets, the **Producer** offers it once they are
produced, and runs it only after the Operator approves — in the same conversation — every one of that
Run's generated outputs and captions; that approval is conversational only, never written to the ledger.
**Since ADR-0020, Zoho's own MCP tools are the PRIMARY mechanism** (never Zoho's own Approval workflow),
with `/export-schedule`'s CSV/S3 bundle (hosted JPGs, one CSV per configured **Zoho Social Brand**, a
manifest) retained as the explicit **FALLBACK** for when MCP is unavailable, and always for X. Either
way, exporting/scheduling stamps `scheduled_at`; `status` stays `produced` (ADR-0011's lifecycle is
unchanged) until `/log-post` or a later confirmed-live check. Hosting media and writing files is
**not publishing** — the Operator still uploads the CSVs to Zoho Social and reviews the queued posts
there before they go live, a second, distinct human step (the **Publish** gate stays human; ADR-0002)
— MCP path aside, where that same pre-schedule approval stands in instead (ADR-0020 — the
CSV-upload-as-gate model is retired there). X stays CSV/manual always because Zoho's own MCP guidance
warns posting to X that way risks the account being flagged as a bot.
_Avoid_: batch (too generic — this is Zoho-specific), export / CSV export (name the mechanism — MCP or
CSV — since one is the default and the other the fallback, and a Schedule Batch is more than a file
dump: hosted media, CSVs, and a manifest, together, or the MCP path's own hosted-media/upload/validate/
schedule sequence).

**Zoho Social Brand** (Zoho's own account container):
Zoho Social's container of connected platform accounts — **not** an OrganicGrowth **Brand**. One
OrganicGrowth Brand's **Channels** can span several Zoho Social Brands (e.g. Straw Motion's Facebook/
Instagram/TikTok live in one, its LinkedIn/X in another), each with its own exact Zoho channel labels
(e.g. `LinkedInProfile`, never `LinkedIn`) and its own configured clock — read from the Brand Profile's
per-Brand Zoho config (`loadZohoConfig`), never hardcoded. A **Schedule Batch** writes one CSV per Zoho
Social Brand grouping.
_Avoid_: Brand (that's the OrganicGrowth tenant), Channel (that's the account/Page a Brand publishes to).

**Post**:
The published content on a **Channel** — the Operator publishes an **Asset** to create it; the unit
OrganicGrowth measures. Its own record, keyed `(Asset, Channel)` (ADR-0028, issue #201 — reversing
ADR-0011's earlier choice to keep it as scalar fields on the Asset). An Asset yields **zero Posts** if
never published, and **at most one Post per Channel** it is actually published to — so an Idea yields
one Post per (Recipe, Channel) the Operator actually posted to. Attribution is always explicit
(always-rule 5): the Asset's own `(Idea, Recipe)` link, plus the Post's own `(Asset, Channel)` link.
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

- The **Operator** launches a **Run** for one of a Brand's **Formats** at that Format's cadence (weekly or daily — ADR-0022), using that Format's own sources, voice, and idea count
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
- **Who owns what at production time (map #70):** the **Recipe** (in-repo) owns the gates, the spec shape,
  the canvas's **two typed inputs** (media slots + a prompt node), its **Phase Contracts**, and its
  producer **Skill**; the **Format** owns the **Baseline Prompt** (the look); the **Brand** owns its
  **Brand Assets** + hard rules; the thin **Producer** binds all three into the shared canvas and
  self-audits each phase. Drawn in
  [`docs/architecture/recipe-and-format-model.md`](docs/architecture/recipe-and-format-model.md).
  *(Decided, build pending.)*

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
- **the look (Baseline Prompt) vs the Space** — the **Baseline Prompt** is the *visual recipe* (card
  styles, the pill/eyebrow, logo rules) a **Format** holds as a document and a **Recipe Skill** interprets
  into the prompt; the **Space** is the media *engine* that renders that prompt. The look lives in the
  Format (per Brand × Format), never on the shared Space or Recipe (ADR-0015).
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
