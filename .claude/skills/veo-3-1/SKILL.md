---
name: gen-prompting-veo-3-1
description: >
  Translate a user's video-generation intent into a production-ready prompt
  for Google's Veo 3.1. Covers text-to-video, image-to-video, "Ingredients
  to Video" (multi-reference, formerly MR; 1 to 3 references mutually
  exclusive with first-and-last frame), first-and-last frame, timestamp
  prompting (multi-shot in one generation), explicit dialogue and SFX
  syntax, the Add/Remove Object mode (Veo 2 model, no audio), and the F/L
  hand-off from Nano Banana 2. Invoke this skill whenever the user asks
  for a video clip on the Google video stack.
user-invocable: true
---

# Prompting for Veo 3.1

Use this skill to author prompts for Google's Veo 3.1 video model. It
covers the following modes and techniques.

Modes:

- **T2V** — text-to-video, no reference.
- **I2V** — image-to-video, single image as the starting frame.
- **Ingredients to Video** (also known as MR or R2V) — multi-reference
  with 1 to 3 reference images for character, object, scene, or style
  consistency. **Mutually exclusive with F/L mode.**
- **F/L** — first-and-last frame, two images that anchor the start and
  end. **Mutually exclusive with Ingredients to Video.**
- **Add/Remove Object** — introduces or removes an object in an
  existing video. **Uses the Veo 2 model. No audio.** Lower-priority
  mode for surgical edits.

Layered techniques:

- **Timestamp prompting** — multi-shot in a single generation using
  `[00:00–00:02]` brackets. Up to 4 segments inside an 8-second clip.
- **Dialogue and SFX syntax** — explicit speaker attribution + quoted
  lines; `SFX:` and `Ambient noise:` prefixes.
- **F/L hand-off from Nano Banana 2** — Nano Banana 2 generates the
  start and end frames; Veo 3.1 F/L interpolates between them.

The shared discipline lives in
`../../../references/prompt-discipline.md`,
`../../../references/cinematography.md`,
`../../../references/lighting.md`,
`../../../references/photography.md`, and
`../../../references/production-design.md` (paths relative to
this skill folder). Read those before writing a prompt for the first
time.

## When to invoke

- User asks for a generated video clip and names Veo, Veo 3, Veo 3.1,
  or "the Google video model".
- User has a still and wants it animated on the Google video stack.
- User has a start frame and end frame and wants the in-between motion
  generated.
- User has 1–3 reference stills and names Ingredients to Video, MR, or
  multi-reference for subject identity, style, or set.
- User wants multi-shot output in a single 8-second clip via timestamp
  prompting.
- User wants to add or remove an object from an existing clip
  (Add/Remove Object mode).

Do not invoke this skill for stills, for non-Google video stacks, or
for clips longer than the model's per-call duration limit (4, 6, or 8
seconds; chain at the consuming-agent layer).

## Inputs the consuming agent provides

1. **Mode** — `T2V`, `I2V`, `Ingredients`, `F/L`, or `AddRemove`.
2. **Subject brief** — what the user wants. Free prose.
3. **Reference images** (I2V, Ingredients, F/L) — list with role per
   image. F/L needs exactly two: one labelled `first`, one `last`.
   Ingredients accepts 1–3.
4. **Aspect ratio** — `16:9` (preferred) or `9:16`. Default `16:9`.
5. **Duration** — `4`, `6`, or `8` seconds. Reference inputs (any of
   I2V/Ingredients/F/L) force duration to 8.
6. **Style anchor** — optional. If absent, default to "cinematic
   photograph, neutral grade".
7. **Motion intent** — what changes across the clip. Veo 3.1 honours
   shot-list-style motion descriptions better than peers.
8. **Audio intent** (optional) — Veo 3.1 supports synthesized audio:
   ambient sound, dialogue, SFX. Audio block goes AFTER all visual
   description.
9. **Timestamp segments** (optional) — for multi-shot in one
   generation; segments must sum to the requested duration.
10. **Negative prompt** — optional; noun phrases only.

## Six-clause skeleton (video)

For video models, extend the cross-model five-clause skeleton with a
sixth motion / beat clause:

1. Cinematography (shot type + camera movement) — **leads the prompt**
2. Subject
3. Action
4. Setting / context
5. Style & ambiance
6. Audio (separated from visuals; goes last)

Veo 3.1 weights early tokens heavily; cinematography in the opening
position is non-negotiable for spatial framing accuracy. Total prose
under ~160 words for single-shot work.

## Mode 1 — Text-to-video (T2V)

### Strengths

- Strong prompt adherence including shot-list-style motion descriptions.
- Native synthesized audio: ambient, foley, dialogue, SFX.
- High visual fidelity at 1080p / 16:9.
- Lifelike lip-sync.

### T2V prompt template

