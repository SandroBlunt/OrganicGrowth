---
name: gen-prompting-happy-horse
description: >
  Translate a user's video-generation intent into a production-ready prompt
  for the Happy Horse front-end (happy-horse.ai), which runs Alibaba's
  HappyHorse-1.0 video model. Covers text-to-video, image-to-video
  (first-frame), reference-to-video (up to 5 reference assets), and
  video-edit, plus Happy Horse's distinctive features: native synchronized
  audio (dialogue, SFX, ambience generated with the picture), multilingual
  lip-sync, the @Image1 / @Video1 reference-token syntax, and the six named
  camera moves. Invoke this skill whenever the user asks for a video clip on
  the Happy Horse stack.
user-invocable: true
---

# Prompting for Happy Horse

Use this skill to author prompts for the **Happy Horse** front-end
(happy-horse.ai), which generates video with Alibaba's **HappyHorse-1.0**
model. The focus is the **prompt you type and the on-screen settings you
pick** — not API code.

Modes (front-end):

- **T2V** — text-to-video. A prompt becomes a clip with native
  synchronized audio.
- **I2V** — image-to-video. An uploaded still is the **first frame**; the
  prompt drives the motion, camera, and any speech.
- **R2V** — reference-to-video. A prompt plus **up to 5 reference assets**
  (images and/or a video) for character, style, or camera-motion
  transfer.
- **edit** — video-edit. Natural-language changes to an existing clip
  (replace a character, add or remove something), with up to 5 reference
  assets.

Distinctive features:

- **Native audio.** Dialogue, sound effects, and ambience are generated
  *with* the picture in one pass — describe them in the prompt; there is
  no separate "add audio" step.
- **Multilingual lip-sync.** Talking characters lip-sync across English,
  Mandarin, Cantonese, Japanese, Korean, German, and French.
- **`@Image1` / `@Video1` tokens.** Bind an uploaded asset to a role
  inside the prompt — e.g. use it as the first frame, or copy its camera
  movement.
- **Six camera moves.** Pan, Tilt, Dolly, Zoom (incl. Hitchcock / dolly
  zoom), Orbit, Crane.

On-screen settings (you pick these in the UI, NOT part of the prompt):

- **Duration** — 4 to 15 seconds.
- **Resolution** — 480p, 720p, or 1080p.
- **Aspect ratio** — 16:9, 9:16, 1:1, 4:3, 3:4.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time.

## When to invoke

- User asks for a generated video clip and names Happy Horse,
  happy-horse.ai, or HappyHorse.
- User has a still and wants it animated on the Happy Horse stack
  (I2V).
- User has reference images / a reference video and wants a stylized or
  character-consistent clip (R2V).
- User wants to edit an existing clip — swap a character, add or remove
  an element (edit).
- User wants a talking character with synced dialogue, or a clip with
  specific sound effects / ambience.

Do not invoke this skill for stills, or for other video stacks (use the
Veo, Kling, or Seedance skills instead).

## Inputs the consuming agent provides

1. **Mode** — `T2V`, `I2V`, `R2V`, or `edit`.
2. **Subject + action** — what is on screen and what it does. Leads the
   prompt.
