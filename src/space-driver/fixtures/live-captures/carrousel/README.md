# Carrousel Space — live captures (issue #86)

Sanitized record/replay fixtures of the **live single-lane "Carrousel" Space** (Space id
`a2402c48-b688-436b-8cb6-23a4aad7822e`), captured 2026-07-18 in an Operator-paired session. Every
signed-URL `token=` is `REDACTED`; no `.env` value is present. **Issue #89 replays these to rebuild the
FAKE carousel canvas to the real shape** and prove one Idea → two Recipes → two Assets end-to-end.

## Shape — verified single-lane (7 nodes, 5 connections)

Flow: **JSON Master** (`text`, the inject node) → **Assistant** (`prompt-generator`, GPT41MINI —
`"return the value of each \"image_prompt\" and put it on a list"`) → **List** (`list`) →
**Image Generator #21** (`image-generator`) → **Generated slides** (`list`, mode `replace`). The
**Brand_Logo** (`creation`) node is wired into the Image Generator's `reference` port.

- **Producer Protocol** run_points: `[{ "start": "JSON Master", "mode": "downstream", "gate": null }]`
  — **zero gates**, so the Producer drives straight through (no pause).
- **Image Generator**: mode `imagen-nano-banana-2-flash`, aspectRatio `3:4`, resolution `1k`.

## Operator decisions (2026-07-18)

1. **Model = flash, kept.** The generator's `imagen-nano-banana-2-flash` is intended — the Operator
   confirmed flash-vs-non-flash. **No canvas change.** (Closes #86's model question.)
2. **Node names: align the BUILD to the canvas** (the Operator chose this over renaming the canvas). The
   live inject node is **`JSON Master`** (NOT `Slides Prompts`) and the logo reference node is
   **`Brand_Logo`** (NOT `Brand Logo`). The `news-carousel` Recipe (`src/recipe/registry.ts`) currently
   declares `promptNode: "Slides Prompts"` and a brand-asset slot targeting `"Brand Logo"`.
   **→ #89 must change the Recipe's `promptNode` to `"JSON Master"` and its brand-asset slot's canvas
   node name to `"Brand_Logo"`**, and update the dependent tests / fixtures / author-checklist / SKILL
   references, so the thin Producer (#88) can actually drive this canvas. (The baseline document's
   in-prompt logo *reference name* `Straw_Motion_Logo` is a separate, prompt-text concern and is
   unaffected.)
3. **Logo landed.** The pinned `Brand_Logo` creation (`Clear Logo.png`, 383×80 PNG) is committed as
   Straw Motion's Brand Asset `brand-logo` at `data/brands/straw-motion/assets/brand-logo.png` (store
   key `brand-logo`, media `image`).

## Files

- `00-spaces_show.fullboard.json` — full board (all 7 nodes, their data, all 5 connections); tokens
  `REDACTED`. The authoritative source for rebuilding the fake.
- `01-creations_get.brand-logo.txt` — the pinned logo creation's metadata; tokens `REDACTED`.

## Status

Implemented by issue #89: `src/recipe/registry.ts`'s `NEWS_CAROUSEL` now declares `promptNode: "JSON
Master"` and a `"Brand_Logo"` brand-asset media slot; `canonicalCarouselProtocol()`
(`src/execution-protocol/protocol.ts`) declares its run-point at `"JSON Master"`; the FAKE Carrousel
(`src/producer/fixtures/fake-carousel-space.ts`) is rebuilt to this file's exact node inventory, proven
by `src/producer/fixtures/fake-carousel-space.test.ts` parsing this capture directly.
