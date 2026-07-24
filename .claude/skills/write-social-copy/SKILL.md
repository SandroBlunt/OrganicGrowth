---
name: write-social-copy
description: >
  Use when the thin Producer runs ANY Recipe's shared, out-of-canvas copy step (ADR-0012) — the
  Skill named by that Recipe's `copySkill` field (`src/recipe/registry.ts`; both wired Recipes name
  this one today). Composes one Asset's Copy, in the resolved Format's own voice, from the Brand's
  hard rules, the Idea's material, and — once the media exists — what was actually produced: for a
  multi-slide Recipe, the saved Production Spec's own per-slide narrative, sharpened into the
  caption's plain-language recap. When the Brand targets more than one Channel platform, composes ONE
  variant per targeted platform (issue #129), each in that platform's own tone/length. Hands off to
  the SAME deterministic checkers every Copy already goes through (`injectRequiredParts` then
  `validateCopy`/`validateCopyForPlatform`). Does NOT run the Space, pick a gate, or touch the
  rendered media — the Producer drives the canvas separately, before this Skill ever runs.
---

# Write: social copy

You compose one **Asset**'s **Copy** — the caption + hashtags a Recipe's shared, out-of-canvas copy
step produces (CONTEXT.md "Copy"; ADR-0012) — the copywriting counterpart to a Recipe's own
media-authoring Skill. Where an author Skill (`produce-news-carousel`, `produce-character-explainer`)
writes the Production Spec that drives the Space, THIS Skill writes the text that ships ALONGSIDE the
rendered media once it exists. When the Brand targets more than one Channel, you compose ONE Copy
**variant per targeted platform** (CONTEXT.md "Channel"; ADR-0019, issue #129) — the SAME underlying
Idea/Spec material, tuned per platform's own tone/length. You **generate, never publish** (always-rule
1; ADR-0002).

**Swappable, mirroring the per-recipe author Skills.** The thin Producer resolves you by slug from the
job's Recipe: `getRecipe(job.recipe).copySkill` (`src/recipe/registry.ts`) — never hard-coded in
`producer.md`'s own prose. Both wired Recipes (`character-explainer-with-cast`, `news-carousel`) name
`write-social-copy` today; a Recipe with genuinely different copywriting needs could point its own
`copySkill` at a different Skill slug without touching this file, the other Recipe's config, or the
Producer's own conductor prose.

## Inputs — load what's available; nothing here ever blocks a run by itself

1. **Brand hard rules** — `data/brands/<slug>/brand-profile.yaml`, read via
   `src/production-spec/brand-profile.ts`'s `loadCopyRules`: the required CTA, the required hashtags,
   and the banned words every composed Copy must respect (ADR-0012).
2. **The resolved Format's voice** — how this caption should read (`FormatFile.voice`,
   `src/format/store.ts`).
3. **The Idea's material** — its title/hook, angle, and own hashtag set (`src/copy/draft.ts`'s
   `CopyInput`, which drafts the `Copy` shape — `{ caption, hashtags }` — defined in
   `src/copy/contract.ts`).
