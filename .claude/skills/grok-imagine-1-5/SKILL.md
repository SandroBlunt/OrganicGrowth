---
name: gen-prompting-grok-imagine-1-5
description: >
  Translate a user's video-generation intent into a production-ready,
  moderation-aware prompt for Grok Imagine 1.5 (video) on grok.com, the X
  app, or the Grok Imagine app (xAI). Covers text-to-video, image-to-video
  (the preferred, highest-consistency mode), video extension, and reference
  guidance (1-7 style / character images). Its signature is
  moderation-aware prompting: Grok's video filter predicts motion and scores
  realism plus harm, so the skill front-loads a high-risk-trigger scanner and
  a risky-to-safer rephrasing table alongside the camera, motion, and native
  sound rules. Invoke whenever the user asks for a video clip on the Grok
  Imagine stack.
user-invocable: true
---

# Prompting for Grok Imagine 1.5 (video)

Use this skill to author prompts for **Grok Imagine 1.5**, xAI's video
model, on its front-ends (**grok.com**, the **X** app, and the **Grok
Imagine** app). The focus is the **prompt you type and the on-screen
settings you pick** — not API code.

Grok Imagine's video generation is **motion- and audio-aware**: the model
evaluates predicted frames, movement dynamics, and realism signals. Its
**video filter is stricter than its image filter** because it analyses
motion over time. That makes **moderation-aware prompting** a first-class
concern here, not a footnote — see the Moderation section below.

Modes:

- **T2V** — text-to-video. A prompt invents the whole scene. Most creative
  freedom, least identity consistency.
- **I2V** — image-to-video. A still is the **first frame**; the prompt
  describes only **what changes**. **Preferred** — strongest quality and
  subject consistency in 1.5.
- **extend** — video extension. Continue from the **last frame** of an
  existing clip for a longer sequence.
- **reference** — reference guidance. **1-7** style / character images lock
  a look or a character. Cannot always be combined with a first-frame image.

**Recommended workflow for highest quality:** generate or refine a strong
still first, then animate it with a focused motion prompt (I2V). This gives
far better subject consistency, lighting, and composition than pure T2V —
and a clean still is easier to pass moderation before you add motion.

Native audio: Grok generates **sound in the same pass** as the picture.
Every prompt **must** include a Sound section — the build script refuses one
without it.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to this
skill folder). Read those before writing a prompt for the first time.

## When to invoke

- User asks for a generated video clip and names Grok, Grok Imagine,
  grok.com, or the X / Grok Imagine app.
- User has a still and wants it animated on the Grok stack (I2V).
- User wants to continue an existing clip into a longer sequence (extend).
- User wants a consistent character or style across clips (reference).
- User has a prompt that keeps getting **flagged** and wants it rewritten to
  pass while keeping the creative intent.

Do not invoke this skill for stills, or for other video stacks (use the Veo,
Kling, Seedance, Seedream, or Happy Horse skills instead).

## Inputs the consuming agent provides

1. **Mode** — `T2V`, `I2V`, `extend`, or `reference`.
2. **Camera move** — ONE cinematic move, front-loaded (see Camera).
3. **Subject + action** — what is on screen and what it does, with
   **intensity and timing** ("slowly rises and turns" beats "moves").
4. **Environment / atmosphere** — setting, time, weather, atmosphere as
   motion (rain in sheets, wind moving fabric, puddles splashing).
5. **Lighting + style** — prefer cinematic / film-look / stylized over pure
   photorealism.
6. **Reference assets** — I2V: one first-frame image. extend: one source
   clip. reference: 1-7 style / character images.
7. **Sound** (REQUIRED) — dialogue (short, in quotes), SFX / foley,
   ambience, music. Specific and spatial.
8. **Duration / aspect ratio** — on-screen settings.

## Core prompt principles

- **One primary action + one camera move per clip.** Competing actions or
  stacked camera paths degrade quality AND raise flag risk. The build script
  rejects a camera clause that stacks moves.
- **Front-load important information.** What you describe early appears
  earlier in the clip. Lead with the camera move, then the key action.
- **Be specific with intensity and timing.** "Slowly rises and turns" is
  better than "moves"; "crisp, synchronized footwork" beats "dancing".
- **Always include a Sound section.** Native audio is one pass — vague or
  missing sound produces weaker results. Sound goes **last**.
- **Keep clips focused.** 5-8 seconds is the stability sweet spot; up to 15 s
  is possible but riskier for coherence.
- **Positive direction only.** Describe what you want, not what to avoid.
  There is no negative-prompt field.

