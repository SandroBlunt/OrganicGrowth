# Formats live per-Brand in their own files; a Run is scoped to one Format

**Status:** accepted — extends ADR-0009 (the Format concept) and ADR-0006 (per-Brand directories).
Captured in the 2026-07 grilling.

A Format is now first-class (ADR-0009) but has no home on disk — it exists only implicitly as a
Brand-level voice string + `curated_sources`. Today a Brand has one voice and one trend-source mode
(peer-scrape vs curated), so it cannot run two editorial lines with different voices/sources.

## Decision

- **One file per Format** under the Brand: `data/brands/<slug>/formats/<slug>.yaml`, holding
  `{ name, niche, voice/treatment, trend sources + peer-vs-curated mode, default_recipes }`.
- **Voice, trend sources, and mode move DOWN from the Brand to the Format.** `brand-profile.yaml` keeps
  only Brand-wide hard rules (banned words, required CTA, required hashtags, the watermark @handle, and
  the Channel/platform).
- **A Run is scoped to one Format.** `/run-trends <brand> <format>` runs trend-scout + idea-strategist
  with **that** Format's sources and voice; the run path namespaces by Format; `ideas_per_run` is
  per-Format. "Run the whole Brand" is a loop over its Formats. trend-scout's peer-vs-curated choice is
  now **per-Format**. Every Idea records its Format.
- **Recipes are available to every Brand; each Recipe drives one shared Space.** The Space a Recipe
  drives is named on the **Recipe** (ADR-0010), not per-Brand; the brand-specific bits (Spec content,
  watermark handle) are injected at run time. A per-Brand custom Space is a **future override**, not part
  of the MVP. A Recipe whose Space is not yet wired is simply **not offered** at Review — so "available to
  every Brand" scopes to **wired** Recipes. (This supersedes the earlier proposal of a per-Brand
  `recipe → space_id` map.)

## Why

Moving voice/sources/mode onto the Format is what lets one Brand run several distinct editorial lines
(e.g. Straw Motion's "Unhypped News" alongside a peer-scraped second line). Scoping a Run to one Format
keeps each line's trends and ideas from colliding and lets each use its own sources.

## Consequences

- The scaffolder/onboarding gain a Format interview loop and a `formats/` directory; trend-scout and
  idea-strategist become Format-aware.
- The media-sense `formats:[reel]` in `brand-profile.yaml` is renamed (ADR-0011 migration).