4. **What was actually produced, once the media exists** — Copy composes LATE, in the Operator's
   session, after the render (and any picked Character) exists, so it can refer to the REAL result
   (ADR-0012). For a single-media Recipe this is free text (`CopyInput.mediaContext`, e.g. the picked
   Character's name) plus, when that Recipe's Spec names any, `CopyInput.companies` — for the
   Character Explainer with Cast Recipe, that Recipe's saved Production Spec's own top-level
   `companies` field, threaded through unchanged by `character-explainer-companies.ts`'s
   `characterExplainerCompanies` (issue #125). For a multi-slide Recipe (e.g. News Carousel) this is
   richer: the saved Production Spec's own per-slide `role`/`text`/`stat_callout`/`companies`
   (`CopyInput.slideNarrative`, an array of `CopySlideBeat`) — the ACTUAL authored narrative, not a
   re-guess from the brief. A beat's `companies` (issue #120) is that slide's own, already-verified
   real-companies/products list — the SAME list that drives the rendered slide's own logo row — carried
   through unchanged, including an empty array when a slide names no real company.
   `CopyInput.companies` (issue #125) is the SAME kind of data at the WHOLE-Asset grain instead: the
   Character Explainer Recipe has no per-clip/per-beat narrative to attach a company list to (its 3
   clips are one continuous story about the same picked Character), so its Production Spec records
   `companies` once, for the whole Asset.
5. **The chosen Recipe's own copy shape** — `Recipe.copyShape` (`maxChars`/`minEmojis`/`maxEmojis`) —
   never a fixed 180-char/1-3-emoji constant; a different Recipe declares its own bounds.
6. **The Brand's targeted Channel platforms** (ADR-0019, issue #129) — the Brand Profile's FULL
   `channel` list, read via `src/production-spec/brand-profile.ts`'s `channelsFrom`/`loadChannels`:
   every entry's `platform`, not just the one marked `primary`. This is what tells you HOW MANY
   variants to compose — one per targeted platform, including the primary — and, for each non-primary
   one, which platform's own bounds (`src/copy/platform-shape.ts`'s `resolveCopyShapeForPlatform`) to
   write and check it against.

## Steps

### 1. Draft the caption(s) — one per targeted platform, sharpening the produced narrative, never a generic restatement of the brief

Write the caption(s) yourself, in the resolved Format's own voice. This is your job as the LLM — never
a fixed template.

**When the Brand targets more than one Channel** (its `channel` list has more than one entry — e.g.
Straw Motion's facebook/instagram/linkedin/x/tiktok), draft a DISTINCT caption for EACH targeted
platform from the SAME underlying Idea/Spec material below — never one shared caption copy-pasted into
every platform's slot. Tune each variant's tone and length to that platform's own conventions (the
primary Channel keeps writing in the Recipe's own established voice/length; a non-primary platform's
`maxChars`/`minEmojis`/`maxEmojis` come from `resolveCopyShapeForPlatform`, e.g. LinkedIn reads
longer-form and more professional with little/no emoji, X is tight and punchy, TikTok is short and
playful). Naming a company/product naturally in your own prose is fine (it reads better) — but turning
that into a literal, real `@Name` tag is NOT your call to make: a deterministic step (below) resolves
which companies/products actually get tagged, from the Spec's own data, never from your prose or your
own guess at a handle. When the Brand targets exactly one Channel, this is unchanged: draft the one
caption exactly as before.

- **When `slideNarrative` is available (a multi-slide Recipe, once the media exists):** sharpen the
  ACTUAL produced on-slide narrative — open on the `"hook"` beat, carry the concrete `"shift"` (what
  changed) through the middle, and close on the `"cta"` beat — into a plain-language recap of what
  happened and what it means, exactly the comprehension standard the Baseline Prompt's own "7-slide
  narrative" formula sets for the on-slide lines themselves (epic #106 item 6). This is sharpening
  real, already-authored content — never re-deriving a caption from the brief alone, and never
  inventing a fact the produced on-slide narrative doesn't already contain.
- **Name the real companies/products, grounded in `companies`** (issue #120, issue #125): wherever the
  Format's voice naturally allows it, name the companies/products the Production Spec's own `companies`
  data actually records — for a multi-slide Recipe, a beat's own `companies` list
  (`CopySlideBeat.companies`); for a single-media Recipe like Character Explainer with Cast, the
  Asset-level `CopyInput.companies`. Either way this is the Production Spec's own, already-verified
  list, not a re-guess from the brief's prose. At either grain, `companies` being empty or absent
  contributes NO company/product mention — never invent or re-guess one from the title/angle/
  mediaContext when the produced Spec doesn't name one. This is the SAME "grounded, never invented"
  standard the News Carousel author phase's own `companies-cited` checklist item already holds the
  on-slide `image_prompt` to (`production-spec/news-carousel-author-checklist.ts`) — the caption's own
  wording is your judgment call as the LLM (never a fixed template); only which companies exist to draw
  on is fixed by the data.
- **When no slide narrative is available (a single-media Recipe):** draft from the Idea's `title`,
  `angle`, and `mediaContext` — richer than a bare title-only restatement, still grounded only in the
  supplied material, never invented.
- **Never an em dash, en dash, or a hyphen used as a sentence dash** (issue #108) — write separate
  short sentences instead. An ordinary hyphenated word (`state-of-the-art`) is unaffected.
- **Close on a FRESH engagement CTA every time — never a canned, repeated line (Operator QA,
  2026-07-22).** End the caption by inviting the reader to *comment their thoughts* or *follow for
  more*, paraphrased in a new, catchy way for THIS story — tie it to the specific topic (a real
  question they'd want to answer, or a reason to follow that names what they keep getting). Do NOT
  reuse a fixed, mechanical closer across posts — the boilerplate `"Swipe through the 7-slide
  breakdown 👉"` (and any near-identical variant) is the exact anti-pattern the Operator flagged as
  repetitive; it must not appear again. Vary the phrasing, the ask (comment vs. follow), and the emoji
  (0-2, within `copyShape`) from one Asset to the next, the same way the Baseline Prompt's cta-role
  close line is varied per story. Examples of the *shape* (write a new one each time, never copy
  these): "Would you actually put this on your desk? Tell us in the comments." / "Yes or no in the
  comments: would you let it?" / "Follow Straw Motion for the plain read on every big AI move."
- Carry the Idea's own hashtags through unchanged into the drafted Copy's `hashtags` — the Brand's
  required hashtags are injected separately, deterministically, in the next step.

`src/copy/draft.ts`'s `skillDraftCopy` is this step's deterministic, testable proof: given the SAME
`CopyInput`/`CopyShape` this Skill reads, it produces a `Copy` demonstrating exactly this behavior
(sharpens `slideNarrative`'s hook/shift/cta beats when present; falls back to
title/angle/mediaContext otherwise; never a dash tell) — the same relationship
`production-spec/generate.ts`'s deterministic composer has to a Recipe's author Skill. It also proves
each beat's `companies` field is genuinely AVAILABLE to a drafter, mechanically (issue #120) — a
`slideNarrative` carrying `companies` never changes `skillDraftCopy`'s own deterministic output, since
naming companies naturally in the caption's wording is YOUR job as the LLM, not something a fixed
template can prove; only that the data is there to draw from is mechanically checked. The SAME proof
covers `CopyInput.companies` at the whole-Asset grain (issue #125): present, empty, or absent, it never
changes `skillDraftCopy`'s (or `defaultDraftCopy`'s) own output either.

### 2. Hand off to the deterministic checker — never check your own work by eye

1. **Inject the Brand's required parts deterministically, into EVERY variant** — `src/copy/inject.ts`'s
   `injectRequiredParts` appends the required CTA/hashtags from the Brand Profile when absent, and
   dedupes when they're already present. You do not write this step's logic; you call it — once per
   targeted platform.
2. **Resolve and weave LinkedIn `@mention`s, for the LinkedIn variant only (issue #130).** For a targeted
   platform whose `platformCopyShapeFor(platform)?.supportsMentions` is `true` (today: `linkedin`
   alone), call `src/copy/linkedin-mentions.ts`'s `weaveLinkedInMentions(caption, input,
   linkedInHandlesPath?)` on that variant's already-injected caption, BEFORE checking it. It gathers
   every company/product named in the Spec's own structured companies data
   (`CopyInput.companies`/`CopySlideBeat.companies` — never free prose, never a company you merely
   mentioned in your own drafted prose), resolves each through issue #126's committed lookup
   (`src/linkedin-handle/store.ts`'s `resolveLinkedInHandle`), and weaves in the literal text the
   Operator will select from LinkedIn's own compose-box dropdown when typing: `@Name` (the plain
   company/product name, never the raw handle slug) for every name that resolves, or the plain name —
   flagged, via the returned `unresolvedMentions`, for Operator review — for every name that doesn't.
   Zero companies is a no-op: the caption comes back byte-for-byte unchanged. This is a fully
   deterministic step you hand off to, never your own hand-written or guessed `@mention`.
3. **Check each variant against ITS OWN platform's bounds:**
   - the PRIMARY Channel's variant: `src/copy/validate.ts`'s `validateCopy` against the chosen Recipe's
     OWN `copyShape` — exactly as before this slice; the primary Channel NEVER consults
     `platform-shape.ts`'s own bounds table (issue #128 AC3's rule).
   - every OTHER (non-primary) targeted Channel's variant: `validateCopyForPlatform(copy, platform,
     recipe.copyShape, rules)` — resolves that platform's own documented bounds
     (`resolveCopyShapeForPlatform`, falling back to the Recipe's own `copyShape` for a platform
     `platform-shape.ts` doesn't document) and additionally checks LinkedIn's inline `@mention` TEXT
     SYNTAX only (never a lookup — the RESOLUTION already happened in step 2 above) when the platform is
     LinkedIn. Check the FINAL, mention-woven caption from step 2, not the pre-weave draft.
   - Every check covers: caption length, emoji count, required CTA present, required hashtags present,
     no banned word, and no em dash/en dash/spaced hyphen (issue #108) — in the caption or any hashtag.
   - `src/copy/compose.ts`'s `composeCopyForChannels` is this step's own deterministic, testable proof:
     given the SAME `CopyInput`/`baseShape`/Channel list this Skill reads, it runs exactly this
     draft → inject → weave mentions → validate sequence per targeted platform and returns a `Copy`
     carrying every variant, labeled, each LinkedIn variant's `unresolvedMentions` (when non-empty) —
     a single-Channel Brand's result is provably identical to `composeCopy`'s own single-variant output
     (AC1/AC5).
4. **Redraft on a soft miss** (e.g. wrong emoji count, over length) and re-check — per platform; a miss
   on ONE platform's variant never silently drops that platform, and never blocks a variant that
   already passed. **A banned word OR a dash tell is REJECT-ONLY — STOP and report; never silently swap
   the offending word or rewrite it for the model.** This mirrors the SAME reject-only contract every
   Recipe's author-phase banned-word scan already follows (always-rule 6/9). An unresolved LinkedIn
   mention is NEVER reject-only — it falls back to plain text and is flagged, but never blocks the
   caption (issue #130 AC2).

Completion: every targeted platform's variant passes its own check — `validateCopy(...).ok` for the
primary, `validateCopyForPlatform(...).ok` for each non-primary one (confirmed by `auditCopyPhase`,
`src/recipe/phase-contract.ts`, the Producer's own phase self-audit, run against the primary variant —
the Recipe's own copy-phase contract). Save the composed Copy onto the Asset with `caption`/`hashtags`
set to the PRIMARY Channel's own variant and, when more than one platform was targeted, `variants`
carrying the full, platform-labeled set (`src/copy/contract.ts`'s `Copy.variants`) — a single-Channel
Brand's saved Copy carries no `variants` field at all, unchanged. The LinkedIn variant's own
`unresolvedMentions` (issue #130), when non-empty, is saved right there on that `CopyVariant` — it flows
into the output bundle's `caption.txt`, flagged for Operator review, automatically.

## What this Skill does not do

- It does not run the Space, drive a canvas, pick a gate, or call any `spaces_*`/`creations_*` tool —
  the Producer already drove the Recipe's canvas to a finished render (or a paused gate's pick) BEFORE
  this Skill ever runs; composing Copy is a separate, later, out-of-canvas step (ADR-0012).
  Sharpening the on-slide narrative into the caption never means re-rendering or editing the media
  itself — the rendered pixels are already final by the time this Skill runs.
- It does not author the Production Spec or the media prompt — that is the Recipe's OWN
  media-authoring Skill (`produce-news-carousel`, `produce-character-explainer`), run earlier, in a
  separate step.
- It does not set the watermark `@handle` — that is a Space parameter, a Brand-wide value, never part
  of Copy (ADR-0012).
- It does not hand-pick or guess which company/product gets a real `@Name` LinkedIn mention — that
  decision is issue #130's deterministic `weaveLinkedInMentions` (step 2 above), built on the separate
  `src/linkedin-handle/` lookup (`resolveLinkedInHandle`). You may name a company/product naturally in
  your own drafted prose, but you never yourself resolve it to a handle or decide it's "tagged" — the
  Skill hands off to that step, which is the ONLY place a resolved vs. unresolved company/product is
  decided, from the Spec's own structured companies data.
- It can never make a `@mention` a real, clickable LinkedIn tag itself — only a human, picking the name
  from LinkedIn's own compose-box dropdown at typing time, does that (the confirmed platform
  constraint). This Skill (and `weaveLinkedInMentions`) can only ever hand the human the exact name to
  pick.
- It does not track or publish to any non-primary Channel — composing a platform-tuned variant is not
  the same as OrganicGrowth publishing there itself; publishing every Channel stays 100% manual
  (ADR-0019), and performance tracking stays scoped to the one `primary` Channel (a deliberate future
  epic).
- It does not publish anything, ever (always-rule 1; ADR-0002). A human reviews the saved Copy (every
  variant, labeled by platform) at the Publish gate and posts each to its own Channel.
