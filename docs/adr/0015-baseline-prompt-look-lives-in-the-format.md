# A Format's per-Recipe "look" is a baseline prompt document the Recipe's Skill interprets

**Status:** accepted — extends ADR-0013 (Formats live per-Brand in files) and ADR-0010 (Recipes in-repo,
Space media-only). Captured in the 2026-07 recipe-architecture wayfinding (map #70, ticket #72). **Decided,
build pending.**

ADR-0013 gave the Format a home and made it own voice + trend sources. But a Recipe that renders a
*visual* Asset (the news carousel) needs a per-Brand, per-Format **look** — card styles, the badge/pill,
logo placement, fonts, and the worked examples the media prompt is authored from. That look is neither
Brand-wide (a Brand may run several Formats, each looking different) nor Recipe-global (a Recipe is shared
across Brands). It belongs to the **(Brand × Format)** pair.

## Decision

- A Format owns a **baseline prompt** for each Recipe it produces through — a **document**: a set of
  **definitions** (the rules), a **core structure example** (a worked prompt), and **additional samples**.
  It is **not** a single fill-in-the-blanks string and **not** a rigid field-map.
- Because it is a multi-part document with worked examples, it **lives as its own referenced file**, not
  inline in the Format YAML; the Format points at it.
- The **Recipe's Skill reads and interprets** the baseline prompt to author each media prompt (ADR-0018):
  it reproduces the document's fixed clauses verbatim and swaps only the bracketed, per-shot parts.
- Brand/Format specifics the document carries — the pill/eyebrow text, the logo reference name, the card
  styles — come **from the document**, never hardcoded in the Recipe or the Skill.

## Why

The look varies per Brand and per Format, so it can't live on the shared Recipe; it varies per Recipe
within a Format, so it can't be one Brand/Format scalar. A document (rules + a worked example + samples)
gives an interpreting Skill enough to stay consistent without freezing the wording into rigid code. The
map's #77 prototype validated it: a Skill authored 7 on-contract carousel prompts from the locked
`baseline-prompt.md` + a brief, passing the author checklist 10/10.

## Consequences

- The Format store gains a per-Recipe baseline-prompt pointer; onboarding/scaffolding gains a step to
  author it.
- The prototype's `buildSlideImagePrompt` (structured clauses assembled in code) is superseded by the
  document-interpreted-by-a-Skill approach.
- The look is out of the Space entirely — the Space renders media from the authored prompt; it never holds
  the template (also dodging the on-canvas read truncation the prototype hit).
