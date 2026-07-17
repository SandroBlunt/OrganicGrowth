---
name: gen-prompting-seedream-4-5
description: >
  Translate a user's image-generation intent into a production-ready prompt
  for ByteDance's Seedream 4.5 image model, for use on a front-end (Dreamina
  / Jimeng, fal, wavespeed, or any Seedream web UI). Covers text-to-image,
  single-image edit, multi-reference composition (reference by ordinal "Image
  1/2…"), the Seedream-distinctive sequential consistent-set workflow
  (storyboards, comics, sticker packs, set design with locked identity), and
  Seedream's signature in-image text rendering (quote the literal text).
  Invoke this skill whenever the user asks for stills on the Seedream stack.
user-invocable: true
---

# Prompting for Seedream 4.5

Use this skill to author prompts for ByteDance's **Seedream 4.5** image
model on a front-end web UI (Dreamina / Jimeng, fal, wavespeed, or any
Seedream-powered surface). The focus is the **prompt you type and the
on-screen settings you pick** — not API code.

Modes:

- **T2I** — text-to-image, no reference.
- **Edit** — single-image edit (change one thing, keep the rest).
- **MR** — multi-reference composition: combine, replace, or
  style-transfer across several uploaded images, each addressed by its
  on-screen order ("Image 1", "Image 2", …).
- **sequential-set** — Seedream's distinctive workflow: one prompt
  produces a *coherent series* of stills (storyboard panels, comic
  pages, emoji/sticker packs, set-design variants) with a single
  character/style held constant across the whole set.

On-screen settings (you pick these in the UI, they are NOT part of the
prompt text):

- **Aspect ratio** — 1:1 up to 21:9. See § Aspect ratios.
- **Resolution** — 1K, 2K (default), or 4K (up to 4096 px).
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

- User asks for a generated still image and names Seedream, Seedream
  4.5, Doubao image, Dreamina, or Jimeng (即梦).
- User asks to edit an image they uploaded on the Seedream stack.
- User asks to combine several uploaded references into one composite.
- User wants a *consistent series* — storyboard, comic, sticker pack,
  product set, character turnaround — sequential-set mode is the fit.
- User wants a **poster, logo, UI mock, or any image with legible
  text** — Seedream's signature strength.

Do not invoke this skill for video, or for non-Seedream image stacks
(use the Nano Banana or ChatGPT-Image skills instead).

## Inputs the consuming agent provides

1. **Mode** — one of `T2I`, `Edit`, `MR`, `sequential-set`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference images** (Edit, MR, sequential-set with anchor) — list
   with role per image, in on-screen order. See § Reference caps.
4. **Set intent** (sequential-set only) — what stays constant and what
   changes across the series, plus the set count.
5. **In-image text** (optional) — the exact words to render. Always
   quote them. See § In-image text.
6. **Aspect ratio** — see § Aspect ratios.
7. **Resolution** — `1K`, `2K`, or `4K`.
8. **Style anchor** — optional. If absent, default to "natural
   photograph, neutral grade".
9. **Negative cues** — optional. Rephrase to positive statements;
   Seedream has no negative-prompt field (see § Negation).

## The prompt formula

Seedream rewards **natural-language prose, not keyword stacking.** The
official guidance is blunt: describe the scene in plain sentences;
concise and precise beats long and ornate. Lead with the subject —
**Seedream weights concepts mentioned earlier in the prompt more
heavily**, so the first thing you write is the thing it commits to
hardest.

Five-part order (woven into prose, not a bullet list to the model):

1. **Subject** — the main focus, named precisely.
2. **Action / pose** — what it is doing.
3. **Setting / environment** — where, and when.
4. **Style / medium** — photographic stock, illustration tradition, or
   render style.
5. **Camera & light** — shot scale, lens, light direction and quality.

**Word budget: 30–100 words.** Past ~100 words the model starts to lose
earlier detail. If you have more to say, cut adjectives, not subjects.

## Mode 1 — Text-to-image (T2I)

### Strengths

- Photoreal product and portrait work; strong prompt adherence.
- **Best-in-class legible in-image text** (posters, logos, UI).
- Precise aspect-ratio honouring; native 4K.
- Responsive to lighting language — name the light and it delivers.

### Known weaknesses

- Overly long prompts confuse it; keep to the 30–100 word budget.
- Can lean "plasticky" / over-beautified on people; ask for natural
  skin texture and a documentary grade when you want realism.
- Very small text and long paragraphs of text degrade; keep rendered
  text short (see § In-image text).

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

### T2I worked example — product hero

```
A modern smartphone floating upright in mid-air.
The glossy screen catches a single soft highlight down its left edge.
A seamless dark studio background with a subtle blue gradient behind it.
Commercial product photography, ultra-detailed, photorealistic.
Three-quarter front angle, 100mm macro, soft key from camera-left, gentle
rim light separating the phone from the background.
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

## In-image text (signature strength)

Seedream 4.5 renders text better than its peers. The rule from the
official guide is simple: **put the exact words in double quotes.**

- Good: `A vintage travel poster with the title "VISIT KYOTO" across the
  top in bold serif lettering.`
- Avoid: `A vintage travel poster titled Visit Kyoto.` (unquoted text is
  unreliable.)

Guidance:

- Name the **typography** (bold, serif, hand-lettered, condensed) and
  the **placement** (centered, along the top, on a sign, as a logo).
- Keep each text element **short** — roughly 1 to 10 words renders most
  reliably. Long paragraphs and very small captions degrade.
- Multi-line layouts work; mixed-language text and complex non-Latin
  scripts are harder — verify and regenerate if it matters.
- For multiple text blocks, quote each one and say where it sits.

## Mode 2 — Single-image edit (Edit)

One uploaded image. State the change as one positive instruction and
name what to preserve.

```
Edit: <one short sentence per change.>
Preserve: <identity, framing, key light, brand — one short sentence.>
Style hold: <match the original style unless overriding.>
```

Worked example:

```
Edit: change the season to winter — bare trees, light snow on the ground.
Preserve: the cabin's position, the warm window glow, the camera angle.
Style hold: keep the original 35mm film look and warm grade.
```

## Mode 3 — Multi-reference composition (MR)

Upload several images; address each by its **on-screen order** — "Image
1", "Image 2", and so on. Seedream relies most on the **first reference
for identity**, so upload the cleanest identity image first.

### Reference caps

Seedream 4.5 accepts up to about **10 reference images**. Fewer
high-quality references beat many weak ones. The build script guards at
10 and warns past that.

### Reference ordering heuristic

Order your uploads: **identity → style → palette → material/layout.**
The model anchors identity on Image 1, so put the face (or the hero
object) there.

```
Using the uploaded images:
  Image 1: <identity anchor — the face or hero object>.
  Image 2: <style or scene reference>.
  Image 3: <palette or material reference>.
Goal: <one sentence — e.g. "place the character from Image 1 into the
setting of Image 2, graded like Image 3.">
Composition: <framing and subject placement in one sentence.>
```

Worked example:

```
Using the uploaded images:
  Image 1: a young woman with red hair, front-facing headshot.
  Image 2: a neon-lit Tokyo alley at night.
  Image 3: a teal-and-magenta colour palette swatch.
Goal: place the woman from Image 1 walking through the alley in Image 2,
graded in the palette of Image 3.
Composition: medium-wide, she is centre-frame walking toward camera.
```

## Mode 4 — Sequential consistent-set (distinctive)

Seedream's standout workflow: **one prompt → a coherent series of
stills** that share a character and a style. Use it for storyboards,
comic pages, sticker / emoji packs, product sets, and character
turnarounds.

### How to trigger it

Name the series explicitly and give a count: **"a set of 6…", "a series
of four panels…", "a 3-frame turnaround…".** Set the matching number on
the front-end's image-count control.

### Inputs

1. **Held-constant brief** — the character or product, named once,
   identical across the set.
2. **Set intent** — what changes from panel to panel (pose, angle,
   beat, expression).
3. **Style lock** — one style/lighting clause that applies to the whole
   set (state it once, globally — do not vary it per panel).
4. **Anchor image (optional)** — an uploaded reference that locks
   identity for the whole set.
5. **Set count** — typically 3 to 8.

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

- Varying the style clause per panel — identity and look drift. Lock
  the style once, globally.
- Asking for too many panels at once (>8) — identity degrades; split
  into two sets that share the same anchor image.
- Forgetting the count — without "a set of N", the model returns a
  single image.

## Aspect ratios

Seedream 4.5 supports ratios from **1:1 through 21:9**, including
`1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, and `21:9`. Pick the
ratio on-screen before writing; it shapes how you describe framing.

(The exact published ratio list varies by front-end; the build script
accepts this common set and warns on anything outside it.)

## Resolutions

`1K`, `2K` (default), `4K` (up to 4096 px). Choose 4K for print or
detail-critical work; 1K/2K for fast iteration. Resolution is an
on-screen control, not part of the prompt text.

## Negation

Seedream has **no negative-prompt field**, and in-prompt negation
("no text", "without people") is unreliable. Prefer **positive
description**: say what you DO want ("a clean, empty plaza" instead of
"no people"). The build script refuses prompts that lean entirely on
negation tokens.

## Provenance and policy

- Some Seedream front-ends stamp a **visible wordmark** (e.g. Jimeng's
  "★ 即梦AI"); others offer a watermark toggle. Surface to downstream
  consumers when provenance matters.
- The user must hold rights to every uploaded reference image, and the
  output must comply with the platform's content policy.

## Translation notes

Model-specific quirks (earlier-token weighting, 30–100 word budget,
quoted-text rule, ~10 reference cap, identity-on-Image-1, sequential
sets, palette/beautification tendencies, no negative field) live in
`references/translation-notes.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log
line:

```json
{
  "skill": "gen-prompting-seedream-4-5",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2I|Edit|MR|sequential-set",
    "reference_count": 0,
    "set_count": 0,
    "in_image_text_present": false,
    "in_image_text_quoted": false,
    "aspect_ratio": "1:1",
    "resolution": "2K",
    "word_count": 0,
    "style_anchor": "<one-line>"
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present vs defaulted; word count within 30-100; in-image text quoted; for MR, identity is on Image 1 and refs <= 10; for sequential-set, count named and style locked globally>"
}
```

Pick `defer-to-user` if: in-image text is present but not quoted; a
sequential-set is requested without a count; an MR request has no clear
identity anchor on Image 1; or the prompt exceeds the word budget by a
wide margin.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
subject-first skeleton, checks the 30–100 word budget, requires
in-image text to be quoted, enforces the ~10 reference cap and
ordinal labelling for MR, validates set counts and the global style
lock for sequential-set mode, refuses negation-only prompts, and prints
the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2I --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..."
```

For a sequential set:

```
python3 scripts/build-prompt.py --mode sequential-set \
    --subject "..." --style "..." --set-count 6 \
    --frame "Image 1: ..." --frame "Image 2: ..." ...
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