## Prompt structures

### A. Text-to-video (T2V) template

```
[Shot type / camera move], [main subject doing a specific action with
intensity and timing], [environment and atmospheric details], [lighting
and style].
Sound: [specific ambient, foley, and any dialogue in quotes].
```

Worked example (safe cinematic):

```
Medium tracking shot alongside two performers moving through a precise
athletic stage routine in a rain-soaked narrow alley at night. Their
footwork splashes through puddles in synchronized timing. High-contrast
film-noir lighting, neon reflections on wet surfaces, deep shadows.
Sound: rhythmic theatrical thuds of stage movement, boots splashing in
puddles, heavy rain on concrete and brick, distant muffled traffic.
```

### B. Image-to-video (I2V) template — preferred for quality

The image already supplies composition, identity, lighting, and style. The
prompt should describe **only what changes** — never re-describe the whole
scene, or the model may reinterpret the starting frame.

```
Begin from the attached image and preserve subject placement, face,
clothing, and overall composition.
[Camera move], [specific subject motion with timing and intensity],
[environmental motion if any].
Sound: [precise description].
```

Strong short version (when the still is already excellent):

```
Slow continuous arc around the performers as they complete their precise
athletic stage routine. Controlled theatrical movements, feet splashing
through puddles.
Sound: theatrical stage impacts, rain hammering surfaces, distant traffic.
```

### C. Video extension (extend)

Continue from the last frame of an existing clip — motion, lighting, and
character position carry forward. Describe **what happens next** in one
beat, plus one camera move and the Sound.

### D. Reference guidance (reference)

Attach **1-7** style / character images to lock a look or a character across
clips. Say what each reference is for. Note: reference images cannot always
be combined freely with a first-frame image.

## Camera & motion language that works

Front-load ONE move. Known moves the build script recognises:

- **push-in** (slow push-in), **dolly** (gentle dolly forward), **orbit**
  (smooth orbit), **tracking** (tracking shot alongside), **arc** (slow arc
  around), **pan**, **tilt**, **zoom**, **crane** (gentle crane up),
  **static / locked-off**, **handheld** (handheld follow — use sparingly).

Motion intensity words: controlled, precise, synchronized, fluid, crisp
timing, theatrical, performative, athletic. Atmosphere as motion: rain
falling in dense sheets, wind moving fabric or hair, puddles splashing,
reflections shifting.

**Do NOT stack multiple camera moves in one clip.** One move per clip; chain
with `extend` for a longer sequence. The build script soft-rejects a clause
that names no known move OR that names more than one; `--override-camera`
bypasses both.

## Sound design (native, required)

Grok generates audio **with** the picture in one pass — there is no separate
"add audio" step, and a prompt with no Sound section is refused. Treat the
Sound section like a sound designer's notes and place it **last**.

- **Specific and spatial** wins. Good: "boots splashing through puddles,
  heavy rain hammering concrete and brick, distant muffled traffic." Weak:
  "city sounds" or "rain and action".
- **Dialogue** should be **short** and **in quotes** for a better lip-sync
  chance. Anchor it to a physical beat.

## Moderation-aware prompting (the signature)

Grok's video moderation is stricter than its image moderation. The system
**predicts motion and scores realism plus potential harm**. These tactics
raise pass rates while keeping the creative intent — especially for action,
physical, or high-intensity scenes.

**High-risk triggers to avoid or rephrase:**

- **Direct violence language:** fight, strike, punch, impact (as violence),
  attack, crash, explosion, blood, injury, struggle.
- **Extreme photorealism cues:** ultra-realistic, 8K photorealistic, raw
  footage, CCTV, documentary realism, found footage.
- **Real people, celebrities, or identifiable likenesses.**
- **Graphic or non-consensual implications.**

**Risky → safer rephrasing table:**

| Risky phrasing | Safer alternative |
| --- | --- |
| Stunt fight / fight choreography | Athletic stage routine / theatrical performance sequence / precise stage-combat rehearsal |
| Strike sells its impact | Synchronized beat / dramatic energy of the movement / theatrical exchange |
| Backing partner toward the wall | Guides the sequence toward the wall / leads the partner through the final movement |
| Real contact / hits | Controlled, pulled, safe stage movements / non-contact theatrical timing |
| Ultra-realistic / gritty realism | Cinematic film-noir look / high-contrast cinematic style / stylized film lighting |
| Heavy kinetic action | Fluid athletic timing / crisp, controlled choreography |

**Safety tactics:**

