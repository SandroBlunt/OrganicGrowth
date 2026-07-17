---
name: gen-prompting-chatgpt-image-2
description: >
  Translate a user's image-generation intent into a production-ready prompt
  for OpenAI's ChatGPT Image 2 (gpt-image-2). Covers text-to-image,
  image-to-image edit, and multi-reference edit (practical cap of four
  references). Invoke this skill whenever the user asks for a new image,
  an edit to an existing image, or a multi-reference composite using
  gpt-image-2.
user-invocable: true
---

# Prompting for ChatGPT Image 2 (gpt-image-2)

Use this skill to author prompts for OpenAI's `gpt-image-2` model. It covers
three modes:

- **T2I** — text-to-image, no reference.
- **I2I** — image-to-image, single reference, edit semantics.
- **MR** — multi-reference edit, two to four references, composite semantics.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/photography.md`,
`../../../references/lighting.md`, and
`../../../references/cinematography.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time, then return here for model-specific behaviour.

## When to invoke

- User asks for a generated still image and names ChatGPT Image 2,
  gpt-image-2, or "the OpenAI image model".
- User asks to edit an image they uploaded and is on the OpenAI stack.
- User asks for a composite of two to four images on the OpenAI stack.
- A higher-level skill (e.g. a brand-asset workflow) delegates image
  generation and the chosen vendor is OpenAI.

Do not invoke this skill for video, for Google's image models, or for
non-OpenAI image stacks.

## Inputs the consuming agent provides

1. **Mode** — one of `T2I`, `I2I`, `MR`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference images** (I2I, MR only) — list with role per image.
4. **Aspect ratio** — `1:1`, `3:2`, `2:3`, `16:9`, `9:16`. Default `1:1` if
   not specified.
5. **Style anchor** — optional. Photography stock, illustration tradition,
   render style. If absent, default to "natural photograph, neutral grade".
6. **Negative cues** — optional. Things to avoid; rephrase to positive
   statements before emitting (see prompt discipline).

## Mode 1 — Text-to-image (T2I)

### Five-clause skeleton

Apply the cross-model skeleton from `prompt-discipline.md`:

1. Subject
2. Action / pose
3. Setting / context
4. Style / medium
5. Camera / framing / light

ChatGPT Image 2 weights early tokens heavily. Lead with the subject unless
the setting is the point.

### Strengths

- Strong text rendering inside the image (signs, labels, short copy).
- Reliable instruction-following on counts and arrangement of objects.
- Good at compositional logic ("on top of", "to the left of") relative to
  prior generations.

### Known weaknesses

- Skin defaults to slightly smoothed; request "natural skin texture, pores
  visible" when realism matters.
- Long prose prompts past ~120 words underperform shorter focused ones.
- Negation is unreliable even with the dedicated parameter; prefer positive
  description.

### T2I prompt template

```
<Subject in one short sentence>.
<Action or pose in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor in one short sentence — pick a photographic stock or a
named illustration tradition; do not stack three.>
<Camera, framing, light direction, light quality in one or two short
sentences.>
```

### T2I worked example

User wants: "A barista pulling an espresso shot in a small Melbourne cafe,
warm and quiet."

Emitted prompt:

```
A focused barista in a charcoal apron tamps and pulls a shot from a
brushed-steel espresso machine.
The barista's hands rest on the portafilter; steam rises from the group
head.
A small Melbourne specialty cafe at 7:30 am; timber counter, hand-glazed
ceramics, soft warm interior light.
35 mm photograph, Kodak Portra 400 palette, gentle film grain.
Medium close-up at 50 mm, three-quarter angle from the customer side, key
from a wide street-side window camera-left, warm interior practicals as
fill, natural skin texture with visible catchlights.
```

## Mode 2 — Image-to-image (I2I)

### What I2I does

Edits a single supplied reference. Honours the reference's composition,
subject identity, and most of its lighting unless the prompt overrides.
Use I2I for: outfit swap, background swap, expression change, season
change, lighting change on the same set, brand re-skin.

### I2I prompt template

```
Reference: <one-line description of what is in the supplied image, so
the agent and the model agree on the starting state>.
Edit: <one short sentence per change. List the changes; do not re-describe
the parts you want preserved.>
Preserve: <one short sentence naming the elements that must not change —
identity, framing, key light direction, brand element.>
Style hold: <one short sentence — match the original photographic or
illustrative style unless otherwise specified.>
```

### I2I worked example

User uploads a daylight portrait and wants the same person at golden hour.

Emitted prompt:

```
Reference: half-body portrait of a woman in a denim jacket, eye level,
50 mm look, overcast daylight, neutral grey background.
Edit: change the lighting to low golden-hour sun from camera-left, add
a warm rim on the right shoulder and hair, shift background to a soft
out-of-focus suburban street at sunset.
Preserve: subject's identity, pose, framing, denim jacket, hair shape.
Style hold: 35 mm photograph, Kodak Portra 400 palette, natural skin
texture with visible pores and catchlights.
```

## Mode 3 — Multi-reference edit (MR)

### Practical cap

The OpenAI API will accept several reference inputs, but quality degrades
above four for `gpt-image-2`. **Cap MR at four references.** If the user
needs more, ask them to consolidate.

### Role naming is mandatory

Each reference must be named with a role. Without role naming, the model
averages references and produces composite artifacts.

### MR prompt template

```
References:
  1. <role of image 1 — e.g. "subject's face">
  2. <role of image 2 — e.g. "outfit">
  3. <role of image 3 — e.g. "set / background">
  4. <role of image 4 — e.g. "overall lighting and palette reference">
Goal: <one short sentence describing the composite to be produced.>
Composition: <one short sentence about framing and subject placement.>
Style hold: <one short sentence — usually inherits from the lighting
reference.>
```

### MR worked example

References supplied:
1. Headshot of a model.
2. A specific blazer on a hanger.
3. A studio cyc background, charcoal seamless.
4. A previous campaign image with the desired key-light direction.

Emitted prompt:

```
References:
  1. Subject's face and identity.
  2. Outfit: charcoal blazer (single button, peak lapel).
  3. Set: charcoal seamless cyc background, evenly lit.
  4. Lighting and palette reference: large soft key from camera-left at
     45 degrees, low-key fill, neutral grade.
Goal: editorial three-quarter portrait of the subject wearing the
reference blazer against the reference cyc.
Composition: medium close-up, eye level, subject on the left third
facing camera-right, head and shoulders fully in frame.
Style hold: match reference 4 — soft key from camera-left at 45 degrees,
low-key fill, neutral grade, natural skin texture with visible pores
and catchlights.
```

## Translation notes

Model-specific quirks (negation behaviour, text rendering caveats,
aspect-ratio rules) live in `references/translation-notes.md`. Read it
once when adopting this skill and on every model version bump.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log line:

```json
{
  "skill": "gen-prompting-chatgpt-image-2",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2I|I2I|MR",
    "reference_count": 0,
    "aspect_ratio": "1:1",
    "style_anchor": "<one-line>"
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: which clauses are present, which were defaulted, any model-specific concerns flagged in translation-notes>"
}
```

Pick `defer-to-user` when the inputs leave more than two of the five
clauses to default, or when the user's intent contradicts a translation
note (e.g. they asked for negation as the primary control).

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and validate
the prompt before emitting it. The script enforces the five-clause
skeleton, refuses negation-only prompts, caps MR at four references, and
prints the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2I --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..."
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
