# Photography

Exposure, depth of field, and composition — the photographic language these models were trained on
and respond to most reliably, alongside the camera vocabulary in `cinematography.md` and the light
vocabulary in `lighting.md`. Where those two documents cover where the camera sits and where the light
comes from, this one covers how the resulting frame is exposed, focused, and arranged.

## Exposure

Exposure is a mood decision as much as a technical one — naming it tells a model how bright, how
contrasty, and how much shadow/highlight detail the shot should hold:

- **Correctly exposed** — the default; a balanced range of tones with detail held in both shadows and
  highlights. State it only when contrast with a deliberately off-balance choice matters; otherwise it's
  the assumed baseline.
- **Overexposed / bright, blown highlights** — bright areas lose detail toward pure white. Used
  deliberately for a dreamy, sun-washed, or ethereal read (bright window light flaring past a subject),
  or for a stark, high-key commercial look.
- **Underexposed / low-key, crushed shadows** — dark areas lose detail toward pure black. Used
  deliberately for tension, mystery, or a moody, cinematic read. See `lighting.md`'s low-key entry —
  exposure and lighting setup usually travel together.
- **High dynamic range** — detail held across both deep shadow and bright highlight in the same frame.
  Reads as polished, modern-photographic, or HDR-graded; name it when the shot needs to hold detail
  everywhere at once (a bright window and a dim interior in the same frame, for instance).

## Depth of field

How much of the frame stays in sharp focus — governed by the lens' aperture (how wide the lens opens)
in combination with focal length (see `cinematography.md`) and the camera's distance from the subject:

- **Shallow depth of field** — a narrow band stays sharp; everything before and behind blurs into soft
  **bokeh**. Isolates the subject from its background, draws the eye directly to what's in focus, and
  is the standard portrait and product-hero look. Name the aperture when precision matters ("f/1.8,
  shallow depth of field, soft bokeh behind") or simply name the effect ("shallow depth of field") when
  it doesn't.
- **Deep depth of field** — most or all of the frame stays sharp, foreground to background. Holds
  environment and context in focus alongside the subject; the standard choice for an establishing shot,
  a landscape, or any frame where the setting is part of the point.
- **Rack focus** (video only) — focus shifts from one plane to another during the shot, redirecting
  attention mid-beat. Name what the focus starts on and what it ends on.
- Depth of field and focal length interact: a longer lens produces a shallower-reading depth of field
  at the same aperture than a wider one does, which is part of why a portrait/telephoto lens is the
  default isolation tool (see `cinematography.md`'s lens section).

## Composition

Where things sit inside the frame, and why:

- **Rule of thirds** — placing the subject (or its eyes, or the horizon) along one of the lines a third
  of the way across the frame, rather than dead center. The most reliable default for a frame that feels
  balanced without feeling static.
- **Centered / symmetrical composition** — the subject sits dead center, often with a symmetrical
  background. Reads as formal, deliberate, graphic, or confrontational — a strong choice precisely
  because it breaks the thirds default; use it on purpose, not by omission.
- **Leading lines** — a line in the scene (a road, a railing, a shaft of light) that draws the eye
  toward the subject. Strong for establishing shots and for connecting foreground to background. Name
  the specific line ("a receding tiled floor leading the eye to the subject") rather than the abstract
  term alone.
- **Negative space** — deliberately empty area around the subject. Reads as isolation, calm, or scale
  (a small subject in a large empty frame); also the practical choice when the image needs clean room
  for other elements (text, a logo) to sit without competing with the subject.
- **Framing within the frame** — using an element in the scene (a doorway, a window, foliage, an arch)
  to enclose or partially obscure the subject. Adds depth and draws the eye inward.
- **Foreground / midground / background layering** — naming what occupies each of the three depth
  layers ("a blurred hand in the foreground, the subject in the midground, a lit skyline in the
  background") builds a frame with real depth rather than one flat plane; this is also where a shallow
  depth of field and a deep one differ most visibly.
- **Headroom and eyeline space** — the gap above a subject's head, and the gap in front of a subject's
  gaze or direction of motion. Too little headroom reads as cramped; too much reads as adrift. A subject
  looking or moving toward the frame's edge (rather than away from it, into empty space) generally reads
  as more natural — state which direction the subject faces relative to the frame when it matters.

## Photographic stock and process as a style anchor

Naming a specific photographic process or film stock is one of the strongest, most concrete style
anchors available — stronger than a generic adjective like "photorealistic" — because it points at a
recognizable, consistent look:

- **Format and stock anchors** — "shot on 35mm film, slightly grainy," "medium-format digital,
  ultra-detailed," "shot on a specific color-negative film stock, warm neutral grade." These carry grain
  structure, color response, and contrast character in a few words.
- **Process anchors** — "anamorphic lens flare," "Polaroid instant-film look, soft focus and light
  leaks," "large-format view-camera look, deep focus, high detail." Each names a physical process with a
  distinct, well-known visual signature.
- This register is deliberately about the *photographic apparatus and process*, not about a named
  director's or artist's broader visual signature — `production-design.md`'s named-tradition anchors
  cover that broader register, and the two are usually named together in the same style clause.

## Texture and material rendering

Naming surface and skin texture explicitly is a direct, high-leverage lever, especially against a
default that otherwise smooths and over-retouches:

- **Skin** — "natural skin texture, visible pores, fine lines, catchlights in the eyes" reliably pushes
  a model away from a default beauty-retouch smoothing and toward a photographic, human read. Naming
  specific, honest detail (freckles, hair flyaways, asymmetry) is honoured when stated explicitly, and
  otherwise defaulted away.
- **Material surfaces** — naming a specific material and its finish ("brushed aluminum," "worn leather,
  cracked at the seams," "glossy ceramic catching a single highlight") does more work than a bare noun
  ("metal," "leather," "ceramic"). This is the same material-specificity principle `prompt-discipline.md`
  states for subjects generally, applied to surface finish.

## Writing the photographic clause

Exposure, depth of field, and composition usually share the same sentence as the camera and light
clauses described in `cinematography.md` and `lighting.md` — these prompts read as one connected
description of the frame, not as four separate technical fields. "Medium close-up, 85mm, shallow depth
of field with soft bokeh behind, subject on the left third, soft key light from camera-left" is a
complete frame description built from four short, specific choices, not a long unfocused paragraph.