3. **Camera movement** — one of the six named moves, or "static". The
   build script enforces this softly: a camera clause that names
   neither passes only with the `--override-camera` escape hatch
   (useful for prose-only moves like "tracking shot" or "reference
   @Video1 for camera movement").
4. **Style** — look, grade, film stock, lighting mood.
5. **Environment / atmosphere** — setting, time, weather, particles.
6. **Reference assets** (I2V / R2V / edit) — uploaded images and/or a
   video, each bound with an `@Image1` / `@Video1` token. I2V uses one
   image (the first frame); R2V / edit accept up to 5.
7. **Audio intent** (optional) — dialogue lines (and language), sound
   effects, ambience, music. Native; describe it in the prompt.
8. **Sequence beats** (optional) — for multi-beat action, use "First…
   then… finally…".
9. **Duration / resolution / aspect ratio** — on-screen settings.

## The prompt formula

Happy Horse's own guidance recommends this order:

1. **Subject + action** — "A woman walks through a garden." Lead here.
2. **Camera movement** — "Camera slowly dollies in from medium to
   close-up."
3. **Style** — "Cinematic, shallow depth of field, warm tones."
4. **Environment / atmosphere** — "Golden hour, cherry blossoms
   falling."
5. **Audio** (if any) — describe dialogue, SFX, ambience LAST.

For a multi-beat shot, sequence the action with **"First… then…
finally…"**. Keep the whole prompt under the front-end's character
limit (≈2500 characters) — but short, specific prompts beat long ones,
and a single clip is one beat or a short chain, not a whole story.

## Mode 1 — Text-to-video (T2V)

### Strengths

- Strong character consistency, camera control, and motion quality.
- Native synchronized audio in one pass.
- Solid 1080p output.

### T2V prompt template

```
<Subject and action in one short sentence — leads the prompt>.
<Camera movement — one of the six named moves, with shot scale>.
<Style — grade, film stock, lighting mood>.
<Environment and atmosphere — setting, time, weather, particles>.
Audio (optional, LAST):
  Dialogue (<language>): <Speaker> says, "<line>."
  SFX: <description>.
  Ambience: <background soundscape>.
  Music: <genre / instrumentation / tempo, if used>.
```

### T2V worked example

```
A lone swordswoman steps into a rain-slicked Republican-era courtyard
and snaps into a guard stance.
Camera tracks behind her, then orbits 90 degrees to her left as she
turns.
Ultra-realistic, warm yellow lantern light, crisp detail, cinematic.
Night, heavy rain, puddles rippling, paper lanterns swaying.
Audio:
  SFX: rain hammering on tile, a sword sliding free of its scabbard.
  Ambience: distant thunder, wind through the courtyard.
```

## Mode 2 — Image-to-video (I2V)

Upload one still as the **first frame**, bound with `@Image1`. The
prompt then describes how the scene moves forward from it.

```
Use @Image1 as the first frame.
<Subject and action — what changes / moves from the first frame>.
<Camera movement>.
<Style and lighting hold — match the uploaded frame>.
Audio (optional, LAST): <as for T2V>.
```

Worked example:

```
Use @Image1 as the first frame.
The woman in the photo turns her head toward camera and smiles, hair
lifting slightly in the breeze.
Camera holds, then pushes in gently to a close-up.
Hold the warm golden-hour grade of the original frame.
Audio:
  Dialogue (English): she says softly, "You made it."
  Ambience: quiet seaside wind, distant gulls.
```

## Mode 3 — Reference-to-video (R2V)

Prompt plus **up to 5 reference assets** for character identity, style,
or camera-motion transfer. Bind each asset with a token: `@Image1`,
`@Image2`, … for stills; `@Video1` for a reference clip.

A distinctive move: **copy the camera motion from a reference video**
instead of describing it — "Fully reference @Video1 for all camera
movements."

```
<Subject and action>.
Use @Image1 for <character / identity>, @Image2 for <style / palette>.
Camera: <describe the move, OR "reference @Video1 for camera movement">.
<Style and environment>.
Audio (optional, LAST): <as for T2V>.
```

Worked example:

```
The mercenary from @Image1 sprints down a neon alley and slides behind
cover as sparks fly.
Use @Image1 for the character, @Image2 for the gritty 2080s palette.
Reference @Video1 for all camera movements.
Anamorphic lens flares, rain-slicked ground, high neon-to-shadow
contrast.
Audio:
  SFX: ricochets, electrical sparks, fabric rustle.
  Ambience: rain, distant sirens, low synth drone.
```

## Mode 4 — Video-edit (edit)

Change an existing clip with natural language — replace a character,
add or remove an element. Bind the source clip and any references with
tokens; keep everything you do not mention unchanged.

```
On @Video1: <one positive instruction — replace / add / remove>.
Use @Image1 for <the new element or character>.
Keep everything else unchanged — same camera, timing, and grade.
Audio (optional, LAST): <only if the edit changes the sound>.
```

Worked example:

```
On @Video1: replace the red sports car with a vintage cream convertible.
Use @Image1 for the convertible's exact look.
Keep everything else unchanged — same road, lighting, camera move, and
timing.
```

## Camera & motion control

Happy Horse exposes **six named camera moves**. Name the move in the
camera clause; describe intensity and direction in prose (there is no
numeric motion slider).

| Move | What it does |
| --- | --- |
| **Pan** | Horizontal rotation, left / right. |
| **Tilt** | Vertical rotation, up / down. |
| **Dolly** | Camera moves toward / away from the subject. |
| **Zoom** | Focal-length change; supports the Hitchcock / dolly zoom. |
| **Orbit** | Circular path around the subject. |
| **Crane** | Vertical rise / descent. |

Also usable in prose: "tracking shot", "behind-tracking", "low-angle
orbit", "pan right 90 degrees", "follows the protagonist". To reuse a
real move exactly, point at a reference clip: **"reference @Video1 for
camera movement."** Note: the build script soft-rejects a camera
clause that names none of the six moves nor "static"; pass
`--override-camera` for prose-only phrasings like these.

## Audio (native, synchronized)

Happy Horse generates audio **with** the picture — there is no toggle.
Describe what you want to hear, and put the audio block **after** all
visual description.

- **Dialogue:** name the language and quote the line —
  `Dialogue (Japanese): the old man says, "おかえり。"` Speaker
  attribution + a physical action just before the line drives accurate
  lip-sync.
- **SFX:** `SFX: a sword unsheathes with a metallic ring.`
- **Ambience:** `Ambience: the quiet hum of a starship bridge.`
- **Music:** `Music: gentle piano with building strings.`

Supported lip-sync languages: English, Mandarin, Cantonese, Japanese,
Korean, German, French. Never interleave audio with visuals — audio is
always last.

## What Happy Horse does NOT have

Do not write prompts around these — they do not exist on this stack:

- **No negative-prompt field.** Say what you DO want; rephrase
  exclusions positively.
- **No motion-strength slider.** Express motion intensity in prose
  ("a slow, gentle push-in" vs "a fast whip-pan").
- **No last-frame / end-frame input.** I2V takes a first frame only.
  For a start-and-end transition, choose a different stack (e.g. the Veo
  or Kling F/L skills).

## On-screen settings

- **Duration:** 4–15 seconds. One clip is a single beat or a short
  chain — not a full narrative.
- **Resolution:** 480p, 720p, or 1080p. Use 1080p for final work.
- **Aspect ratio:** 16:9, 9:16, 1:1, 4:3, 3:4. (In I2V the ratio is
  usually taken from the uploaded frame.)

## Negation

Happy Horse has no negative-prompt field, and in-prompt negation is
unreliable. Prefer positive description ("an empty street" instead of
"no people"). The build script refuses prompts that lean entirely on
negation tokens.

## Provenance and policy

- The Happy Horse front-end advertises no visible watermark on output;
  confirm in-product before relying on it for provenance-sensitive use.
- The user must hold rights to every uploaded image and video, and the
  output must comply with the platform's content policy.
- Note: happy-horse.ai is one of several front-ends to HappyHorse-1.0;
  the underlying model is Alibaba's. See `references/translation-notes.md`.

## Translation notes

Model-specific quirks (native audio, multilingual lip-sync, reference
tokens, six camera moves, no negative / no motion slider / no last
frame, duration and resolution ranges, the front-end-vs-model
distinction) live in `references/translation-notes.md`.

## Observability Checkpoint

Before emitting the final prompt to the model, emit a structured log
line:

```json
{
  "skill": "gen-prompting-happy-horse",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|R2V|edit",
    "reference_count": 0,
    "camera_move": "<named move or static>",
    "audio_intent_present": false,
    "dialogue_present": false,
    "dialogue_language": "<language or none>",
    "sequence_beats": 0,
    "duration_s": 5,
    "resolution": "1080p",
    "aspect_ratio": "16:9",
    "char_count": 0
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: subject+action leads; camera move named; audio (if any) placed last with language for dialogue; reference tokens bound; I2V has exactly one first-frame image; R2V/edit refs <= 5; under the character limit>"
}
```

Pick `defer-to-user` if: I2V has no first-frame image; R2V / edit
exceed 5 references; dialogue is requested without a language; or the
assembled prompt exceeds the character limit.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
subject-first → camera → style → environment order, places audio last,
binds reference tokens, enforces the one-first-frame rule for I2V and
the 5-reference cap for R2V / edit, checks that the camera clause
names one of the six moves or "static" (soft; `--override-camera`
bypasses), checks the duration and resolution ranges, refuses
negation-only prompts, and prints the assembled prompt to stdout.

```
python3 scripts/build-prompt.py --mode T2V --subject "..." --action "..." \
    --camera "..." --style "..." --environment "..."
```

For dialogue + reference:

```
python3 scripts/build-prompt.py --mode I2V \
    --subject "..." --action "..." --camera "..." \
    --reference '{"kind":"image","role":"first frame"}' \
    --dialogue "English|she says, \"You made it.\""
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
