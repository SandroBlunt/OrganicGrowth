# Production design

Sets, wardrobe, props, colour, period, and place — the vocabulary for building the *world* a shot sits
in, and, separately, for anchoring the overall visual *style* the shot is rendered in. Both are part of
the Style/Medium clause described in `prompt-discipline.md`; this document is the deepest and most
cited of the five, because a strong, specific world and a strong, specific style anchor are together
the single biggest lever over how "generic" or "specific" a generated image or clip feels.

## Set and location

Where the scene physically happens:

- **Interior vs exterior** — state which; it changes the available light sources (see `lighting.md`),
  the acoustics implied for video, and the scale of what's visible.
- **Real vs constructed** — a specific, real-feeling location ("a cramped, cluttered apartment kitchen,
  dishes stacked in the sink") reads differently from a clean studio backdrop ("a seamless white
  studio cyclorama"). Neither is wrong; pick the one the shot's purpose calls for — a product hero shot
  usually wants the studio's control, a narrative beat usually wants the specific, lived-in location.
- **Level of detail** — a "lived-in" set (visible wear, clutter, personal objects) sells a real place
  far more effectively than a pristine, generic one. Name two or three specific details rather than a
  general "messy" or "cluttered" — the specific detail is what a model can actually render distinctly.

## Wardrobe

What a subject wears carries period, status, occupation, and mood, often before anything else in the
frame does:

- Name the garment specifically — cut, fabric, and condition — rather than a bare category. "A worn
  canvas work jacket, sleeves rolled, a coffee stain on one cuff" tells a model far more than "a
  jacket," and reads as a specific person rather than a generic figure.
- Condition is doing narrative work on its own: pressed and crisp reads as formal, controlled, or
  wealthy; worn, ill-fitting, or mismatched reads as working-class, weary, or informal. Choose condition
  deliberately, not as an afterthought to the garment name.
- Period and occupation are usually read through wardrobe before anything else — a specific silhouette,
  fabric, and accessory set will place a subject in a decade or a role more reliably than stating the
  decade or role directly and leaving the clothing generic.

## Props

Objects in the frame fall into two categories, and naming which one a given object is changes how much
attention it should draw:

- **Purposeful props** — an object the story or the shot's outcome actually needs in frame (the item
  being demonstrated, the object a character interacts with). Name it precisely and give it the
  material specificity described in `photography.md`'s texture section.
- **Set dressing** — incidental objects that sell the world without needing individual attention (books
  on a shelf, tools on a bench, plants in a window). Name a few representative details rather than an
  exhaustive inventory; over-listing set dressing crowds out the purposeful props and reads as a prop
  list, not a scene.

## Colour

Palette is a storytelling tool, not decoration applied after the fact:

- **A dominant palette** — naming one or two dominant hues for a scene ("a warm amber-and-brown
  interior," "a cool teal-and-grey exterior") gives a model a coherent target far more reliably than
  listing every color present.
- **Complementary vs analogous schemes** — a complementary palette (colors opposite each other, like
  teal and orange) reads as high-energy, graphic, contrast-driven; an analogous palette (colors near
  each other, like amber, orange, and red) reads as harmonious, warm, cohesive.
- **A single accent against a muted field** — one saturated color (a red door, a yellow raincoat) against
  an otherwise desaturated or neutral scene is a reliable way to direct the eye without relying on
  composition alone.
- **Colour and light interact** — a scene's palette and its light source's color temperature
  (`lighting.md`) are the same conversation seen from two angles; naming both consistently (a "warm,
  amber-lit interior" rather than a warm interior lit by a cool light with no explanation) keeps the
  description internally coherent.

## Period and place

Naming an actual decade, era, or specific real-world region precisely does more work than a vague
adjective:

- Prefer a specific period ("late 1980s," "early Victorian," "present-day") over a vague one
  ("old-fashioned," "futuristic," "retro") — a specific period gives a model a coherent bundle of
  materials, technology, and design language to draw on; a vague one leaves it guessing at which era's
  cliché to reach for.
- Sell the period through period-accurate materials, technology, and signage rather than stating the
  period alone and leaving everything else generic — a bulky CRT monitor and a corded phone say "1980s
  office" more concretely than the words "1980s office" do on their own.
- Where a real, specific place matters to the shot (a described city, a named type of landscape, a
  particular architectural tradition), name it and its distinguishing physical features rather than a
  generic stand-in ("a dense, humid Southeast Asian night market, strung with bare bulbs" rather than
  "an Asian market").

## Named-tradition style anchors

The single highest-leverage style lever across every model in this catalogue is naming a concrete,
recognizable tradition instead of reaching for a generic adjective. "Cinematic" and "epic" carry almost
no information a model can act on; a named tradition carries a whole bundle of choices — framing habits,
color grading, lens character, pacing — in a few words. Build a style anchor from one or more of:

- **A stock-and-process pairing** — see `photography.md`'s "photographic stock and process" section for
  the specifically photographic register of this (film stocks, formats, printing processes).
- **A named filmmaking tradition, paired with a concrete format** — naming a recognizable visual
  signature alongside the format it's associated with is more renderable than the name alone: "grounded,
  naturalistic staging, shot in large-format IMAX" reads more concretely than a bare director's name on
  its own.
- **A named genre or movement tradition** — a recognizable genre's own visual grammar (a specific wuxia
  tradition's wire-work staging and color grading; a specific industrial color-grading house's look; a
  documentary tradition's handheld, available-light naturalism) each carries its own bundle of framing,
  color, and motion choices.
- **A named illustration or animation tradition** — for stylised, non-photographic work, the same
  principle applies: a named tradition (cel-shaded animation, a specific comic-inking style, a
  particular sticker-illustration convention) is a stronger anchor than "cartoon style."

Whichever anchor is used, name the tradition itself, not just the word "style" or "cinematic" attached
to it — "shot on 1980s color-negative film, slightly grainy, anamorphic lens flare" is a usable anchor;
"cinematic style" is not.

## Consistency across a sequence

When a style or a world needs to hold across more than one image or shot — a multi-panel sequence, a
multi-image set, a multi-shot video — repeat the *same* production-design and style-anchor clause
verbatim across every panel or shot, rather than re-describing it freshly each time. A model reading a
slightly different description for what's meant to be the same set, wardrobe, or grade will render a
slightly different set, wardrobe, or grade — small wording drift between otherwise-identical clauses is
one of the most common causes of a sequence's world visibly shifting partway through.

## Grounding note

When the request itself calls for a specific real place, product, or event, describe it accurately —
with its real, distinguishing materials, signage, and detail — rather than substituting a generic
invented stand-in; an invented generic substitute reads as evasive where specificity was actually
available and asked for. Where no real subject is named, an entirely invented set, prop, or location is
equally valid craft, and should be built with the same specificity described above. This document sets
no policy of its own on depicting real, identifiable people — that is governed by each model's own
usage policy and stated in its skill's `translation-notes.md`, and takes precedence over anything here.
