---
name: gen-prompting-grok-imagine
description: >
  Translate a user's image-generation intent into a production-ready prompt
  for xAI's Grok Imagine image generation (text-to-image and image editing /
  image-to-image), for use on a front-end (grok.com, X, or the Grok Imagine
  app). This is the still-image companion to the Grok Imagine 1.5 video
  skill. Covers subject-first natural-language prompting, lighting-led
  direction (the highest-leverage element), the change + keep editing
  structure that holds consistency, and — the signature feature —
  moderation-aware prompting that reframes risky wording (extreme
  photorealism, violence, named real people, suggestive framing, brands)
  into safer cinematic / theatrical / stylized language so creative work
  passes the image filters. Invoke whenever the user asks for a still image
  or an image edit on the Grok Imagine stack.
user-invocable: true
---

# Prompting for Grok Imagine (image generation)

Use this skill to author prompts for **xAI's Grok Imagine** image
generation on a front-end (grok.com, X, or the Grok Imagine app). The
focus is the **prompt you type and the on-screen settings you pick** —
not API code. This is the **still-image companion** to the Grok Imagine
1.5 video skill; the two are structured the same way so you can move
between them.

Image generation is generally **less strict than video** because there is
no motion analysis — but the filters still scan for **photorealism
signals, real-person likenesses, violence, explicit content, and
trademarked brands**. Getting good creative work through cleanly is as
much about *how you frame it* as *what you ask for*. That moderation
craft is this skill's signature (see § Moderation-aware prompting).

Modes:

- **T2I** — text-to-image, from a text prompt only. Create a new scene
  from scratch: full description of subject, setting, style, lighting,
  and composition.
- **edit** — image editing / image-to-image on one uploaded image. Make a
  targeted change while preserving identity, composition, or style, using
  the **change + keep** structure.

Recommended workflow: generate a **strong base image first**, then iterate
with targeted edit prompts. This is faster and more consistent than
rewriting a full prompt every time. For character consistency across many
images, lock a base portrait first, then edit variations.

On-screen settings (you pick these in the UI, they are NOT part of the
prompt text):

- **Aspect ratio** — match it to the final use: portrait for characters,
  landscape for environments, square for social. See § Aspect ratios.
- **Resolution** — Grok Imagine sizes the output for you; treat it as an
  on-screen concern, never as prompt text.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/photography.md`,
`../../../references/lighting.md`,
`../../../references/cinematography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time, then return here for model-specific behaviour.

## When to invoke

- User asks for a generated **still image** and names Grok, Grok Imagine,
  or generating on grok.com / X.
- User wants to **edit** an uploaded image — relight it, change the
  background, swap clothing or weather, adjust an expression — while
  keeping identity and composition.