- **Explicitly label** the scene as staged, theatrical, rehearsed, safe,
  performative, fictional, or stage combat. The build script's `--staging`
  flag adds this framing.
- **Prefer cinematic** — "cinematic", "film look", "stylized", "concept",
  "theatrical" — over pure photorealism.
- **Break complex action** into short single-beat clips and `extend` later.
- **For borderline ideas,** generate a strong still first (easier to pass),
  confirm it is clean, then animate with a motion-only prompt.
- **Use cinematic, not documentary or surveillance framing.**
- **Keep prompts clear and direct** — overly long or ambiguous prompts raise
  risk scores.

The build script runs a **moderation-safety scanner** over every clause. If
it finds a high-risk term it **refuses** and lists each offending term with
its safer alternative. `--override-safety` is a conscious escape hatch — you
accept a higher flag risk.

## On-screen settings

- **Duration:** 1-15 s; **5-8 s is the sweet spot** for stability.
- **Aspect ratio:** 16:9, 9:16, 1:1, 4:3, 3:4 (default 16:9). In I2V the
  ratio usually follows the uploaded frame.

These are picked in the UI and are NOT part of the prompt the model reads.

## What Grok Imagine does NOT have

- **No negative-prompt field.** Say what you DO want; rephrase exclusions
  positively. The build script refuses negation-only prompts.
- **No separate audio step.** Sound is native and same-pass — always include
  it.

## Practical workflow tips

1. Iterate stills first, especially for characters or complex lighting.
2. Generate short clips (5-8 s) on one clear beat.
3. Use `extend` for longer sequences rather than forcing one long
   generation.
4. If a prompt is flagged: simplify, cut realism language, emphasise
   "theatrical / staged / cinematic", and retry.
5. Test variations — moving the Sound section or front-loading the camera
   move can change the outcome.

## Translation notes

Model-specific quirks (moderation-aware prompting, native audio, the four
modes, one-move-per-clip, no negative prompt, the front-end set, the 5-8 s
sweet spot) live in `references/translation-notes.md`. Source URLs and fetch
date live in `references/official-guidelines.md`.

## Provenance and policy

- Confirm watermark / provenance behaviour in-product before relying on it.
- The user must hold rights to every uploaded image and video, and output
  must comply with xAI's content policy. The moderation tactics here reduce
  **false-positive** flags on legitimate creative work; they are not a route
  around the policy.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log line:

```json
{
  "skill": "gen-prompting-grok-imagine-1-5",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|extend|reference",
    "reference_count": 0,
    "camera_move": "<one named move>",
    "camera_moves_stacked": false,
    "sound_present": true,
    "dialogue_present": false,
    "staged_framing": false,
    "moderation_hits": 0,
    "safety_overridden": false,
    "duration_s": 6,
    "aspect_ratio": "16:9",
    "char_count": 0
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: camera move front-loaded and single; subject+action follows with intensity+timing; Sound present and last; refs correct for mode (I2V=1 first frame, extend=1 clip, reference=1-7); moderation scan clean or consciously overridden; duration in 1-15 with 5-8 sweet spot>"
}
```

Pick `defer-to-user` if: the Sound section is empty; the camera clause names
no move or stacks moves (without an override); references are wrong for the
mode; the moderation scanner finds a high-risk term (without an override); or
duration falls outside 1-15.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and validate the
prompt before emitting it. It front-loads the camera move, orders
subject+action → environment → style, places Sound last, enforces the
one-move-per-clip rule (soft; `--override-camera` bypasses), enforces the
per-mode reference rules (I2V one first frame, extend one clip, reference
1-7), **requires** a Sound section, runs the **moderation-safety scanner**
(hard block; `--override-safety` bypasses), refuses negation-only prompts,
checks the 1-15 s duration and aspect-ratio set, and prints the assembled
prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2V \
    --camera "Medium tracking shot alongside the performers" \
    --subject "Two performers move through a precise athletic stage routine" \
    --action "their footwork splashes through puddles in synchronized timing" \
    --environment "rain-soaked narrow alley at night, neon reflections" \
    --style "high-contrast film-noir look, stylized film lighting" \
    --sfx "boots splashing, heavy rain on concrete, distant muffled traffic"
```

For I2V with dialogue and a staged label:

```
python3 scripts/build-prompt.py --mode I2V --staging \
    --camera "slow arc around the performers" \
    --subject "the two performers from the frame" \
    --action "complete their precise athletic stage routine" \
    --reference '{"kind":"image","role":"first frame"}' \
    --dialogue "We finish this together." \
    --ambience "rain hammering surfaces, distant traffic"
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
