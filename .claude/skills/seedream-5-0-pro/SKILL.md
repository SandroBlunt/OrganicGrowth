---
name: gen-prompting-seedream-5-0-pro
description: >
  Translate a user's image-generation intent into a production-ready prompt
  for ByteDance's Seedream 5.0 Pro image model, for use on a front-end
  (Dreamina / Jimeng, Doubao, fal, wavespeed, ComfyUI, or any Seedream 5.0
  web UI). Covers text-to-image, high-density design/infographic layout,
  grounded precision editing (point / box / lasso / sketch a target, swap a
  colour or material by hex or swatch, sketch-completion, retouch),
  multi-reference composition and group-photo fusion (reference by ordinal
  "Image 1/2…"), the sequential consistent-set workflow (storyboards,
  comics, sticker packs), Seedream's signature in-image text rendering in
  14 languages (quote the literal text), and on-demand layer separation to
  transparent PNGs. Invoke whenever the user asks for stills, designs, or
  edits on the Seedream 5.0 stack.
user-invocable: true
---

# Prompting for Seedream 5.0 Pro

Use this skill to author prompts for ByteDance's **Seedream 5.0 Pro** image
model on a front-end web UI (Dreamina / Jimeng, Doubao, fal, wavespeed,
ComfyUI, or any Seedream 5.0 surface). The focus is the **prompt you type
and the on-screen settings you pick** — not API code.

Seedream 5.0 Pro is the reasoning successor to Seedream 4.5: it
*understands design*, plans a layout before it draws, grounds every
element in space, renders legible text in 14 languages, and can split a
finished image into editable layers. The 4.5 habits still apply — this
skill layers the new capabilities on top.

Modes:

- **T2I** — text-to-image, no reference. Stronger realism and prompt
  reasoning than 4.5.
- **Design** — high-density information design: infographics, data
  charts, flowcharts, precision diagrams, dense-text posters and slides,
  generated in a single pass. A 5.0 differentiator.
- **Edit** — grounded precision edit on one uploaded image: mark a
  target (point / box / lasso / sketch), then state the change — swap a
  colour or material (by hex code or a swatch), complete a sketch, retouch
  a face — while the rest of the frame stays untouched.
