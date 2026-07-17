# PROTOTYPE — baseline prompt

**This is now the single active surface for iterating on the baseline image-generation prompt.**
Earlier rounds happened across two other throwaway files — `idea-01-slide-structures.md` (the
original "clean photo + Space template overlays text" direction) and
`idea-01-visual-v2-baked-in-text.md` (the "single fully-baked image" direction, seeded from your
Tokyo-Metro-Ditto reference prompt, which produced Alternatives 1/2/3 for visual hierarchy). Both
stay as historical reference — **from here on, baseline-prompt work happens only in this file.**

The iteration history that lived in this file (logo placement, vignette treatment, the "Unhypped
News" pill, Inter font, the circular inset) has been trimmed once the baseline was confirmed — only
the formalized prompt and its worked examples remain below.

Carried forward:
- Narrative structure: locked, Structure 2 ("Then / Now / Next," 7 slides).
- Visual direction: single fully-composed image per slide (photo + card + baked-in headline), not
  "clean photo, template adds text later."
- Real products/logos/actions, not vanilla stand-ins — confirmed fine since Nano Banana has its
  own internet-grounded access.
- **Format name is "Unhypped News" — title case (only the first letter of each word capitalized),
  never in all-caps lock.**

Hook copy and photo subject used throughout (idea-01, grounding in real products, real logos, real
actions, not invented UI):

- **Headline:** "A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave
  it a job."
- **Subject:** a modern desk with three laptops side by side, each open to a different real AI
  product actively mid-task — the OpenAI ChatGPT Work interface completing a multi-step to-do, the
  Anthropic Claude Cowork interface open across both a laptop and a phone, Meta's Muse Spark
  interface calling an external tool — each with its real, current logo and interface design.

---

## ★ THE BASELINE PROMPT — formalized

This section is the answer: the confirmed, reusable baseline prompt for the Data-card direction,
Structure 2's Layout-A-style slides (full-bleed photo + card). Everything in it is locked, not
still being tested:

- **Photo:** full-bleed, photorealistic, real products/logos/actions named explicitly (no invented
  UI, no vanilla stand-ins) — Nano Banana's own internet-grounded access handles the real-world
  detail.
- **Logo:** `Straw_Motion_Logo` connected as a reference image (not described in prose), laid
  horizontally along the top edge of the photo, small and subtle (≤ ~⅓ frame width), rendered
  unaltered — no shape/proportion/color changes — with a soft dark vignette behind it for
  legibility.
- **"Unhypped News" pill:** a fully rounded, stadium-shaped badge — thin black border, white fill —
  with "Unhypped News" centered inside it in Inter, title case only (capital U, capital N, the rest
  lowercase — **never** all-caps, regardless of surrounding typography), sitting next to the 3 tiny
  real product logos relevant to the story.
- **Card text:** stat callout + supporting line, both set in **Inter**.
- **Card style — two confirmed variants, both part of the baseline** (`3.1-final` and `3.2-final`
  in the Examples below): a full-width card anchored to the bottom ~30% of the frame, or a smaller
  floating "toast" card inset with a margin near the bottom (with its own soft dark vignette
  behind it, in addition to a drop shadow). Either is baseline-approved; pick per story.

**Reusable template** (swap the bracketed parts per slide; everything else is fixed):

> A vertical viral Instagram news post. A full frame high quality photograph[, cropped to the top
> ~70% of the frame — full-width card style / filling the entire frame edge to edge — floating
> toast card style], of `[SUBJECT: real products/logos/people/actions, named explicitly]`. Along
> the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally,
> small and subtle in scale — no wider than roughly a third of the frame width — so it stays a
> quiet brand mark and never competes with the headline or stat callout for attention. Render the
> logo exactly as provided in the reference image: do not change its shape, proportions, or color
> in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for
> legibility against the photo. `[CARD CLAUSE — full-width bottom card, or floating toast card with
> its own vignette + drop shadow]`. Inside the card, top-left, is a pill-shaped badge — a fully
> rounded, stadium-shaped outline with a thin black border and a white fill — containing the text
> "Unhypped News" centered inside it, set in Inter font, black text. Render the text inside the
> pill exactly as "Unhypped News" — capital U, capital N, every other letter lowercase. Never
> render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned
> next to the pill are three tiny real product logos (`[relevant companies]`) in a row. Below that,
> in large bold black display type, is the stat callout "`[STAT]`", and beneath it, in smaller
> near-black sentence-case text, the supporting line "`[SLIDE TEXT / HEADLINE]`" All text on the
> card — inside the "Unhypped News" pill, the stat callout, and the supporting line — is set in
> Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography
> overlay for the photo, clean flat UI-card typography for the card.

**Examples:** the JSON block below is a worked example of this template applied to idea-01's Hook
slide, 7 ways (the 2 baseline card styles, plus 3.3/3.5 as alternate card placements and 3
circular-inset variants, all still valid to draw from, just not formally "the baseline"). Use
`3.1-final` / `3.2-final` as the canonical starting point for any new slide.

---

## Examples

Worked examples of the baseline template above, applied to idea-01's Hook slide. "Unhypped News"
renders as the pill badge shown in the reference image you supplied — a fully rounded,
stadium-shaped badge (thin black outline, white fill) with "Unhypped News" centered inside it in
Inter, title case only, next to the 3 tiny real product logos.

```json
[
  {
    "variation_id": "3.1-final",
    "placement": "Bottom, full-width card — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.2-final",
    "placement": "Bottom, floating \"toast\" card — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling the entire frame edge to edge, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Near the bottom of the frame, inset with a visible margin of photo on all sides (not touching the frame edges), floats a compact solid white rounded card, like a notification toast. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.3-final",
    "placement": "Top card, photo below — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.5-final",
    "placement": "Small floating badge card, lower-left — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling nearly the entire frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in smaller near-black sentence-case text wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.1-circle",
    "placement": "Bottom, full-width card + circular inset, bottom-right of the photo — JOB: DONE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of the ChatGPT Work interface's task-complete checkmark, with the text \"JOB: DONE\" above it. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.3-circle",
    "placement": "Top card, photo below + circular inset, upper-right of the photo — no caption, pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the upper-right corner of that photo, a small circular inset photo shows a close-up of the Anthropic Claude Cowork interface synced across the laptop and the phone beside it. No caption text. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3.5-circle",
    "placement": "Small floating badge card, lower-left + circular inset, bottom-right of the photo — TOOLS: LIVE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling nearly the entire frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of Meta's Muse Spark interface mid-call to an external tool, with the text \"TOOLS: LIVE\" above it. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in smaller near-black sentence-case text wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  }
]
```

---

## Capture

**Baseline prompt formalized** — see "★ THE BASELINE PROMPT" near the top of this file. No code
changed. The Examples JSON block stays in place as the reference sample the template was extracted
from; `3.1-final` and `3.2-final` are the two confirmed baseline card styles. Next real step: fold
the formalized template into a real Production Spec contract used by the production pipeline (see
`.context/prototypes/carousel-production-spec-contract.md`).