- User has a creative image idea that keeps getting **flagged / blocked**
  and wants it rephrased to pass the filters while holding the creative
  direction (this skill's signature).

Do not invoke this skill for **video** — use the Grok Imagine 1.5 video
skill instead. Do not invoke for non-Grok image stacks (use the Seedream,
Nano Banana, or ChatGPT-Image skills).

## Inputs the consuming agent provides

1. **Mode** — `T2I` or `edit`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference image** (edit only) — the one uploaded image, described.
4. **Change** (edit only) — what to change.
5. **Keep** (edit only) — what must stay identical.
6. **Lighting** — required for T2I; the highest-leverage element.
7. **Style / medium** — required for T2I; name it early.
8. **Camera / composition** — optional shot, angle, lens, framing.
9. **Aspect ratio** — on-screen setting.
10. **Risk flags** — any known-sensitive content to reframe (see
    § Moderation-aware prompting).

## Core prompt principles

- **Lead with the main subject.** The beginning of the prompt carries the
  most weight — Grok commits hardest to what it reads first.
- **Use natural language and full sentences.** Grok Imagine responds
  better to clear descriptive prose than to long keyword lists.
- **Be specific about lighting.** This is one of the highest-leverage
  elements — the single biggest lever on how a shot reads.
- **Name a clear style or medium early** (cinematic, photorealistic,
  illustration, concept art, film still).
- **Keep one primary focus.** Crowded prompts with many competing
  elements produce weaker results.
- **Positive direction only.** Describe what you want, not long lists of
  what to avoid. A short "keep / preserve" clause is the sanctioned
  exception in editing.
- **Length: roughly 30–80 words** for most scenes. The build script
  hard-stops past 100 words.

## Mode 1 — Text-to-image (T2I)

### T2I prompt structure

```
[Main subject with key traits and pose/action], [environment and
setting], [lighting description], [camera angle / shot type / lens],
[style and mood], [any finishing details].
```

Subject leads. Lighting and a named style are required — the build script
refuses a T2I prompt missing either.

### T2I worked example

```
Two professional performers mid-rehearsal of a precise athletic stage
routine in a rain-soaked narrow alley at night, costumes soaked, one
guiding the other toward a brick wall. High-contrast film-noir lighting
with neon and practical lights reflecting on wet concrete and brick,
deep shadows, glistening surfaces. Medium-wide cinematic shot, shallow
depth of field, gritty but theatrical film look.
```

## Mode 2 — Image editing / image-to-image (edit)

One uploaded image. Split the prompt into a **change clause** and a
**keep clause** — this "change + keep" structure is the most reliable way
to hold consistency. The build script requires both, plus exactly one
reference.

### Edit prompt structure

```
[What to change — lighting, background, expression, clothing, weather].
Keep [face, expression, pose, clothing, composition, identity, framing]
exactly the same.
```

### Edit worked example

```
Relight the scene as heavy night rain with neon reflections on every
wet surface and deeper shadows. Keep the two performers' faces, poses,
costumes, and exact composition unchanged.
```

### Editing best practices

- **Be explicit about what stays identical** — face, clothing, pose,
  composition, lighting direction if it matters.
- **Name objects by distinctive attributes** — "the soaked dark jacket",
  "the brick wall on the right" — not generic terms.
- **One major change at a time** for the best control.
- **Base portrait first** for character consistency across a set, then
  edit variations while locking identity.

## High-impact elements

**Lighting** (highest leverage). Soft golden hour, dramatic side light,
high-contrast film-noir, neon rim light, overcast diffused, studio
softboxes, volumetric god rays, wet specular highlights.

**Camera & composition.** Shot type (close-up, medium, wide, low / high
angle, eye-level); lens language (35mm, 50mm, 85mm f/1.4, shallow depth
of field, wide-angle); framing (rule of thirds, centered, tight crop,
environmental portrait).

**Style & mood.** Cinematic film still, photorealistic, concept art,
digital illustration, painterly, film-noir, editorial fashion; mood words
(tense, atmospheric, dramatic, intimate, epic, gritty, elegant).

**Technical / quality cues — use sparingly.** A light touch of "high
detail" or "professional color grading" is fine. **Avoid stacking "8K,
ultra-detailed, masterpiece, best quality"** — they add little and can
raise realism flags. The build script treats that stack as a moderation
risk and refuses it.

## Moderation-aware prompting (signature)

Image filters scan **predicted realism, identity risk, violence, explicit
content, and brands**. Safe creative prompts pass far more reliably when
you reframe risky wording. The build script's moderation scanner refuses a
prompt containing the risky terms below and points you to the safer
rephrasing; `--override-safety` bypasses it, accepting a higher flag risk.

### Risky → safer table

| Risky element | Safer approach / rephrasing |
| --- | --- |
| Extreme photorealism cues ("8K photorealistic", "raw footage", "CCTV", "documentary realism", "ultra-realistic") | "Cinematic film still", "high-contrast film-noir look", "stylized cinematic", "concept art", "painterly" |
| Named real people or celebrities | Generic descriptions ("a professional performer", "a woman in her 30s with short dark hair") |
| Direct violence language (fight, strike, punch, blood, injury, attack) | "Athletic stage routine", "theatrical performance", "precise choreographed sequence", "dramatic rehearsal pose" |
| Suggestive or body-focused framing without context | Fashion editorial, cinematic portrait, dance performance, artistic study |
| Trademarked brands / logos | Generic unbranded equivalents |

### Tactics

- **Frame physical or intense scenes as staged, theatrical, rehearsed,
  cinematic, or fictional.**
- **Prefer artistic / cinematic language over documentary / photorealistic
  framing** when the subject involves people in dynamic poses.
- **For action stills**, emphasize "controlled", "precise",
  "performative", "stage-combat aesthetic", or "film production still".
- **Generate a cleaner stylized base first** if a realistic version keeps
  getting flagged, then refine.
- **Do not combine multiple mild risk signals** in one prompt (extreme
  realism + physical confrontation + dark gritty setting). Any one alone
  is usually fine; together they compound.

### Safety-optimized example (action-style still)

```
Cinematic film still of two professional performers in a precise,
controlled athletic stage routine inside a rain-soaked narrow alley at
night. Costumes soaked through, one guiding the other toward a brick wall
in theatrical timing. High-contrast film-noir lighting, neon and
practical lights reflecting off wet surfaces and brick, deep shadows,
glistening textures. Medium-wide shot with crisp detail on the figures,
atmospheric and dramatic mood.
```

This preserves the visual direction while reducing violence and
extreme-realism signals.

## Aspect ratios

Grok Imagine offers common presets — `1:1`, `16:9`, `9:16`, `4:5`, `5:4`,
`3:4`, `4:3`, `3:2`, `2:3`, plus `auto`. Match the ratio to the final use:
**portrait for characters, landscape for environments, square for
social.** When you plan to animate the still later (Grok Imagine 1.5
video), design it with clear space for motion and a strong, stable
composition. The build script accepts this preset set plus `auto`.

Resolution is not a prompt concern — Grok Imagine sizes the output.

## Negation

Grok Imagine has **no negative-prompt field**, and in-prompt negation
("no text", "without people") is unreliable. Prefer **positive
description**: say what you DO want ("a clean, empty plaza" instead of "no
people"). The build script refuses negation-only prompts; the short edit
keep-clause is the one sanctioned preserve statement.

## Provenance and policy

- The user must hold rights to any uploaded reference image, and the
  output must comply with the platform's content policy. The
  moderation-aware tactics here are for getting **legitimate creative
  work** through the filters cleanly — not for defeating policy.

## Translation notes

Model-specific quirks (subject-first weighting, lighting-led direction,
the 30–80 word budget, the change + keep editing structure, and the full
moderation risk table with tactics) live in
`references/translation-notes.md`. Source URLs, fetch date, and known
uncertainties live in `references/official-guidelines.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log line:

```json
{
  "skill": "gen-prompting-grok-imagine",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2I|edit",
    "reference_count": 0,
    "subject_present": false,
    "lighting_present": false,
    "style_named": false,
    "change_present": false,
    "keep_present": false,
    "word_count": 0,
    "aspect_ratio": "1:1",
    "moderation_hits": [],
    "override_safety": false
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: subject leads and lighting + style present for T2I; for edit, exactly one reference with both a change and a keep clause; word count within 30-80; moderation scanner clean (or override_safety acknowledged); aspect ratio a valid preset>"
}
```

Pick `defer-to-user` if: a T2I prompt is missing a subject, a lighting
clause, or a named style; an edit request lacks a change clause, a keep
clause, or exactly one reference; the moderation scanner flags a risky
term and no reframing or explicit override was chosen; or the prompt
exceeds the word ceiling.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and validate
the prompt before emitting it. The script enforces the subject-first
structure, requires a lighting clause and a named style for T2I, requires
a change clause + a keep clause + exactly one reference for edit, checks
the 30–80 word budget (hard ceiling 100), runs the moderation-safety
scanner (refusing risky terms with a safer rephrasing, bypassed by
`--override-safety`), refuses negation-only prompts, validates the aspect
ratio, and prints the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2I --subject "..." \
    --environment "..." --lighting "..." --camera "..." --style "..."
```

For an edit (`--change` and `--keep` are both required, `--reference`
takes the one uploaded image):

```
python3 scripts/build-prompt.py --mode edit --reference "..." \
    --change "Relight as heavy night rain with neon reflections." \
    --keep "the faces, poses, costumes, and exact composition"
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