```
<Cinematography in one short sentence — shot type, camera movement,
lens/focus.>
<Subject in one short sentence>.
<Action in one short sentence>.
<Setting and time in one short sentence>.
<Style anchor — see production-design.md>.
Audio (optional, AFTER visuals):
  Dialogue: <Speaker> says, "<line>." [tone modifier].
  SFX: <description>.
  Ambient noise: <background soundscape>.
  Music: <genre/instrumentation/tempo, if used>.
```

### T2V worked example

```
Medium shot, slow push-in. A tired corporate worker rubs his temples
in exhaustion. He sits in front of a bulky 1980s computer in a
cluttered office late at night. The scene is lit by harsh fluorescent
overhead lights and the green glow of the monochrome monitor. Retro
aesthetic, shot as if on 1980s color film, slightly grainy.

Audio:
  SFX: the chunky tap of a mechanical keyboard.
  Ambient noise: low hum of fluorescent tubes.
```

## Mode 2 — Image-to-video (I2V)

Single image as the starting frame. Veo 3.1 honours the supplied still
as frame 1 and generates motion forward.

```
Reference (frame 1): <one-line description of the supplied image>.
Cinematography: <camera movement and shot type for the motion>.
Motion: <what changes from frame 1 across the clip>.
Style and lighting hold: <one short sentence — match the reference>.
Audio (optional, AFTER visuals): <as for T2V>.
```

I2V forces duration to 8 seconds.

## Mode 3 — Ingredients to Video (multi-reference; 1–3 references)

The official mode name is **Ingredients to Video** (alias: MR, R2V).
Provide 1 to 3 reference images for character, object, scene, or style
consistency across multiple shots. **Mutually exclusive with F/L
mode**: do not pass first-frame and last-frame inputs in the same
call. Reference type on Veo 3.1 is `"asset"` only (style references
require Veo 2).

Audio generation is supported in Ingredients to Video.

```
Using the provided images for <element 1>, <element 2>, ...:
Cinematography: <shot type, camera movement>.
Subject and action: <as for T2V>.
Setting: <as for T2V>.
Style and lighting: <inherits from reference where named>.
Audio (optional, AFTER visuals): <as for T2V>.
```

Ingredients to Video forces duration to 8 seconds.

## Mode 4 — First-and-last frame (F/L)

Pass two images: first frame and last frame. Veo 3.1 generates the
motion between them. **Mutually exclusive with Ingredients to Video.**
Audio generation is supported.

```
First frame: <one-line description of the first-frame image>.
Last frame: <one-line description of the last-frame image>.
Cinematography: <hold or move; default to static unless the two frames
imply motion>.
Motion: <one short sentence describing how the subject moves from
first-frame state to last-frame state>.
Style and lighting hold: <inherits from the two reference frames; name
which to follow if they differ>.
Audio (optional, AFTER visuals): <as for T2V>.
```

### F/L hand-off from Nano Banana 2 (workflow)

When the still pair comes from Nano Banana 2, Veo 3.1 F/L is the
natural consumer. The pattern:

1. Nano Banana 2 generates frame 1 (e.g. `Medium shot, female pop star
   singing into a vintage microphone, dark stage, dramatic spotlight`).
2. Nano Banana 2 generates frame N (e.g. `POV from behind the singer,
   looking out at a cheering crowd, bright stage lights, lens flare`).
3. Veo 3.1 F/L interpolates: `The camera performs a smooth 180-degree
   arc shot, starting with the front-facing view of the singer and
   circling around her to seamlessly end on the POV shot from behind
   her on stage. The singer sings "When you look me in the eyes, I can
   see a million stars."`

Camera state must be coherent between the two stills; otherwise Veo's
interpolation breaks.

## Mode 5 — Add/Remove Object (lower-priority)

Surgical edit on an existing clip: introduce a new object or remove an
existing one. **Uses the Veo 2 model; does NOT generate audio.** Veo
preserves the original composition.

```
On @Video1: add <object> to <position>. Lit consistently with the
existing scene. Everything else unchanged.
```

or

```
On @Video1: remove the <object> from <position>. Fill the area with
<continuation of background>. Everything else unchanged.
```

When the user needs audio, use a different mode (Veo 3.1 T2V/I2V/
Ingredients/F/L) instead.

## Timestamp prompting (multi-shot in one generation)

Direct a multi-shot sequence inside a single 8-second clip with
timecode brackets. Each segment has its own cinematography, subject
focus, and audio. Segments must sum to the requested duration.

```
[00:00-00:02] <Cinematography>. <Subject + action>. <Setting>.
[00:02-00:04] <New cinematography>. <Development>. SFX: <sound>.
[00:04-00:06] <Another shot>. <Escalation>. Ambient noise: <bed>.
[00:06-00:08] <Wide/crane>. <Resolution/reveal>. Music: <score>.
```

