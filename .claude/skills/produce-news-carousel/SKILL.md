---
name: produce-news-carousel
description: >
  Use when the thin Producer runs a Production Queue job whose Recipe is "news-carousel". Authors
  one News Carousel Asset's 7-slide image prompts from an accepted Idea's brief plus the Format's
  Baseline Prompt document — the Recipe's core craft (ADR-0018) — self-checks the result against
  the author-phase checklist, and emits the Production Spec through the spec store. Does NOT run
  the Space: the Producer injects the emitted Spec into the canvas and drives it.
---

# Produce: news-carousel

You author one **News Carousel** Asset's 7 slide image prompts — the News Carousel Recipe's core
craft (CONTEXT.md "Recipe Skill"; ADR-0018). You read three inputs, derive the 7-slide narrative,
assemble each slide's `image_prompt` from the Format's Baseline Prompt template, self-audit against
the author-phase checklist, and emit the Production Spec through the spec store. **You do not run
the Space** — the thin Producer injects your emitted Spec into the "JSON Master" node
(`src/recipe/registry.ts`'s `NEWS_CAROUSEL.canvasInputs.promptNode`; node name verified against the
live capture, issue #86/#89) and drives the canvas (issue #88). You **generate, never publish**
(always-rule 1).

**Leading idea — grounded, not invented.** Every slide names real products, logos, and actions
where it reports something real. Only a feeling, an outcome, or a prediction uses a described
photographic scene of the reader's world instead. Never invent a UI and present it as a real
product's actual screen — where no real screen can be had, describe a believable, generic
interface, and never claim it belongs to a named product.

## Inputs — load all three; STOP if the baseline document or the brief is missing

1. **Brand hard rules** — `data/brands/<slug>/brand-profile.yaml`, read via
   `src/production-spec/brand-profile.ts`'s `loadBannedWords`/`loadCopyRules`: banned words, the
   watermark @handle, required CTA/hashtags. (Copy is composed later, out of the canvas, by this
   Recipe's own copy step — not by this Skill; ADR-0012.)
2. **The Format's Baseline Prompt document** — resolve it via `src/format/store.ts`'s `loadFormat`
   then `src/format/baseline-prompt.ts`'s `loadBaselinePrompt(brand, format, "news-carousel")`. This
   document is your target shape: its definitions (the confirmed card styles, the logo rule, the
   pill/eyebrow badge, the font notes), a core worked example, and samples. **Read it every run and
   reproduce its fixed clauses verbatim — never reconstruct them from memory.** If
   `loadBaselinePrompt` returns `found: false` (any reason — `"not-declared"`, `"malformed"`, or
   `"dangling"`), **STOP** and report the reason; never author a prompt without it.
3. **The Idea brief** — the accepted Idea's angle, hook concept, talking points, and sources
   (`data/brands/<slug>/ideas/<format>/<run>/idea-NN.md`). If the brief cannot be read, **STOP** and
   report; never invent one.

## Steps

### 1. Derive the 7-slide narrative

Fixed role order (`src/production-spec/news-carousel-contract.ts`'s `CAROUSEL_ROLES`): **hook →
then → shift → proof → different → next → cta.** Each role has a fixed job, defined as a copy
formula in the Baseline Prompt document's "The 7-slide narrative" section — read it now. Before
deciding any slide's content, write one line per role, grounded in the brief, following that role's
formula: what THIS story's hook is, what THIS story's "then" is, and so on through cta. Only once
all 7 lines are drafted, move on to deciding each slide's full content below.

For each slide, decide:

- **text** — the on-slide supporting line, in the Format's voice, at most
  `CAROUSEL_TEXT_MAX_CHARS` (140) characters (the role label itself is never on-slide text and
  never counts toward the limit). Never an em dash, en dash, or a hyphen used as a sentence dash
  (" - ", spaces on both sides) — write separate short sentences instead; it is an AI "tell" and
  hurts scannability. An ordinary hyphenated word (`state-of-the-art`) is fine.
- **stat_callout** — a short, bold pulled figure or phrase (e.g. `"3 companies."`). Same dash rule as
  `text` above.
- **subject** — before writing this, pull the specific facts (names, numbers, claims) straight out
  of the idea's brief for this slide and list them. Build the subject only from those facts plus
  the Baseline Prompt document's new Subject rules: the real product/logo/action (or the real,
  named person, if the story is clearly theirs) where the slide reports something real; an equally
  concrete, specific photographic scene of the reader's world for a feeling, an outcome, or a
  prediction. Never fall back to something generic.
- **card_style** — one of the Baseline Prompt document's confirmed placements (all 7 in its Examples
  section are confirmed, working options — none are historical-only). Vary it across the carousel's
  7 slides for visual range; never default to repeating the same one or two placements.
- **companies** — the real company names this slide's logo row shows, as a plain list (e.g.
  `["OpenAI", "Anthropic"]`) — or `[]` when this slide names no real company. A real field, not a
  fact left only inside the prose (issue #102 finding #1); the count and names may — and should —
  vary slide to slide with what the brief actually supports, never padded to match another slide.
- **logo edge** — whichever edge the chosen `card_style` does not occupy.
- **inset** — an optional circular detail shot; include only when it earns its place, never on
  every slide by default.

Completion: all 7 roles have a ≤140-char `text`, a non-empty `stat_callout`, a grounded subject,
a confirmed `card_style`, and a `companies` list consistent with what that slide's image_prompt
actually shows.

### 2. Assemble each slide's image_prompt

Build each `image_prompt` from the Baseline Prompt document's own reusable template: swap **only**
the bracketed, per-shot parts (subject, the card clause, the stat, the supporting line, the
`companies` logo row — omitted entirely when `companies` is `[]` — the optional inset). Keep every
**fixed clause verbatim** from the
document — the logo guardrail (cited by the document's own reference-image name, laid along the
free edge, rendered unaltered, a vignette behind it), the pill/eyebrow badge with its
never-all-caps guardrail, the font notes, and the closing style line. Start from the document's own
worked example for the `card_style` you chose.

**Aspect ratio and model are the canvas's own settings — never write them into the prompt.**

Completion: 7 prompts, each carrying every one of the document's fixed clauses verbatim and its
own per-slide brackets filled in.

### 3. Self-audit against the author-phase checklist

Run `src/production-spec/news-carousel-author-checklist.ts`'s
`auditNewsCarouselAuthorPhase(spec, bannedWords, baseline, documentText)` against your 7 slides,
where `baseline` (a `NewsCarouselBaselineParams`) is built from the SAME Baseline Prompt document
you just read — its own `logoReferenceName`, `pillText`, `neverAllCapsInstruction`, `fixedClauses`,
and `confirmedCardStyles` — **never a value read from a different Brand/Format's document.** Pass
`documentText` too — the raw text of that same document, unmodified — so the checklist can verify
your hand-copy actually matches it; nothing else catches a stale or mistyped copy. Fix and re-audit
any miss. **A banned word is REJECT-ONLY — STOP and report; never silently swap it for another
word** (always-rule 6/9).

Completion: `auditNewsCarouselAuthorPhase(...).ok` is `true`.

### 4. Emit the Production Spec through the spec store

Shape the result to `src/production-spec/news-carousel-contract.ts`'s `NewsCarouselSpec`
(`{ slides: [{ slide_index, role, card_style, stat_callout, text, companies, image_prompt }] }`,
ordered by role — `companies` is the real company names cited in that slide's own logo row, or `[]`
when the slide names none) and independently confirm it with
`src/production-spec/news-carousel-validate.ts`'s
`validateNewsCarouselSpec`. Write it via `src/production-spec/store.ts`'s `saveSpec` to the path
`specPathFor(ideaId, run, ideasRoot, "news-carousel")` —
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.news-carousel.spec.json`, sitting beside the
Brief. The rich reasoning (why this subject, why this card) stays in your working notes, not the
saved Spec (ADR-0015: the richness lives in the document, the stored Spec stays thin).

Completion: the Spec passes BOTH `validateNewsCarouselSpec` and `auditNewsCarouselAuthorPhase`, and
is saved at that path.

## Author-phase checklist (also re-run, unchanged, by a QA pass)

- Exactly 7 slides, roles in fixed order: hook, then, shift, proof, different, next, cta.
- Each `text` at most 140 characters.
- Each `image_prompt` references the Baseline Prompt document's own logo reference name.
- Each `image_prompt` contains the document's pill/eyebrow text and its never-all-caps
  instruction.
- Each `image_prompt` keeps every other fixed Baseline Prompt clause verbatim (the logo guardrail,
  the card clause, the card-text clause, the closing style line).
- Each `image_prompt` has a grounded subject — a real product/logo/action, or an intentional
  photographic scene; never an invented UI shown as a real product's own screen. *(Agent-judged —
  flagged for review, never auto-failed; ADR-0017.)*
- `card_style` is one of the document's own confirmed styles; `stat_callout` is non-empty.
- Every company named in a slide's `companies` field is cited in that same slide's `image_prompt`
  (a slide naming no real company skips the logo row entirely — issue #102 finding #1).
- No banned word in any field — reject-only, never a silent swap.
- No em dash, en dash, or hyphen used as a sentence dash in any slide's `stat_callout`/`text` —
  reject-only; rewrite as separate short sentences instead (issue #108). `image_prompt` is not
  checked — the Baseline Prompt's own fixed clauses legitimately contain em dashes.
- When the raw document text is supplied: every hand-copied baseline fact (logo name, pill text,
  caps guardrail, fixed clauses) actually appears, verbatim, in that document (issue #102).

## What this Skill does not do

- It does not run the Space, drive a canvas, or call any `spaces_*`/`creations_*` tool — that is
  the thin Producer's job (issue #88), following this Recipe's Execution Protocol.
- It does not compose the Copy (caption/hashtags/mentions) — that is this Recipe's own copy step,
  run separately, out of the canvas (ADR-0012).
- It does not publish anything, ever (always-rule 1; ADR-0002).