- **MR** — multi-reference composition and group-photo fusion: combine
  several uploaded images, each addressed by its on-screen order ("Image
  1", "Image 2", …).
- **sequential-set** — one prompt produces a *coherent series* of stills
  (storyboard panels, comic pages, sticker / emoji packs) with one
  character and style held constant across the whole set.

Two capabilities run **across every mode**, not as separate modes:

- **In-image text in 14 languages** — quote the literal text; correct
  letterforms and local typography, including right-to-left Arabic.
- **Layer separation** — ask for it and Seedream splits the result into
  10+ independent, transparent layers (text, subject, background,
  environment) you can move and scale. Export as PNG.

On-screen settings (you pick these in the UI, they are NOT part of the
prompt text):

- **Aspect ratio** — presets `1:1`, `16:9`, `9:16`, `4:5`, `3:4`, `4:3`,
  `3:2`, `2:3`, `21:9`, plus `auto`. Very wide range (1:16 → 16:1). See
  § Aspect ratios.
- **Resolution** — `1K` or `2K` (default; max **2048 px**), or `auto`.
  See § Resolutions. **5.0 Pro is a 2K model — there is no 4K tier.**
- **Output format** — PNG or JPEG. Use **PNG** for layer separation and
  transparency.
- **Number of images / set size** — how many outputs the run returns.
- **Reference uploads** — up to ~10 images for Edit / MR / set work.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/photography.md`,
`../../../references/lighting.md`,
`../../../references/cinematography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time, then return here for model-specific behaviour.

## When to invoke

- User asks for a generated still image and names Seedream 5.0, Seedream
  5, Doubao image, Dreamina, or Jimeng (即梦).
- User wants an **infographic, chart, diagram, dense-text poster, slide,
  or UI mock** — Design mode is the fit and a 5.0 signature strength.
- User asks to **edit** an uploaded image — especially a targeted change
  (recolour, swap a material, fix one region, retouch a face).
- User asks to combine several uploaded references, or merge people into
  one group photo.
- User wants a *consistent series* — storyboard, comic, sticker pack,
  product set — sequential-set mode.
- User wants an image whose parts they can **pull apart into layers**.

Do not invoke this skill for video, or for non-Seedream image stacks (use
the Nano Banana or ChatGPT-Image skills instead). For Seedream **4.5**,
use the `seedream-4-5` skill.

## Inputs the consuming agent provides

1. **Mode** — one of `T2I`, `Design`, `Edit`, `MR`, `sequential-set`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference images** (Edit, MR, sequential-set with anchor) — list
   with role per image, in on-screen order. See § Reference caps.
4. **Edit target** (Edit only) — the marked element or region: a point,
   box, lasso, or sketch, described in words. See § Mode 3.
5. **Colour / material** (Edit recolour) — a hex code (`#1E4FD8`) or a
   swatch reference. See § Mode 3.
6. **Set intent** (sequential-set only) — what stays constant and what
   changes across the series, plus the set count.
7. **In-image text** (optional) — the exact words to render, in any of
   the 14 languages. Always quote them. See § In-image text.
8. **Layers** (optional) — whether to request layer separation.
9. **Aspect ratio / resolution** — on-screen settings.
10. **Style anchor** — optional. If absent, default to "natural
    photograph, neutral grade".
11. **Negative cues** — optional. Rephrase to positive statements;
    Seedream has no negative-prompt field (see § Negation).

## The prompt formula — SPACE

Seedream 5.0 Pro rewards **natural-language prose, not keyword stacking**,
and it *reasons about layout* before drawing. Lead with the subject —
Seedream weights concepts mentioned earlier more heavily, so the first
thing you write is the thing it commits to hardest. Then walk the
**SPACE** order (woven into prose, not a bullet list to the model):

1. **Subject** — who or what is in frame, described concretely.
2. **Palette & style** — art direction, medium, mood.
3. **Arrangement** — composition, framing, layout. 5.0 acts on this
   precisely; spell out where things sit.
4. **Camera & light** — lens, angle, light direction and quality.
   *Place the light — naming its direction and quality does more than any
   style word.*
5. **Extra detail** — in-image text (quoted), textures, finishing.

**Word budget: 30–100 words.** Past ~100 words the model starts to lose
earlier detail. If you have more to say, cut adjectives, not subjects.

## Mode 1 — Text-to-image (T2I)

### Strengths

- Photoreal product and portrait work; balances CG polish with real-world
  lighting, materials, and skin texture.
- **Best-in-class legible in-image text**, now in 14 languages.
- Precise spatial grounding — put things exactly where you say.
- Responsive to lighting language — name the light and it delivers.

### Known weaknesses

- Overly long prompts confuse it; keep to the 30–100 word budget.
- Can still lean "plasticky" on people; ask for natural skin texture and a
  documentary grade for realism. Very small or very long text degrades.

### T2I prompt template

```
<Subject in one short sentence>.
<Action or pose in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor — a photographic stock, a named illustration tradition,
or a render style>.
<Camera, framing, light direction and quality in one or two short
sentences.>
```

### T2I worked example — environmental portrait

```
A weathered fisherman mending a net.
His hands work the cord; his gaze is down and focused.
A wooden harbour jetty at golden hour, boats blurred behind him.
Naturalistic 35mm film look, neutral-warm grade, natural skin texture.
85mm portrait, three-quarter angle, low golden-hour sun from
camera-right, soft falloff into the background.
```

## In-image text (signature strength, 14 languages)

Seedream 5.0 Pro renders text better than its peers and now does so
natively in **14 languages** (including English, Chinese, Japanese,
Korean, Arabic, Russian, Thai, Spanish, French, German), with correct
letterforms, local typography, accent marks, and **right-to-left**
layout for Arabic. The rule is unchanged: **put the exact words in double
quotes.**

- Good: `a vintage travel poster with the title "VISIT KYOTO" across the
  top in bold serif lettering.`
- Avoid: `a vintage travel poster titled Visit Kyoto.` (unquoted text is
  unreliable.)

Guidance:

- Name the **typography** (bold, serif, hand-lettered, condensed) and the
  **placement** (centered, along the top, on a sign, as a logo).
- Keep each text element **short** — roughly 1 to 10 words renders most
  reliably. Long paragraphs and very small captions still degrade.
- For non-Latin or right-to-left scripts, state the language if it is not
  obvious from the characters. Mixed-language layouts work; verify.
- For multiple text blocks, quote each one and say where it sits.

## Mode 2 — Design / infographic (distinctive)

Seedream 5.0 Pro is **built for high-density information images** — data
charts, flowcharts, timelines, precision diagrams, dense-text posters,
slides, and UI mocks generated in a single pass. It reasons about info
density, logical structure, and page layout, and sharpens small-text
rendering.

### How to prompt a design

1. **Name the artifact and its job** — "a one-page infographic
   explaining…", "a 3-column comparison table…", "a flowchart of…".
2. **Spell out the layout** — sections, columns, reading order, where
   each block sits. 5.0 acts on arrangement precisely.
3. **Quote every label and data value** — all on-image text in double
   quotes (see § In-image text). This is what makes labels legible.
4. **State the visual system** — palette, type hierarchy, icon style,
   chart type.

### Design template

```
A <artifact — infographic / chart / flowchart / poster> about <topic>.
Layout: <sections / columns / reading order, where each block sits>.
Text (quoted, exact): <"heading">, <"label">, <"data value">, ...
Visual system: <palette, type hierarchy, icon and chart style>.
```

### Design worked example — infographic

```
A clean one-page infographic explaining the water cycle.
Layout: a circular flow with four labelled stages arranged clockwise,
a title bar across the top, a short caption strip along the bottom.
Text (quoted, exact): the title "THE WATER CYCLE"; stage labels
"EVAPORATION", "CONDENSATION", "PRECIPITATION", "COLLECTION".
Visual system: flat vector, teal-and-white palette, bold sans-serif
headings, simple line icons, subtle drop shadows.
```

Tip: request **layer separation** on a design (see § Layer separation)
so the title, each chart, and the background come back as separate
editable layers.

## Mode 3 — Grounded precision edit (Edit)

One uploaded image. Seedream 5.0 **grounds** every element in space, so
editing is targeted rather than a full re-roll: mark the element, state
the change, and the rest of the frame stays exactly as it was.

### Steps

1. **Mark the target** — describe how the user pointed at it: a **point**
   ("the sky"), a **box** ("the region around the logo"), a **lasso**
   ("the outlined jacket"), or a **sketch** ("the drawn-in sleeve"). Name
   what was marked.
2. **State the change** as one positive instruction.
3. **Name what to preserve** — identity, framing, key light, brand.

### Recolour / material swap

- Give a **hex code** (`#1E4FD8`) or reference a **swatch** ("match the
  swatch in Image 2") for an exact colour or material.
- Say the target surface: "recolour the jacket to `#1E4FD8`", "replace
  the tabletop material with brushed brass".

### Sketch completion & retouch

- **Sketch completion** — the user sketches a shape or addition; describe
  it and ask Seedream to render it into the scene realistically.
- **Retouch** — "remove the blemish on the left cheek", "even the skin
  texture", "correct facial symmetry" — kept photoreal.

### Edit template

```
Target: <point / box / lasso / sketch — the marked element>.
Change: <one positive instruction; include a hex code or swatch for a
recolour / material swap>.
Preserve: <identity, framing, key light, brand — one short sentence>.
Style hold: <match the original style unless overriding.>
```

### Edit worked example — targeted recolour

```
Target: the box drawn around the car's body panels (not the windows or
wheels).
Change: recolour the body to a deep metallic blue, "#1E3A8A", keep the
factory gloss and reflections.
Preserve: the car's shape, the studio background, the key light and
reflections on the glass.
Style hold: keep the original commercial-product look.
```

## Mode 4 — Multi-reference composition (MR)

Upload several images; address each by its **on-screen order** — "Image
1", "Image 2", and so on. Seedream relies most on the **first reference
for identity**, so upload the cleanest identity image first. 5.0 also
merges people from separate photos into one **group shot** with
consistent lighting.

### Reference caps

Seedream 5.0 Pro accepts up to about **10 reference images** (some API
resellers list 14; treat 10 as the safe ceiling — the build script
guards at 10). Fewer high-quality references beat many weak ones. On some
endpoints each reference must be under 10 MB with an aspect ratio between
1:3 and 3:1.

### Reference ordering heuristic

Order your uploads: **identity → style → palette → material/layout.** The
model anchors identity on Image 1, so put the face (or the hero object)
there. Address each by ordinal ("Image 1", "Image 2"), state a role per
image, then give the goal and composition in one line each.

Worked example — merge references into a group portrait:

```
Using the uploaded images:
  Image 1: person A, front-facing headshot.
  Image 2: person B, front-facing headshot.
  Image 3: person C, three-quarter headshot.
Goal: place all three as a natural group portrait, shoulders overlapping,
lit by one soft key so the light matches across every face.
Composition: waist-up, evenly spaced, warm neutral studio background.
```

## Mode 5 — Sequential consistent-set

One prompt → a coherent series of stills that share a character and a
style. Use it for storyboards, comic pages, sticker / emoji packs,
product sets, and character turnarounds.

### How to trigger it

Name the series explicitly and give a count: **"a set of 6…", "a series
of four panels…", "a 3-frame turnaround…".** Set the matching number on
the front-end's image-count control.

### Sequential-set template

```
Generate a set of <N> images of <subject held constant, named
precisely>.
Style and lighting (same across the whole set): <one sentence>.
Across the set, change only: <pose / angle / beat / expression>.
  Image 1: <state>.
  Image 2: <next state>.
  ...
  Image N: <final state>.
```

Worked example — sticker pack:

```
Generate a set of 6 images of the same chubby orange cat mascot.
Style and lighting (same across the whole set): flat vector sticker,
bold clean outline, soft cel shading, white background.
Across the set, change only the expression and pose.
  Image 1: happy, waving.
  Image 2: sleeping, curled up.
  Image 3: surprised, eyes wide.
  Image 4: laughing, rolling.
  Image 5: grumpy, arms crossed.
  Image 6: blowing a kiss.
```

### Sequential-set anti-patterns

- Varying the style clause per panel — identity and look drift. Lock the
  style once, globally.
- Asking for too many panels at once (>8) — split into two sets that
  share the same anchor image.
- Forgetting the count — without "a set of N", the model returns a single
  image.

## Layer separation (cross-cutting)

Ask Seedream 5.0 Pro to **split a result into independent layers** and
each element — a line of text, a character, an object, the background —
comes back as its own transparent layer you can drag and scale. Export as
**PNG** to keep transparency.

- Trigger it in words: "separate the result into layers", "give me the
  title, the subject, and the background as separate transparent layers".
- Works on any mode; especially useful on Design outputs (title, each
  chart, background as separate layers) and on posters.
- Set the output format to **PNG**.

## Aspect ratios

Seedream 5.0 Pro supports a very wide range (**1:16 → 16:1**). Common
presets: `1:1`, `16:9`, `9:16`, `4:5`, `3:4`, `4:3`, `3:2`, `2:3`,
`21:9`, plus `auto` (the model picks the layout). Pick the ratio
on-screen before writing; it shapes how you describe framing. The build
script accepts this preset set plus `auto` and warns on anything outside
it.

## Resolutions

`1K` or `2K` (default; **max 2048 px**), or `auto`. **Seedream 5.0 Pro is
a 2K model — there is no 4K tier** (this differs from 4.5). Choose 2K for
detail-critical work, 1K for fast iteration, `auto` to let the model size
for the layout. Resolution is an on-screen control, not part of the
prompt text.

## Negation

Seedream has **no negative-prompt field**, and in-prompt negation ("no
text", "without people") is unreliable. Prefer **positive description**:
say what you DO want ("a clean, empty plaza" instead of "no people"). The
build script refuses prompts that lean entirely on negation tokens.

## Provenance and policy

- Some Seedream front-ends stamp a **visible wordmark** (e.g. Jimeng's
  "★ 即梦AI"); others offer a watermark toggle. Surface to downstream
  consumers when provenance matters.
- The user must hold rights to every uploaded reference image, and the
  output must comply with the platform's content policy.

## Translation notes

Model-specific quirks (SPACE ordering, earlier-token weighting, 30–100
word budget, quoted-text rule across 14 languages, grounded targeted
edits, hex/swatch recolour, layer separation, ~10 reference cap, 2K
ceiling, no negative field) live in `references/translation-notes.md`.
Source URLs, fetch date, and known uncertainties live in
`references/official-guidelines.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log
line:

```json
{
  "skill": "gen-prompting-seedream-5-0-pro",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2I|Design|Edit|MR|sequential-set",
    "reference_count": 0,
    "set_count": 0,
    "edit_target_present": false,
    "recolour_value": "<hex-or-swatch-or-none>",
    "layers_requested": false,
    "in_image_text_present": false,
    "in_image_text_quoted": false,
    "text_languages": "<e.g. en, ar>",
    "aspect_ratio": "1:1",
    "resolution": "2K",
    "word_count": 0,
    "style_anchor": "<one-line>"
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present vs defaulted; word count within 30-100; in-image text quoted; for Edit, a target is marked; for MR, identity is on Image 1 and refs <= 10; for sequential-set, count named and style locked globally; resolution within the 2K ceiling>"
}
```

Pick `defer-to-user` if: in-image text is present but not quoted; an Edit
request has no marked target; a recolour value is neither a hex code nor
a swatch reference; a sequential-set is requested without a count; an MR
request has no clear identity anchor on Image 1; or the prompt exceeds
the word budget by a wide margin.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and validate
the prompt before emitting it. The script enforces the subject-first
SPACE skeleton, checks the 30–100 word budget, requires in-image text to
be quoted, validates the Edit target and hex/swatch recolour value,
enforces the ~10 reference cap and ordinal labelling for MR, validates
set counts and the global style lock for sequential-set mode, accepts the
`auto` and 2K-ceiling settings (and rejects a 4K request), refuses
negation-only prompts, and prints the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2I --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..."
```

For a design/infographic (`--layers` requests layer separation) or a
targeted edit (`--target` marks the element, `--color` takes a hex or
swatch):

```
python3 scripts/build-prompt.py --mode Design --subject "..." \
    --setting "..." --style "..." --in-image-text '"HEADING"' --layers
python3 scripts/build-prompt.py --mode Edit --subject "..." --style "..." \
    --reference "..." --target "..." --color "#1E3A8A"
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
