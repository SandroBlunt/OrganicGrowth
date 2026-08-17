# Lighting

Lighting setups and the vocabulary that names them — direction, quality, and motivation. Across every
model in this catalogue, naming the light explicitly and concretely is consistently one of the single
highest-leverage moves available in a prompt: several of this catalogue's own model-specific notes say
so directly ("place the light — naming its direction and quality does more than any other single
clause"). This document is the shared vocabulary for doing that well. Pair it with `photography.md`
(exposure, which is partly a lighting decision) and `production-design.md` (color, which lighting also
shapes).

## Direction

Where the light comes from, relative to the subject and the camera:

- **Front light** — light from near the camera's position. Flattens shape and shadow; reads as clean,
  flat, or documentary-neutral. Rarely the most flattering choice on its own, but useful when clarity
  matters more than drama.
- **Three-quarter / short light** — light from roughly 45° off-camera, on the side of the face turned
  slightly away from camera. The standard flattering portrait direction: it models the face with soft
  shadow without flattening it or hiding it.
- **Side / split light** — light from directly beside the subject, roughly 90° off-camera. Splits the
  subject into a lit half and a shadowed half. Reads as dramatic, tense, or revealing of texture.
- **Back light / rim light** — light from behind the subject, toward the camera. Separates the subject
  from the background with a bright edge or halo; on its own (with no fill) it silhouettes the subject
  entirely.
- **Top light** — light from directly overhead. Reads as harsh, clinical, or unflattering when hard;
  reads as soft and even when diffused (as with open daylight).
- **Under light** — light from below the subject. Reads as unnatural or unsettling — the classic
  "campfire story" or horror cue — because it's rare in the natural world; use it only when that
  specific unease is the intent.

## Quality

Whether a shadow's edge is sharp or soft — governed by the light source's size relative to the subject,
how diffused it is, and its distance:

- **Hard light** — a small or distant, undiffused source (direct sun, a bare bulb, a small spotlight).
  Produces crisp, well-defined shadow edges and strong contrast. Reads as graphic, dramatic, or harsh;
  good for tension, heat, or a stark documentary look.
- **Soft light** — a large or diffused source relative to the subject (an overcast sky, a light through
  a diffusion panel or a large window, a bounced source). Produces gradual, soft-edged shadows and lower
  contrast. Reads as gentle, flattering, or calm; the default choice for most naturalistic portrait and
  product work.
- Quality is independent of brightness — a soft light can be just as bright as a hard one. Name quality
  and direction together ("soft key from camera-left") rather than leaving quality to be inferred from
  brightness words like "bright" or "dim," which describe exposure, not shadow character.

## Motivation

The in-story source a viewer would infer for the light, even when that source isn't itself in frame.
Naming the motivating source is what turns a vague mood adjective into something a model can render
concretely:

- **Daylight** — window light, open sky, direct sun, overcast — each has its own quality and color (see
  below) and its own implied time of day.
- **Practical sources** — a lamp, a screen's glow, a neon sign, a candle or firelight, a streetlight.
  Each carries its own color and a falloff (light that visibly dims with distance from the source) that
  sells the source's presence even when the fixture itself is out of frame.
- **Golden hour** — low, warm, raking sunlight shortly after sunrise or before sunset. Soft in quality
  (the sun is low and its light travels through more atmosphere) and strongly warm in color; one of the
  most reliable named-motivation anchors across every model in this catalogue.
- **Blue hour** — the cool, low-contrast light in the minutes just before sunrise or just after sunset,
  after the sun itself has gone. Soft, cool, and even.
- **Overcast / diffused daylight** — an entirely soft, roughly shadowless light with a neutral-to-cool
  color. Even and unflattering-free, but flat; good when clarity or naturalism matters more than drama.

Prefer naming a motivation over an unmotivated mood word: "lit by the green glow of a monitor in an
otherwise dark room" tells a model exactly what to render; "moody lighting" does not.

## Named setups

A handful of recognizable combinations of the above, worth naming directly when they're the intent:

- **Three-point lighting** — a key light (the dominant source, sets direction and quality), a fill
  light (a softer, dimmer source that lifts the shadows the key creates, controlling contrast), and a
  rim/back light (separates subject from background). The standard baseline for a controlled,
  flattering setup; naming "key," "fill," and "rim" separately (or stating one is absent, e.g. "no
  fill, hard shadow") is more precise than "well-lit."
- **High-key** — bright overall, low contrast, few or no deep shadows. Reads as light, optimistic,
  commercial-clean.
- **Low-key** — mostly dark, with a small area of strong contrast. Reads as dramatic, tense, moody,
  film-noir-adjacent.
- **Chiaroscuro / Rembrandt lighting** — strong, painterly contrast between a lit area and deep shadow,
  classically with a small triangle of light on the shadowed cheek. Reads as painterly, dramatic,
  classical.
- **Silhouette** — the subject rendered as a dark shape against a brighter background, with little or
  no detail visible on the subject itself. Produced by a strong back light with no fill.
- **Practical-only lighting** — the scene is lit entirely (or apparently entirely) by sources visible or
  implied in-frame (lamps, screens, signage, candles), with no unmotivated "movie light." Reads as
  grounded and naturalistic, and is a strong anchor for a night or interior scene.

## Color temperature

Light carries color as well as direction and quality, and naming it does real work:

- **Warm** — orange/amber-leaning, associated with incandescent bulbs, candlelight, and golden hour.
  Reads as cozy, nostalgic, inviting.
- **Cool** — blue-leaning, associated with overcast daylight, shade, screens, and moonlight. Reads as
  clinical, distant, tense, or simply "morning."
- **Mixed sources** — naming two different-temperature sources in the same shot (a cool blue window
  against a warm practical lamp) is a specific, renderable clause, and reads far more concretely than a
  single vague word like "moody." Mixed color temperature is one of the most reliable ways to make a
  lighting description feel motivated rather than arbitrary.

## Writing the light clause

Combine direction, quality, and motivation into one short clause, and let the camera clause in
`cinematography.md` sit beside it rather than merging the two: "soft key light from camera-left,
motivated by a window just out of frame" is a complete, usable light clause. Where the shot has a
second and third light doing distinct work (a rim separating subject from background, a practical
source visible in the background), name each briefly rather than folding them into one run-on sentence.
