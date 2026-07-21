# ★ THE BASELINE PROMPT

This section is the answer: the confirmed, reusable baseline prompt for the Data-card direction,
Structure 2's Layout-A-style slides (full-bleed photo + card). Everything in it is locked, not
still being tested:

- **Photo:** full-bleed, photorealistic, real products/logos/actions named explicitly (no invented
  UI, no vanilla stand-ins) — Nano Banana's own internet-grounded access handles the real-world
  detail.
- **Subject:** the specific scene the photo shows, built from real, concrete facts —
  - Pull at least 2–3 concrete, named details from the story itself (real company/product names,
    specific numbers, specific claims). Never a generic stand-in.
  - Show something happening — a specific action or moment, never a static, posed shot.
  - Name a specific, plausible physical setting, not a generic one ("a cluttered desk with two
    monitors and a half-empty coffee mug," not "a modern office").
  - If the slide reports something real, name it exactly and let the tool's own real-world
    grounding render it accurately — never invent a fake screen and pass it off as a real
    product's UI.
  - If the slide is about a feeling, outcome, or prediction with nothing "real" to point at,
    describe an equally concrete, specific scene from the reader's own world — never fall back to
    something vague.
  - If the story is clearly tied to a specific, publicly recognizable person (a named company's
    CEO — Sam Altman, Elon Musk, etc.), include that person, grounded in real, publicly available
    photos of them, the same way real products are grounded. Never invent a generic stand-in when
    a real, identifiable person is the obvious subject.
  - Guardrail: only ever show a real person doing something plausible and real — never a
    fabricated, harmful, or defamatory situation. The scene must read as a real, newsworthy
    moment, not a staged fabrication.
- **Logo:** `Straw_Motion_Logo` connected as a reference image (not described in prose), laid
  horizontally along the top edge of the photo, small and subtle (≤ ~⅓ frame width), rendered
  unaltered — no shape/proportion/color changes — with a soft dark vignette behind it for
  legibility.
- **"Unhypped News" pill:** a fully rounded, stadium-shaped badge — thin black border, white fill —
  with "Unhypped News" centered inside it in Inter, title case only (capital U, capital N, the rest
  lowercase — **never** all-caps, regardless of surrounding typography), sitting next to the slide's
  tiny real product logos — one per company in that slide's `companies` list (a slide naming no
  real company omits the logo row entirely).
- **Card text:** stat callout + supporting line, both set in **Inter**.
- **Card style — all 7 placements below are confirmed, working options** (`1`–`7` in the Examples
  below): full-width bottom card, floating "toast" card, top card with photo below, small floating
  badge, and three circular-inset variants layered on the first three. Pick whichever placement
  best fits the story, and vary it slide to slide across a carousel — never default to the same one
  or two placements every time.

---

## The 7-slide narrative — a copy formula per role

Every News Carousel tells the same story shape: something changed, here's proof it's real, here's
why it matters, here's what's next. Each of the 7 fixed roles has one job. Follow its formula filled
in with *this* story's own specifics — never a generic restatement of the role's label.

1. **hook** — Compress the whole "before → now" shift into one sentence, specific enough to repeat
   to a friend after a glance. Real names, real numbers, no hype words ("game-changing,"
   "revolutionary"). This slide previews the whole arc; the next two slides get to slow down and
   unpack it.
   *"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job."*

2. **then** — State the old assumption or status quo, specific and dated where you can. Give the
   reader the baseline the next slide's shift is about to break.
   *"Until last week, an AI assistant could answer a question — it couldn't finish a task on its
   own."*

3. **shift** — Name the specific, concrete event that broke that assumption: who did what, when.
   This is the news itself — no hedging ("might," "could").
   *"OpenAI shipped ChatGPT Work. Anthropic shipped Claude Cowork. Meta shipped Muse Spark — all in
   the same week."*

4. **proof** — One specific, verifiable detail that shows the shift is real, not hype: a real demo,
   a real number, a real screenshot. This slide exists to answer the skeptic.
   *"ChatGPT Work closed out a 12-step to-do list, unattended, in nine minutes."*

5. **different** — Answer "haven't we heard this before?" Name the concrete thing that makes this
   instance actually different from past, similar-sounding claims — never a vague "this time it's
   real."
   *"Past 'agent' launches could only browse. This one can actually click 'submit' on a real form."*

6. **next** — A specific, near-term consequence — what should the reader expect to change in their
   own work because of this, not a vague prediction.
   *"Expect your own inbox to start getting drafted replies by default within the month."*

7. **cta** — Close by directly asking the reader to follow **Straw Motion** (the Page — "Unhypped
   News" is this series' name, not a separate followable account), anchored to the no-hype promise.
   Vary the wording per story. (The caption's own required CTA/hashtags are added later, separately,
   by the copy step — this is just the on-image close line.)
   *Variations to draw from:*
   - "Follow Straw Motion. We skip the hype, you get the story."
   - "No hype. No spin. Just what happened. Follow Straw Motion."
   - "Follow Straw Motion for AI news that isn't trying to sell you anything."
   - "Straw Motion: the unhypped take on AI. Follow for more."

---

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
> render it in all-caps/uppercase lettering, no matter the surrounding typography style. `[LOGO ROW —
> one sentence matched to this slide's companies list, e.g. "Positioned next to the pill are three
> tiny real product logos (OpenAI, Anthropic, Meta) in a row." for three, or "Positioned next to the
> pill is a single tiny OpenAI product logo." for one; omit the sentence entirely when companies is
> empty]` Below that,
> in large bold black display type, is the stat callout "`[STAT]`", and beneath it, in smaller
> near-black sentence-case text, the supporting line "`[SLIDE TEXT / HEADLINE]`" All text on the
> card — inside the "Unhypped News" pill, the stat callout, and the supporting line — is set in
> Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography
> overlay for the photo, clean flat UI-card typography for the card.

---

## Examples

Worked examples of the baseline template above, applied to idea-01's Hook slide. "Unhypped News"
renders as the pill badge shown in the reference image you supplied — a fully rounded,
stadium-shaped badge (thin black outline, white fill) with "Unhypped News" centered inside it in
Inter, title case only, next to the example story's 3 tiny real product logos.

```json
[
  {
    "variation_id": "1",
    "placement": "Bottom, full-width card — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "2",
    "placement": "Bottom, floating \"toast\" card — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling the entire frame edge to edge, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Near the bottom of the frame, inset with a visible margin of photo on all sides (not touching the frame edges), floats a compact solid white rounded card, like a notification toast. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3",
    "placement": "Top card, photo below — pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "4",
    "placement": "Small floating badge card, lower-left — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling nearly the entire frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in smaller near-black sentence-case text wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "5",
    "placement": "Bottom, full-width card + circular inset, bottom-right of the photo — JOB: DONE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of the ChatGPT Work interface's task-complete checkmark, with the text \"JOB: DONE\" above it. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "6",
    "placement": "Top card, photo below + circular inset, upper-right of the photo — no caption, pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in smaller near-black sentence-case text, the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the upper-right corner of that photo, a small circular inset photo shows a close-up of the Anthropic Claude Cowork interface synced across the laptop and the phone beside it. No caption text. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "7",
    "placement": "Small floating badge card, lower-left + circular inset, bottom-right of the photo — TOOLS: LIVE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling nearly the entire frame, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. A soft dark vignette sits behind it for legibility against the photo. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of Meta's Muse Spark interface mid-call to an external tool, with the text \"TOOLS: LIVE\" above it. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark vignette sits behind the card, in the photo, for legibility and separation — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in smaller near-black sentence-case text wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  }
]
```

---
