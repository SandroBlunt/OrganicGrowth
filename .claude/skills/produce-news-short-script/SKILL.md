---
name: produce-news-short-script
description: >
  Use when the thin Producer runs a Production Queue job whose Recipe is "news-short-script". Authors
  one News Short Script Asset's teleprompter script + Shot List from an accepted Idea's brief plus the
  Format's Baseline Prompt document — the Recipe's core craft (ADR-0018) — self-checks the result
  against the author-phase checklist, and emits the Production Spec through the spec store. Does NOT
  drive a Space: this Recipe has none (ADR-0021) — the thin Producer collects the Shot List's media
  instead.
---

# Produce: news-short-script

You author one **News Short Script** Asset's teleprompter script and its **Shot List** (CONTEXT.md
"Shot List") — the News Short Script Recipe's core craft (ADR-0018). You read three inputs, write the
beats (hook -> one-or-more story beats -> cta), self-audit against the author-phase checklist, and emit
the Production Spec through the spec store. **You do not drive a Space** — this Recipe has none at all
(ADR-0021: `docs/adr/0021-space-less-recipe-script-assets.md`). Instead of a canvas render, the thin
Producer's own "render" step for this Recipe is collecting the Shot List's media
(`src/asset/shot-list-media.ts`'s `collectShotListMedia`) — a separate step, run AFTER your Spec is
saved. You **generate, never publish** (always-rule 1).

**Leading idea — fast, plain, and grounded, never invented.** Every beat's teleprompter line reads
naturally aloud in ~2.3-2.7 words per second (the ~120-150-word, 45-60-second target). Ground every
claim in the Idea's brief; a beat's `media_url`, when you set one, names the SPECIFIC clip you identified
(video preferred — the actual footage, not a generic thumbnail or the bare source page) — leave it unset
when nothing specific is identifiable, never guess one.

## Inputs — load all three; STOP if the baseline document or the brief is missing

1. **Brand hard rules** — `data/brands/<slug>/brand-profile.yaml`, read via
   `src/production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules`: banned words, required
   CTA/hashtags. (Copy — the YouTube title + description — is composed later, out of this Recipe's
   render step entirely, by this Recipe's own copy step; ADR-0012. There is no watermark step here —
   this Recipe has no canvas to set one on.)
2. **The Format's Baseline Prompt document** — resolve it via `src/format/store.ts`'s `loadFormat` then
   `src/format/baseline-prompt.ts`'s `loadBaselinePrompt(brand, format, "news-short-script")`. This
   document is your target voice/delivery style (the Format's editorial treatment for THIS Recipe).
   **Read it every run and follow its style — never reconstruct it from memory.** If
   `loadBaselinePrompt` returns `found: false` (any reason — `"not-declared"`, `"malformed"`, or
   `"dangling"`), **STOP** and report the reason; never author a script without it.
3. **The Idea brief** — the accepted Idea's angle, hook concept, talking points, and sources
   (`data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`). If the brief cannot be read, **STOP** and
   report; never invent one.

## Steps

### 1. Write the beats: hook -> one-or-more story beats -> cta

Fixed role order (`src/production-spec/news-short-script-contract.ts`'s `NEWS_SHORT_SCRIPT_ROLES`):
exactly one `"hook"` beat first, at least `MIN_STORY_BEATS` `"story"` beats in the middle, exactly one
`"cta"` beat last. For each beat, decide:

- **text** — the teleprompter line for THIS beat, in the Format's own delivery style (the Baseline
  Prompt document's voice). Never an em dash, en dash, or a hyphen used as a sentence dash — write
  separate short sentences instead (issue #108's rule, shared by every Recipe's text).
- **source_url** — the story's source page (always required, even when no specific media is
  identifiable). **Prefer the PRIMARY source** (Operator rule, 2026-08-11): the brief's marked
  original — official announcement or original-reporting outlet — never an aggregator/digest link
  when the brief lists a primary; this is the URL the Operator puts on screen while recording.
- **media_url** — the specific media URL for this beat's show cue, ONLY when you can identify one (video
  preferred). Leave it unset otherwise — the Shot List then falls back to `source_url` as its reference
  link, marked accordingly.
- **show_cue** — a one-line description of what to show on screen for this beat (CONTEXT.md "Shot
  List") — concrete enough for the Operator to record or edit against.

Completion: hook first, cta last, at least `MIN_STORY_BEATS` story beats between them, every beat's
`text`/`source_url`/`show_cue` non-empty, and the WHOLE script's total word count (summed across every
beat's `text`) lands in `MIN_TOTAL_WORDS`-`MAX_TOTAL_WORDS` (120-150 words, the ~45-60-second target).

### 2. Self-audit against the author-phase checklist

Run `src/production-spec/news-short-script-validate.ts`'s `validateNewsShortScriptSpec(spec)` and
`src/production-spec/news-short-script-brand-safety.ts`'s
`scanNewsShortScriptForBannedWords(spec, bannedWords)` against your beats. Fix and re-audit any miss.
**A banned word is REJECT-ONLY — STOP and report; never silently swap it for another word** (always-rule
6/9). This is the SAME pair of checks `src/recipe/phase-contract.ts`'s `auditAuthorPhase` runs generically
via this Recipe's own `specShape` — running them yourself here is the SAME check, not a second one.

Completion: both checks return `ok: true`.

### 3. Emit the Production Spec through the spec store

Shape the result to `src/production-spec/news-short-script-contract.ts`'s `NewsShortScriptSpec`
(`{ beats: [{ role, text, source_url, media_url?, show_cue }] }`, ordered hook -> story* -> cta) and
write it via `src/production-spec/store.ts`'s `saveSpec` to the path
`specPathFor(ideaId, run, ideasRoot, "news-short-script")` —
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.news-short-script.spec.json`, sitting beside the Brief.

Completion: the Spec passes both checks from step 2 and is saved at that path.

## Author-phase checklist (also re-run, unchanged, by a QA pass)

- Exactly one `"hook"` beat first, exactly one `"cta"` beat last, at least one `"story"` beat between
  them.
- Every beat has a non-empty `text`, `source_url` (an http(s) URL), and `show_cue`; `media_url`, when
  present, is also an http(s) URL.
- The WHOLE script's total word count (every beat's `text`, summed) falls in 120-150 words.
- No banned word in any beat field (`text`, `source_url`, `media_url`, `show_cue`) — reject-only, never a
  silent swap.
- *(Agent-judged — flagged for review, never auto-failed; ADR-0017.)* Each beat's `text` reads naturally
  aloud, fast-paced, grounded in the brief; a set `media_url` names the specific identified clip, never a
  guess.

## What this Skill does not do

- It does not run any Space, drive a canvas, or call any `spaces_*`/`creations_*` tool — this Recipe has
  no Space at all (ADR-0021). The thin Producer's OWN "render" step for this Recipe — collecting the
  Shot List's media (`src/asset/shot-list-media.ts`) — runs separately, AFTER your Spec is saved.
- It does not compose the Copy (the YouTube title + description) — that is this Recipe's own copy step,
  run separately, out of this Recipe's render step entirely (ADR-0012).
- It does not set a watermark `@handle` — this Recipe has no canvas parameter node to set one on.
- It does not publish anything, ever (always-rule 1; ADR-0002).
