# Prompt discipline

The shared discipline behind every model-prompting skill in this catalogue: how to structure a
prompt, what to state explicitly, what to leave to the model, and how to avoid over-specification.
Read this once before writing a prompt for the first time; the individual skill's own instructions
and its `translation-notes.md` cover what is specific to one model. **Where a skill's own translation
notes conflict with a default stated here, the translation notes win** — that is the documented
relationship every skill in this catalogue already assumes.

The four sibling documents in this folder — `cinematography.md`, `lighting.md`, `photography.md`,
`production-design.md` — go deeper on the vocabulary this document only introduces. This document is
the frame; they are the craft that fills it in.

## The five-clause skeleton (stills)

A still-image prompt is five short, single-job clauses, written as prose sentences, not a keyword
list:

1. **Subject** — who or what is in frame, named precisely.
2. **Action / pose** — what it is doing, or the state it is in.
3. **Setting / context** — where, and when.
4. **Style / medium** — the register the image is rendered in (see `production-design.md` for how to
   name this well).
5. **Camera / framing / light** — shot scale, lens, angle, light direction, light quality (see
   `cinematography.md`, `lighting.md`, `photography.md`).

Each clause has one job. A prompt that merges two jobs into one sentence, or splits one job across
three sentences, is harder for both the author and the model to reason about — keep the boundaries
clean even when the final prose reads as a single flowing paragraph.

## The six-clause skeleton (video)

Video extends the still skeleton with a sixth clause carrying what changes over time:

1. Subject
2. Action / pose (initial state)
3. Setting / context
4. Style / medium
5. Camera / framing / light
6. Motion / beat — what plays out across the clip, or, for a multi-shot prompt, each shot's own beat

This is the default clause order, and it is what most of the video models in this catalogue use
as-is. It is not universal: a model whose own vendor guidance weights early tokens unusually heavily
may call for leading with the camera/cinematography clause instead of the subject, and for closing on
an explicit audio clause instead of a generic motion clause, when dialogue or synchronized sound is a
first-class part of what it renders. That reordering is a genuine, documented model-specific override,
never a contradiction of the default — a skill that needs it states so plainly in its own instructions
and its `translation-notes.md`, and that statement is authoritative for that one model.

Describe the motion as an arc and, where it matters, its physics — "the door swings open and she steps
through, coat trailing" reads as intended motion; "a woman near a door" does not tell a video model
what to animate. Keep camera movement and subject movement in separate sentences even inside the same
clause: "the camera holds static while the crowd surges past" separates two motions a model will
otherwise conflate into one.

## What to state explicitly, and what to leave to the model

Not every visual detail belongs in the prompt. State explicitly whatever the shot's outcome actually
depends on:

- Anything that must hold constant across an edit, a multi-reference composite, or a sequence
  (identity, framing, a key light's direction, a brand element) — say so with a dedicated "preserve"
  or "hold" clause rather than trusting the model to infer it from the reference alone.
- The exact spatial relationship between named elements, when it matters to the read of the shot ("the
  mug sits to the left of the laptop," not "there's a mug somewhere nearby").
- Concrete materials, not generic categories — "navy blue tweed" outperforms "suit jacket"; "ornate
  elven plate armor, etched with silver leaf" outperforms "armor." Material specificity is one of the
  highest-leverage levers across every model in this catalogue, image or video.
- The exact words for any in-image or spoken text — always quoted, never paraphrased, since a model
  cannot reliably reconstruct exact wording from a description of it.

Leave to the model whatever is genuinely incidental to the outcome: exact prop placement the story
doesn't depend on, minor background dressing, a gesture's precise timing within a beat, secondary
texture the shot isn't about. A prompt that tries to pin down every element in frame reads as a list of
demands rather than a scene, and models in this catalogue consistently render a described *scene* more
naturally than an exhaustively enumerated one. Google's own image-model guidance states this plainly:
describe the scene in connected sentences, don't just list keywords — narrative prose consistently
outperforms disconnected word stacks.

### The over-specification anti-pattern

The tell that a prompt has over-specified: every clause is padded with adjectives that don't change
what renders, obvious facts are restated ("a photo of a photograph-style image"), or one clause is
carrying two or three jobs because the author kept adding detail instead of moving to the next clause.
The fix is structural, not stylistic — go back to the five- or six-clause skeleton, give each clause
exactly the one job it owns, and cut anything that doesn't earn its place in that clause's single
sentence. A tightly-clausal 60-word prompt reliably outperforms a 200-word paragraph that restates
itself.

## Word budget

There is no single cross-model number — a still-image model's practical ceiling runs anywhere from
roughly 30 to 160 words for a single shot, and a video model's runs from roughly 60 words per shot up
to a few hundred characters or words depending on how it counts. Every model drifts the same direction
past its own ceiling: later clauses get diluted and the model starts losing earlier detail. A skill's
own `translation-notes.md` states the number that applies to it; treat that number as authoritative,
and when in doubt anywhere, prefer fewer, more precise clauses over a longer one that repeats itself.

## The style anchor

Every skeleton's Style/Medium clause is one sentence naming a concrete photographic stock, a named
illustration or filmmaking tradition, or a render style — never a bare adjective like "cinematic" or
"beautiful," which carries almost no information a model can act on. `production-design.md` catalogues
how to build a strong style anchor. When the requester supplies none, default to a plain, neutral
register appropriate to the medium (a natural, neutrally-graded photograph for a still; a natural,
cinematic photograph with a neutral grade for video) rather than inventing a stylistic flourish nobody
asked for.

## Negation and exclusion

Plain-prose negation — "no X," "without Y," "don't show Z" — is unreliable across most of the models in
this catalogue: several documented cases show the model including the very thing it was told to
exclude, because a negated noun still primes the concept. State the positive scene instead ("an empty
street" rather than "no people"). Where a model exposes a dedicated negative-prompt or exclusion field
separate from the visible prompt, that field is the right place for a short list of noun-phrase
exclusions ("blurriness, distortion, extra fingers") — it is a narrow correction tool, not a substitute
for describing the scene you actually want. A skill's own `translation-notes.md` states whether such a
field exists for that model and how it behaves; where none exists, positive description carries the
whole load.

## Reference-image discipline

When a prompt carries one or more reference images, name every reference's **role** explicitly —
character, object, style, layout, or camera state — rather than trusting the model to infer intent
from upload order or context alone. A reference with no stated role is frequently averaged into the
composition instead of anchoring the one thing it was meant to anchor. Where an edit or a composite
must hold something constant from a reference (identity, framing, a key light, a brand mark), say so
with an explicit "preserve" clause; this consistently does more to keep an edit stable than lengthening
the description of the reference itself.

Where two or more still images are meant to hand off into one continuous piece of motion — a
first-and-last-frame pair, an anchor-and-endpoint sequence — camera state must read as coherent between
them: the same implied lens, angle, and framing logic, unless the sequence intent itself calls for the
camera to move between the two. An incoherent camera state between hand-off frames is one of the most
common causes of a broken interpolation.

## Deciding whether to emit or defer

A prompt is ready to emit once every clause in its skeleton is filled from what was actually asked, no
clause is standing in for a fact nobody supplied, and any exclusivity or ceiling the model imposes
(duration caps, mutually exclusive modes, a required field) is genuinely satisfied. When a clause the
outcome depends on has no real answer available — no motion intent named, no hand-off target given for
a sequence meant to feed a downstream model, two mutually exclusive inputs both supplied — the right
move is to say so and ask, not to invent a placeholder answer and hope it reads as intentional. A
guessed-at deferral reads worse in the output than an honest pause.