### Timestamp prompting worked example — jungle explorer (8s, 4 shots)

```
[00:00-00:02] Medium shot from behind a young female explorer with a
leather satchel and messy brown hair in a ponytail, as she pushes
aside a large jungle vine to reveal a hidden path.
[00:02-00:04] Reverse shot of the explorer's freckled face, her
expression filled with awe as she gazes upon ancient, moss-covered
ruins in the background. SFX: the rustle of dense leaves, distant
exotic bird calls.
[00:04-00:06] Tracking shot following the explorer as she steps into
the clearing and runs her hand over the intricate carvings on a
crumbling stone wall. Emotion: wonder and reverence.
[00:06-00:08] Wide, high-angle crane shot, revealing the lone
explorer standing small in the centre of the vast, forgotten temple
complex, half-swallowed by the jungle. SFX: a swelling, gentle
orchestral score begins to play.
```

## Dialogue and SFX syntax

### Dialogue

Explicit speaker attribution + quoted line. Use one of:

- `<Speaker> says, "<line>."`
- `<Speaker> says in a <tone> voice, "<line>."`

Examples:

- `A woman says, "We have to leave now."`
- `The detective says in a weary voice, "Of all the offices in this
  town, you had to walk into mine."`

Speaker attribution is what drives accurate lip-sync. Anchor the line
with a physical action immediately before it whenever possible.

### SFX

Explicit `SFX:` prefix, with clear sound description.

Examples:

- `SFX: thunder cracks in the distance.`
- `SFX: a sword unsheathes with a metallic ring.`
- `SFX: the chunky tap of a mechanical keyboard.`

### Ambient noise

Explicit `Ambient noise:` prefix; defines the background soundscape.

Examples:

- `Ambient noise: the quiet hum of a starship bridge.`
- `Ambient noise: distant café murmur and street traffic.`

### Music (optional)

Genre, instrumentation, tempo quality.

Example: `Music: gentle piano with building strings.`

**All audio AFTER all visual description. Never interleave.**

## Negative-prompt guidance

Veo 3.1 accepts a negative prompt as **noun phrases**, not "no X" or
"don't show Y" syntax. Describe what to exclude positively.

Drop-in defaults:

- Universal: `blurriness, distortion, unnatural motion`
- Characters: `identity drift, extra limbs, morphing`
- Clean output: `text overlay, watermark, borders`

Avoid: `"no people"`, `"don't show buildings"`. Replace with: positive
description ("an empty street") plus the noun-phrase exclusion field.

## Production design anchors

Use named-tradition style anchors instead of generic adjectives. The
shared catalogue lives in `../../../references/production-design.md`.
Strong for Veo: format-and-stock anchors ("shot on 1980s color film,
slightly grainy"), anamorphic lens flare references, named director
traditions paired with format ("Christopher Nolan grounded, IMAX
70mm").

## Translation notes

Model-specific quirks (audio behaviour, mode exclusivity, duration
caps, reference type "asset" only on 3.1, Add/Remove Object on Veo 2,
F/L hand-off, SynthID watermark) live in
`references/translation-notes.md`.

## Observability Checkpoint

```json
{
  "skill": "gen-prompting-veo-3-1",
  "checkpoint": "prompt-emit",
  "inputs": {
    "mode": "T2V|I2V|Ingredients|F/L|AddRemove",
    "reference_count": 0,
    "aspect_ratio": "16:9",
    "duration_s": 0,
    "audio_intent_present": false,
    "timestamp_segments": 0,
    "dialogue_present": false,
    "negative_prompt_present": false
  },
  "decision": "emit|defer-to-user",
  "rationale": "<one-line: clauses present; cinematography in opening position; Ingredients/FL exclusivity respected; motion/audio decisions named; timestamp segments sum to duration; AddRemove acknowledges Veo 2 + no audio>"
}
```

Pick `defer-to-user` if Ingredients and F/L inputs are both supplied
(mutually exclusive), if motion intent is empty, if AddRemove is
selected with audio intent, or if timestamp segments do not sum to the
requested duration.

## Closing — validation

Run the helper script `scripts/build-prompt.py` to assemble and
validate the prompt before emitting it. The script enforces the
six-clause skeleton, refuses negation-only prompts, enforces the
Ingredients/FL exclusivity, accepts a `--variant ingredients` alias for
the historical `--variant mr`, and prints the assembled prompt to
stdout.

```
python3 scripts/build-prompt.py --mode T2V --subject "..." --action "..." \
    --setting "..." --style "..." --camera "..." --motion "..."
```

See `scripts/build-prompt.py --help` for the full argument list. The
script's tests live in `scripts/test_build_prompt.py` and run with
`python3 scripts/test_build_prompt.py`.
