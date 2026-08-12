# A Recipe declares which platforms its Copy targets

**Status:** accepted — closes issue #183, surfaced on the first Unhypped Daily run (2026-08-11).

The Brand's Channel list now spans 6 platforms (YouTube added for the Space-less News Short Script
Recipe, issue #174), but the copy step composed one variant per Channel platform unconditionally, for
every Recipe. A 7-slide image carousel has no business composing a YouTube-shaped variant — YouTube is
the one platform whose Copy shape needs a video `title`, which News Carousel's Copy has no concept of.
On launch day the mismatch was avoided only by hand: the Producer skipped YouTube by judgment, with no
trace of that call anywhere in the repo.

## Decision

- `Recipe` gains a `copyPlatforms: readonly string[]` field: the explicit set of platforms that
  Recipe's Copy composes a variant for. Every Recipe states its own list in full — no default, no
  inheritance — matching how `gates`/`specShape`/`copyShape` already work on this interface.
- The copy step's targeted platforms become the **intersection** of the Brand's Channel platforms and
  the Recipe's `copyPlatforms`, not the Brand's Channel list alone.
- **News Short Script** gets `copyPlatforms: ["youtube"]`, replacing its special-cased "skip the
  multi-platform loop" behavior — it now goes through the same intersection-and-loop logic as every
  other Recipe, just with a one-item result.
- **Character Explainer with Cast** and **News Carousel** both get
  `["facebook", "instagram", "linkedin", "x", "tiktok"]` — identical lists, matching what they already
  produce today (verified against already-produced Assets).
- When a Channel platform falls outside a Recipe's list, its variant is silently skipped (unchanged
  from today), but the copy step leaves a one-line note in session output so the omission isn't
  invisible to whoever is watching that run.

## Why

An explicit per-Recipe list was chosen over a predicate function or deriving compatibility from an
existing signal (e.g. "has `copyShape.titleMaxChars`" ⇒ YouTube-only): the derived signal only works
today because YouTube happens to be the one platform with a video title — a coincidence, not a rule. A
predicate is more flexible but harder to skim than a plain array, and this registry's style is already
fully-declarative with no inheritance per Recipe. The two image/video Recipes ending up with identical
lists is deliberate, not something to refactor into a shared default — a default would silently include
a future platform for a Recipe nobody actually evaluated against it.
