# Translation notes — Seedream 5.0 Pro

Model-specific rules for ByteDance's Seedream 5.0 Pro that override the
cross-model defaults in `../../../references/prompt-discipline.md`.
This skill is **front-end / prompting focused** — it covers what you type
and the on-screen options you pick, not API code. Seedream 5.0 Pro is the
reasoning successor to Seedream 4.5; the 4.5 habits still apply, and the
new capabilities layer on top.

## Natural language, not keyword stacking — SPACE order

Seedream rewards **plain sentences**, not adjective stacks. Lead with the
subject (earlier concepts weigh more) and walk the **SPACE** order:
**S**ubject, **P**alette & style, **A**rrangement, **C**amera & light,
**E**xtra detail. *Place the light* — naming its direction and quality
does more for a scene than any style word. 5.0 reasons about layout, so
spell out **arrangement** precisely.

## Word budget

- Aim for **30–100 words.** Past ~100 words, earlier detail washes out.
  The build script hard-stops at 120 words.
- When you need to add something, cut adjectives, not whole clauses.

## In-image text (signature strength, 14 languages)

- **Quote the literal text in double quotes.** `the title "VISIT KYOTO"`
  renders; `titled Visit Kyoto` does not, reliably.
- Native rendering in **14 languages** (English, Chinese, Japanese,
  Korean, Arabic, Russian, Thai, Spanish, French, German, and more) with
  correct letterforms, local typography, accent marks, and right-to-left
  Arabic. State the language if it is not obvious from the characters.
- Name the typography (bold, serif, hand-lettered) and placement.
- Keep each text element short — roughly 1–10 words is most reliable.
  Very small text and long paragraphs still degrade; verify.
- The build script refuses an in-image-text argument that is not
  double-quoted.

## Design / infographic mode (distinctive)

- 5.0 is built for **high-density information images** — charts,
  flowcharts, diagrams, dense-text posters, slides — in a single pass.
- Name the artifact and its job, spell out the layout (sections, columns,
  reading order), quote every label and data value, state the visual
  system (palette, type hierarchy, icon/chart style).
- Combine with layer separation to get the title, each chart, and the
  background back as separate editable layers.

## Grounded precision editing (Edit)

- 5.0 **grounds** every element in space: editing is targeted, not a full
  re-roll. **Mark the target** — point, box, lasso, or sketch — then state
  the change, then name what to preserve.
- **Recolour / material swap:** give a **hex code** (`#1E3A8A`) or
  reference a **swatch** / an uploaded image for an exact value. The build
  script rejects a recolour value that is neither a hex nor a swatch/Image
  reference.
- **Sketch completion:** describe a user's sketch and ask Seedream to
  render it into the scene realistically.
- **Retouch:** blemish removal, skin-texture evening, facial symmetry —
  kept photoreal.
- Edit mode = exactly one uploaded image.

## Reference images (MR)

- Address uploads by **on-screen order**: "Image 1", "Image 2", …
- Seedream relies **most on the first reference for identity** — upload
  the cleanest face / hero object as Image 1.
- Recommended upload order: **identity → style → palette →
  material/layout.**
- Practical cap: **~10 reference images** (some resellers list 14; 10 is
  the safe ceiling — the build script guards at 10). On some endpoints
  each reference must be < 10 MB with aspect ratio 1:3–3:1.
- 5.0 also merges people from separate photos into one **group shot** with
  consistent lighting.

## Sequential consistent-set

- One prompt → a coherent series of stills sharing a character and a
  style. Trigger it by naming the series and a count: "a set of 6…".
- **Lock the style globally** — one style/lighting clause for the whole
  set; do not vary it per panel, or identity drifts.
- Set count 2–8. For larger sets, split into two runs and reuse an anchor
  image to hold identity.
- Set the matching image count on the front-end control.

## Layer separation (cross-cutting)

- Ask Seedream to **split a result into independent layers** — text,
  subject, background, and elements each come back as their own
  transparent layer you can drag and scale (10+ layers reported).
- Works on any mode; set the output format to **PNG** to keep
  transparency.

## Negation

- Seedream has **no negative-prompt field**, and in-prompt negation ("no
  people", "without text") is unreliable. Prefer positive description ("a
  clean, empty plaza").
- The build script refuses prompts that lean entirely on negation tokens.

## Quirks and weaknesses

- **Plasticky / over-beautified people** by default. For realism, ask for
  natural skin texture and a documentary grade.
- Overly long prompts confuse the model (see word budget).
- Very small or very long text degrades (see in-image text).

## On-screen settings (not prompt text)

- **Aspect ratio:** presets `1:1`, `16:9`, `9:16`, `4:5`, `3:4`, `4:3`,
  `3:2`, `2:3`, `21:9`, plus `auto`; range 1:16–16:1. (Exact published
  list varies by front-end; the build script accepts this preset set plus
  `auto`.)
- **Resolution:** `1K` or `2K` (default; **max 2048 px**), or `auto`.
  **No 4K tier** — the build script rejects a 4K request. This differs
  from Seedream 4.5.
- **Output format:** PNG or JPEG (PNG for layers / transparency).
- **Image count / set size:** how many outputs the run returns; drives
  sequential-set.

## Parameters this skill deliberately excludes

Some third-party guides publish **Stable-Diffusion-style parameters** that
Seedream does **not** have: `guidance_scale`, `num_inference_steps`,
`scheduler`, `clip_skip`, `negative_prompt`. Do not author prompts around
them — they do nothing on Seedream. Steer the result through **language**,
not numeric controls.

API-only knobs (seed, watermark toggle, batch count, safety checker,
base64 output, sync mode) exist for programmatic callers but are **out of
scope** for this front-end skill.

## Provenance and policy

- Some front-ends stamp a visible wordmark (e.g. Jimeng's "★ 即梦AI");
  others offer a watermark toggle. Surface to consumers when provenance
  matters.
- The user must hold rights to every uploaded reference image, and the
  output must comply with the platform's content policy.

## Audit

Last reviewed: 2026-07-11. Cross-check against
`references/official-guidelines.md` (the vendor sources) before relying on
any rule above. Several facts about Seedream 5.0 Pro (exact max
resolution, exact reference cap, exact language count) vary across sources
— see the official-guidelines audit notes. At fetch time ByteDance had not
published a dedicated 5.0 prompt guide; SPACE and the numbers above are
drawn from the announcement plus fal / wavespeed / morphic.
