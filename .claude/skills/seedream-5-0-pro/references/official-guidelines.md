# Official guidelines — Seedream 5.0 Pro

Distilled summary of the prompt guidance and specs for ByteDance's
Seedream 5.0 Pro. Any rule below that conflicts with the latest official
source MUST be treated as stale. This skill is front-end / prompting
focused.

## Sources

- **Primary announcement (ByteDance Seed blog):**
  https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro
- **Official model page (ByteDance Seed):**
  https://seed.bytedance.com/en/seedream5_0_pro
- **fal model page (API specs):** https://fal.ai/seedream-5.0
- **wavespeed model page:**
  https://wavespeed.ai/models/bytedance/seedream-v5.0-pro
- **Prompt how-to (morphic):**
  https://morphic.com/resources/how-to/seedream-5-pro-guide
- **Fetched at:** 2026-07-11
- **Vendor:** ByteDance Seed (distributed via Volcano Engine / BytePlus;
  consumer brands Doubao / Jimeng / Dreamina; also on fal, wavespeed,
  ComfyUI). Vendor model id: `doubao-seedream-5.0-pro`. Launched
  2026-07-08. A cheaper **Seedream 5.0 Lite** editing model also exists
  and is out of scope here.

## Headline points (distilled, 2026-07-11)

- **It "understands design"** — a multimodal model with prompt reasoning:
  it plans a layout before drawing. (seed blog)
- **Describe the scene in natural language**; concise and precise beats
  long and ornate. Lead with the subject — earlier concepts weigh more.
  (carried from Seedream 4.5 practice; consistent with morphic)
- **SPACE prompt order** (morphic): Subject, Palette & style, Arrangement,
  Camera & light, Extra detail. "Place the light — naming its direction
  and quality does more than any style word."
- **In-image text:** quote the literal text in double quotes; renders as
  written. Now native in **14 languages** (English, Chinese, Japanese,
  Korean, Arabic, Russian, Thai, Spanish, French, German, and more), with
  correct letterforms, local typography, accent marks, and right-to-left
  Arabic. (morphic, seed, wavespeed)
- **High-density information design:** data charts, flowcharts, precision
  diagrams, dense-text layouts in a single pass; optimises info density,
  logical structure, page layout; sharpens small-text rendering. (seed)
- **Grounded / region-precise editing:** point selection, lasso, sketch
  completion, colour editing, material replacement — lock onto one
  element and the rest of the frame stays intact. "Mark the target —
  point, box, arrow, or sketch — then describe the change." (seed, fal,
  morphic)
- **Material control:** accepts Hex colour codes and external colour
  swatches for edits. (seed blog)
- **Layer separation:** split a result into **10+ independent layers**
  (text, subject, background, environment), each keeping transparency;
  drag and scale each; export as PNG. (seed, fal, wavespeed, morphic)
- **Realistic imagery:** balances CG expressiveness with photographic
  quality — real-world lighting, materials, skin texture; facial retouch
  (spot removal, symmetry). (seed)
- **Group photography:** merge people from separate photos into one
  cohesive group shot with consistent lighting. (seed)
- **Multi-reference:** address each upload by ordinal ("Image 1"…);
  identity anchors on the first reference. (carried from 4.5, consistent
  with fal edit endpoint)

## On-screen settings / specs

- **Resolution:** two tiers, **1K** or **2K**; maximum **2048×2048 px**;
  `size=auto` (a.k.a. `auto_2K`) lets the model pick the layout. **There
  is no 4K tier** — this is a change from Seedream 4.5. (fal, wavespeed)
- **Aspect ratio:** very wide range, **1:16 → 16:1**; presets include
  `1:1`, `16:9`, `9:16`, `4:5`, and square/portrait/landscape/tall/wide.
  (fal, wavespeed)
- **Output format:** JPEG or PNG (PNG for transparency / layers). (wavespeed)
- **Reference images:** fal edit endpoint documents **up to 10**; one API
  reseller lists **14** (each < 10 MB, aspect ratio 1:3–3:1). Treat **10**
  as the safe ceiling. (fal, aggregator)
- **API endpoints (fal):** `bytedance/seedream/v5/pro/text-to-image` and
  `bytedance/seedream/v5/pro/edit`.

## SPACE framework (morphic)

1. **Subject** — who/what, concretely.
2. **Palette & style** — art direction, medium, mood.
3. **Arrangement** — composition, framing, layout.
4. **Camera & light** — lens, angle, light quality; place the light.
5. **Extra detail** — on-image text (quoted), textures, finishing.

## Strengths called out by the sources

- Best-in-class legible in-image text; now 14 languages incl. RTL.
- High-density design/infographics in one pass — a 5.0 differentiator.
- Grounded, region-precise editing that leaves the rest of the frame
  untouched; sketch completion; hex/swatch recolour and material swap.
- On-demand layer separation to transparent PNGs.
- Photoreal portraits and products; retouch; consistent-lighting group
  photos.

## Caveats called out by the sources

- Overly long prompts still confuse it (keep to 30–100 words).
- Very small or very long text still degrades; keep rendered text short.
- Tends toward over-beautified people unless realism is requested.
- No negative-prompt field; in-prompt negation unreliable.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Natural language, subject-first, SPACE order | `SKILL.md` § The prompt formula |
| High-density design / infographics | `SKILL.md` § Mode 2 — Design |
| Grounded target + hex/swatch recolour | `SKILL.md` § Mode 3 — Edit |
| Ordinal multi-reference, group photo | `SKILL.md` § Mode 4 — MR |
| Sequential consistent-set | `SKILL.md` § Mode 5 |
| Quoted in-image text, 14 languages | `SKILL.md` § In-image text |
| Layer separation | `SKILL.md` § Layer separation |
| 2K ceiling, no 4K | `SKILL.md` § Resolutions; build script |
| Aspect range + auto | `SKILL.md` § Aspect ratios; build script |
| No negative field | `SKILL.md` § Negation |

## Audit and verification

- **Last reviewed:** 2026-07-11.
- **Verification cadence:** re-fetch on every minor or major version bump,
  and when ByteDance publishes an official prompt guide for 5.0 (none at
  fetch time — 4.5's guide is at docs.byteplus.com/en/docs/ModelArk).
- **Known uncertainties (flag before relying):**
  - **Resolution ceiling:** technical sources (fal, wavespeed, morphic)
    agree on **2K / 2048 px**; some marketing pages claim "up to 4K/3K".
    Treat **2K (2048 px)** as the reliable ceiling until an official spec
    says otherwise.
  - **Reference cap:** fal documents 10; one reseller lists 14. Use **10**
    as the safe ceiling (the build script guards at 10).
  - **Language count:** the vendor says "over ten" / "a dozen"; third-party
    guides consistently say **14**. Either way, quote the literal text.
  - **Aspect-ratio preset list** varies by front-end; the 1:16–16:1 range
    and the `auto` option are documented, individual presets are moderate
    confidence.
  - **Do NOT trust** any third-party guide listing `guidance_scale`,
    `num_inference_steps`, `scheduler`, or `negative_prompt` for Seedream
    — these are Stable-Diffusion template values that do not apply.
