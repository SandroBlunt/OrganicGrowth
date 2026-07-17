# A Recipe's canvas takes two typed inputs — media slots and a prompt node; Brand Assets fill the media slots

**Status:** accepted — extends ADR-0010 (Recipes own their Space wiring) and ADR-0014 (state behind a store
boundary); confirms ADR-0013 (one shared canvas per Recipe). Captured in the 2026-07 recipe-architecture
wayfinding (map #70, tickets #73/#74). **Decided, build pending.**

ADR-0010 made the Recipe own "which Space it drives + the node names it touches," but left the *kinds* of
canvas input implicit. A shared canvas needs per-Brand parts injected at run time (a logo, a picked
character) without giving each Brand its own copy of the canvas.

## Decision

- Every Recipe's canvas takes exactly **two typed kinds of input**:
  - **media slots** — named slots holding an **image, video, or audio**; and
  - a **prompt node** — the text the Producer authors to the Recipe's contract (its core craft).
- **Media slots are filled by a named map the Recipe owns:** the Recipe names each slot and the
  **Brand-asset key** (or gate pick) that fills it. Two slot kinds:
  - **brand-asset slot** — filled from the Brand's **Brand Asset** store (e.g. `Brand_Logo`), reused every
    run;
  - **idea-pick slot** — filled from a human gate pick (e.g. the character Recipe's "Selected Character"),
    per Idea.
- **Brand Assets** are per-Brand reusable media (image/video/audio) committed under
  `data/brands/<slug>/assets/`, read through a new **`BrandAssetStore`** (added to ADR-0014's store list).
  They parallel the existing per-Brand watermark @handle **text** parameter.
- **A missing required slot's asset STOPS the run** with a clear message — never bind a half-complete
  Asset; optional slots may skip. (This is the media-bind phase's contract — ADR-0017.)
- **`space_id` lives on the Recipe, not the Brand** — one shared canvas per Recipe for every Brand
  (confirms ADR-0013; a per-Brand canvas stays a future override). This retires the Producer reading
  `production.space_id` from `brand-profile.yaml`.

## Why

Typing the canvas inputs names the seam between the Producer's two jobs — authoring the prompt and binding
media — and lets one shared canvas serve every Brand by injecting the per-Brand media by name. Committing
Brand Assets to git keeps them inspectable and Operator-editable, like the rest of the MVP's state.

## Consequences

- New `data/brands/<slug>/assets/` directory + `BrandAssetStore`; the Producer reads the Recipe's slot map,
  not the Brand Profile's `production.space_id`.
- The Recipe registry entry gains a typed slot list (name, kind, media type, required/optional,
  brand-asset key).
- Binding is media-type aware: it uploads via the matching Magnific tool per image/video/audio.
