# Live "AI News" Space capture — PRE-TIDY, READ-ONLY (issue #60)

A **sanitized, read-only board dump** of the real "AI News" Space (`a2402c48-b688-436b-8cb6-23a4aad7822e`,
"Viral News Pipeline" cluster) — the second wired Recipe's target (**News Carousel**,
`src/recipe/registry.ts`). Captured live, once, with the Operator present (mirrors
`space-driver/fixtures/live-captures/`'s sanctioned capture for the FIRST Space, issue #40).

## Status: partial (this is explicitly flagged in the Build Report)

- **`00-spaces_state.pre-tidy.txt`** — captured **BEFORE** the Operator's node-renaming pass. It is a
  **read-only** `spaces_state`-shaped dump (152 nodes, 103 connections) — no `spaces_run`/`spaces_edit`
  was issued against the live board to produce it. It is the ONLY capture this slice (`developer`, no
  Magnific MCP tools) is allowed to use as ground truth for the real node/connection SHAPES — see
  `src/production-spec/news-carousel-contract.ts`, `execution-protocol/fixtures/carousel-space-state.ts`,
  and `space-driver/fixtures/fake-carousel-space.ts`, which all cite it.
- **What's still missing (pending, added by the orchestrator + Operator, attended, AFTER this build):**
  one real **carousel run** (`spaces_run`/`spaces_run_status`, terminal), one real **inject**
  (`spaces_edit`/`spaces_edit_status` into the post-tidy `JSON Master` node), and **`creations_get`**
  fetches for the finished slide images — the same record/replay set `live-captures/` holds for the
  first Space (`01`–`11` there). Until those land, the live `SpaceMcpPort` adapter (`space-driver/live/`)
  is **not** extended to the carousel Space; only the **fake** (`fake-carousel-space.ts`) is exercised.
- **The acceptance criterion "its Space is captured as record/replay fixtures for the fake" is therefore
  MARKED PARTIALLY MET** for this slice: the pre-tidy board read is here, in-repo; the attended
  run/edit/creations captures are pending. The fake is structured so swapping in the post-tidy captures
  is a **data change** (new fixture files + updated node names in `carousel-space-state.ts`/
  `fake-carousel-space.ts`), not a code change — the driver primitives (`injectSpec`, `runRunPoint`,
  `driveSelectedRunPoints`) are already Recipe/Space-agnostic.

## What the pre-tidy dump shows (verified, cited throughout the new code)

- A `JSON Master #2` text node (renamed **`JSON Master`** post-tidy) holds a JSON ARRAY of
  `{ "slide_index": N, "image_prompt": "..." }` objects and has a DIRECT connection to every
  `Image Prompt Slide N` node (verified: `82f92db1…` → each of the seven `prompt-generator` nodes).
- Per-slide `prompt-generator` extractors (`Image Prompt Slide 1`..`7`) instructed
  `return ONLY "image_prompt" from "slide_index": N` — each feeds its own slide's image generator(s)
  directly (`generated_prompt` → `prompt`).
- 2-3 candidate image generators per "Slide N" panel; the Operator is picking ONE per slide and renaming
  it `Slide N Generator` (canonical, post-tidy).
- An `Assistant Prompt #2` writing guide (renamed **`Carousel Prompt Guide`**) describing the exact
  image-prompt format and variable names (`slide_index`, `image_prompt`) — no other header fields are
  implied.
- A `Straw_motion_logo` reference creation (renamed **`Brand Logo`**).
- **No `Producer Protocol` node exists yet** on the pre-tidy board (ADR-0010's on-canvas convention) —
  `execution-protocol/protocol.ts`'s `canonicalCarouselProtocol()` is the committed, in-repo source of
  truth for what that node must contain once authored; authoring it onto the live canvas is deferred to
  the same attended pass that captures the pending run/edit/creations fixtures above (mirrors
  `canonicalProtocol()`'s own deferred-authoring note for the first Space).

## No secrets

Sanitized: no `.env`, no API token, no signed/expiring media URLs beyond what the dump already redacted.
No credits spent producing this file (read-only).
