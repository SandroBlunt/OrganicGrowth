# Cinematography

Shot size, camera position, camera movement, and lens choice — the vocabulary that turns "a picture
of a person" into a specific, intentional shot. Every one of these is a storytelling decision, not a
technical formality: it tells the model (and the viewer) how close the audience is meant to feel, what
power dynamic is in play, and what the frame is asking to be noticed. Pair this with `lighting.md` and
`photography.md`, which cover the other half of the camera/framing/light clause described in
`prompt-discipline.md`.

## Shot size

Shot size is measured against the human body, and each step in is a step toward intimacy or isolation;
each step out is a step toward context or scale.

- **Extreme wide / establishing shot** — the subject is small or absent; the frame is about the place.
  Use to open a scene, establish scale, or make a subject feel small against its environment.
- **Wide / full shot** — the whole subject, head to foot (or a full object), with visible surrounding
  space. Shows what the subject is doing and where.
- **Medium wide** — roughly waist-up, or a full object with modest headroom. A comfortable, conversational
  distance — enough body language to read, enough setting to place it.
- **Medium shot** — roughly chest-up. The default "two people talking" distance; balances expression
  against gesture.
- **Medium close-up** — roughly shoulders-up. Expression starts to dominate; setting recedes.
- **Close-up** — the face (or a single detail) fills the frame. Reads emotion directly; setting is
  gone or heavily blurred.
- **Extreme close-up** — a fragment (eyes, hands, a single object's texture). Maximum intimacy or
  maximum focus on one detail; use sparingly, it is a hard beat, not a resting distance.

Name the shot size in one or two words at the top of the camera clause — "medium close-up," "wide
shot" — rather than describing distance in prose ("the camera is somewhat far away"). The named terms
are what these models were trained against and respond to most reliably.

## Camera position

Where the camera sits relative to the subject changes what the shot implies about power, vulnerability,
and point of view, independent of shot size:

- **Eye level** — neutral, the default. Puts the viewer on equal footing with the subject.
- **Low angle** — camera below the subject, looking up. Reads as powerful, imposing, or threatening.
- **High angle** — camera above the subject, looking down. Reads as small, vulnerable, or observed.
- **Overhead / bird's-eye** — directly above. Reads as pattern, scale, or detached observation.
- **Dutch / canted angle** — the horizon is tilted. Reads as unease or disorientation; use deliberately,
  not as a default.
- **Point of view (POV)** — the camera stands in for a character's own eyes. Puts the viewer inside the
  subject's experience.
- **Over-the-shoulder** — the camera sits behind one subject, framing a second across from them. The
  standard two-person conversational setup; implies relationship and exchange.
- **Three-quarter angle / profile** — the subject is turned partly or fully away from square-on. A
  three-quarter angle reads as more natural and dimensional than a flat, straight-on frontal; a profile
  reads as formal, graphic, or deliberately distanced.

## Camera movement

A moving camera is a beat of its own — name what moves and why, not just that something moves:

- **Static / locked-off** — no movement. Lets composition and performance carry the shot; the default
  when nothing calls for motion.
- **Pan** — horizontal rotation from a fixed point, left or right. Reveals what's beside the subject,
  or follows lateral action, without changing the camera's position.
- **Tilt** — vertical rotation from a fixed point, up or down. Reveals height, or reframes from detail
  to context (or back).
- **Dolly / push-in / pull-out** — the camera itself travels toward or away from the subject. A push-in
  builds intensity or draws the viewer closer to a realization; a pull-out reveals context or creates
  distance/release.
- **Tracking / following shot** — the camera travels alongside a moving subject, holding a roughly
  constant framing. Keeps the audience moving with the subject rather than watching them pass.
  "Low tracking shot then subtle rise" is a compound move: primary movement first, secondary movement
  second — describe compound moves in that order so the model doesn't try to blend two motions into one.
- **Crane / jib** — the camera rises or descends, usually while also moving through space. Reads as
  revelation (rising to reveal scale) or descent (settling into a scene).
- **Handheld** — deliberate small, organic instability. Reads as urgency, intimacy, or documentary
  authenticity; state it explicitly, since a locked-off default won't produce it.
- **Orbit / arc** — the camera moves in a curve around the subject while the subject stays centered.
  Reveals a subject from multiple sides in one continuous move; strong for a hero reveal or an
  environment wraparound.
- **Zoom (and the dolly zoom)** — a focal-length change, not a physical camera move: the frame tightens
  or widens without the camera's position changing. A dolly zoom (camera dollies one direction while
  the lens zooms the other, holding the subject's size constant while the background stretches or
  compresses) is a specific, recognizable unease effect — name it by name when that's the intent, not
  as a generic "zoom."

If the camera should hold on the subject while everything else in frame moves, say so explicitly
("camera static, the crowd surges past") — a video model that isn't told the camera is locked will
often assume the camera moves whenever anything in the scene does.

## Lens choice as a storytelling decision

Focal length is not a technical afterthought; it changes how space itself reads in the frame, so name
it as part of the shot's intent, not a spec sheet detail:

- **Wide lens** (roughly 14–35mm) — exaggerates depth and distance between foreground and background;
  subjects near the lens appear slightly distorted. Reads as immersive, environmental, sometimes
  unsettling at the extreme end. Strong for establishing shots and for putting the viewer *inside* a
  space.
- **Normal lens** (roughly 35–50mm) — renders space close to how the human eye perceives it. The
  naturalistic default for conversational and documentary-feeling work.
- **Portrait / short telephoto** (roughly 85–135mm) — flatters facial proportion, compresses the
  background gently, and produces the shallow-depth "isolated subject" look at a comfortable working
  distance. The standard portrait and product-hero choice.
- **Telephoto** (135mm and beyond) — strongly compresses the distance between foreground and
  background, so a subject reads as pressed against what's behind it. Reads as voyeuristic, distant,
  or as if observed from far away — the "surveillance" or "paparazzi" look, used deliberately.
- **Macro** — extreme close focus on texture and small detail (a product's surface, an insect, a single
  object). The tool for extreme close-ups that are about material, not expression.

Focal length also governs how much of the frame stays sharp at a given aperture — see `photography.md`'s
depth-of-field section for how lens choice and aperture combine to isolate or hold a subject.

## Writing the camera clause

Name shot size, camera position (when it isn't the neutral eye-level default), movement, and lens
together in one short clause, tied to what the beat needs — not as an independent checklist of camera
facts. "Medium close-up, slow push-in, 85mm, camera at eye level" is a complete, usable clause; a
five-sentence essay on camera theory is not. Two or three of these terms, chosen because they serve the
story, will consistently outperform a longer, unfocused description.
