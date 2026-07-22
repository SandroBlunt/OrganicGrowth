# ★ THE BASELINE PROMPT

This section is the answer: the confirmed, reusable baseline prompt for the Data-card direction,
Structure 2's Layout-A-style slides (full-bleed photo + card). Everything in it is locked, not
still being tested:

- **Photo:** full-bleed, photorealistic, real products/logos/actions named explicitly (no invented
  UI, no vanilla stand-ins) — Nano Banana's own internet-grounded access handles the real-world
  detail. Fills the frame edge to edge on every card style, with no black margins or letterboxing
  anywhere in the photo area — including the top card placement, where the photo below the card
  fills its own region just as fully as it would fill the whole frame elsewhere.
- **Subject:** the specific scene the photo shows, built from real, concrete facts —
  - Pull at least 2–3 concrete, named details from the story itself (real company/product names,
    specific numbers, specific claims). Never a generic stand-in.
  - Show something happening — a specific action or moment, never a static, posed shot.
  - Name a specific, plausible physical setting, not a generic one ("a cluttered desk with two
    monitors and a half-empty coffee mug," not "a modern office").
  - If the slide reports something real, name it exactly and let the tool's own real-world
    grounding render it accurately — never invent a fake screen and pass it off as a real
    product's UI. Prefer naming a real, recognizable product/screen over describing small
    invented UI text: the tool has no real reference for fine fake UI copy and renders it as
    misspelled gibberish (e.g. "ChaGPT Work" for "ChatGPT Work"). Where no real screen can be
    shown, keep any on-screen text minimal, or leave the screen unreadable/out of focus, rather
    than specifying fine fake-UI copy.
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
  - **Vary the subject TYPE slide to slide.** Do not let every slide default to the same
    "laptops/phones showing a product UI" motif — across a carousel's 7 slides, mix product
    screens with real people, physical objects/settings, and candid moments so the sequence
    doesn't feel same-y.
  - **Reach for the real, named person when a story is clearly theirs, and balance people against
    product shots across the carousel.** Do not default to a product screen on every slide just
    because it is the safer choice — when a named person is the obvious subject, show them (per
    the guardrail above), and vary which slides use a person vs. a product/UI shot.
- **Logo:** the connected reference image `Straw_Motion_Logo` (not described in prose), laid
  horizontally along the top edge of the photo, rendered unaltered — no shape/proportion/color
  changes — with a soft dark gradient vignette behind it for legibility, never a hard-edged solid
  black bar or box. **Scale varies by slide position:** on the hook slide (`slide_index` 0),
  no wider than ~⅓ frame width, as before; on slides 2-6 (`slide_index` 1-5 — then, shift, proof,
  different, next), tiny; on the cta slide (`slide_index` 6), back to no wider than ~⅙ frame
  width — so the stat callout and supporting line, not the branding, carry the slide's visual
  weight (issue #106 item 7).
- **Logo guardrail — negative-prompt instruction (issue #110):** the connected reference image is a
  bare identifier for which asset to swap in, never a caption. Beyond rendering it unaltered
  (above), never render its reference name, its file name, or any underscored/technical token that
  identifies it (e.g. `Straw_Motion_Logo`) as visible text anywhere in the image — it identifies
  which reference to use, never a label to draw. This Recipe's canvas has no dedicated
  negative-prompt field to carry this instruction separately (verified against
  `src/recipe/registry.ts`'s canvas inputs and `src/space-driver/port.ts`'s `SpaceMcpPort` — neither
  exposes one), so it is stated as an explicit prohibition inside the image prompt itself, alongside
  the "render unaltered" clause (see the template and worked examples below). Where a canvas DOES
  offer a dedicated negative-prompt field, add this instruction there too.
- **"Unhypped News" pill:** a fully rounded, stadium-shaped badge — thin black border, white fill —
  with "Unhypped News" centered inside it in Inter, title case only (capital U, capital N, the rest
  lowercase — **never** all-caps, regardless of surrounding typography), sitting next to the slide's
  tiny real product logos — one per company in that slide's `companies` list (a slide naming no
  real company omits the logo row entirely). **Scale varies by slide position, matching the logo
  above:** the hook slide (`slide_index` 0) may keep today's larger badge; every other slide
  (`slide_index` 1-6) renders it noticeably smaller, so it reads as a quiet tag rather than a
  headline element (issue #106 item 7).
- **Card text:** stat callout + supporting line, both set in **Inter**. Never an em dash ("—"), an en
  dash ("–"), or a hyphen used as a sentence dash (" - ", with spaces on both sides) in either one —
  it is an AI "tell" and hurts scannability. Where a dash would join two clauses, write them as
  separate short sentences instead. An ordinary hyphenated word (`state-of-the-art`) is unaffected —
  only a hyphen surrounded by spaces counts. The supporting line renders at a comfortably readable
  size — a minimum of roughly 13-14px equivalent — never shrunk down to a small caption-sized
  afterthought under the stat callout.
- **Card style — all 7 placements below are confirmed, working options** (`1`–`7` in the Examples
  below): full-width bottom card, floating "toast" card, top card with photo below, small floating
  badge, and three circular-inset variants layered on the first three. **Actively spread
  placements across the vertical range, slide to slide — never default to the same one or two
  placements every time.** Every carousel MUST use at least one **top card, photo below**
  placement (`3` or `6` in the Examples) alongside its bottom/lower placements — a carousel that
  sits at the bottom or lower-left on every slide reads as monotone and is not on-brief. Every
  placement — including the top card — fills its own photo region edge to edge, with no black
  margins or letterboxing at any edge; only the card itself (never the photo) is ever allowed to
  look inset.

---

## Operator QA reinforcements (2026-07-22) — apply on EVERY slide

Live-review feedback on real carousels. These sharpen the Subject rules above; treat them as hard.

- **Name the actual physical device, and lean on grounding.** When a slide is about a specific
  product/gadget, name it EXACTLY (e.g. **Codex Micro**, OpenAI's coding-agent controller built with
  Work Louder) and tell the tool to render the REAL device from its own search/grounding, not a
  generic stand-in. Add an explicit directive like: "Use real reference imagery of the actual
  [Product]; match its real shape, layout, and branding — do not invent a generic look-alike." A
  vaguely-described "a controller / a keyboard" renders as a random gadget and is not on-brief.
- **Show the real people.** When a company is central, put its real, recognizable person in frame,
  grounded in real public photos (Sam Altman for OpenAI, the named founder of Kimi K3, etc.) — not a
  generic anonymous stand-in. Balance people against product shots across the 7 slides; do not default
  to a faceless desk/UI motif every slide.
- **Ground a vague hook in the real subject anyway.** Even when the on-card TEXT withholds a name for
  a reveal (e.g. the hook says "one airline"), the PHOTO must still depict the real, specific subject
  — show a recognizable **Virgin Atlantic** operations setting, not an anonymous office. The
  withheld-name teaser lives in the words, never in a generic image.
- **Match the scene to the people the story is about.** For an education story (e.g. Claude free for
  teachers), actually show teachers AND students in a real classroom — not a lone adult on a video
  call. The persona/setting must reflect who the news is about.
- **Never emit a meta / nonsense scene.** Do not let the tool drift into rendering a diagram "about"
  Straw Motion or the Unhypped News badge itself, or a collage of unrelated stock imagery. The photo
  is always a concrete, real-world scene that illustrates THIS slide's fact.

---

## The 7-slide narrative — a copy formula per role

Every News Carousel tells the same story shape: something changed, here's proof it's real, here's
why it matters, here's what's next. Each of the 7 fixed roles has one job. Follow its formula filled
in with *this* story's own specifics — never a generic restatement of the role's label.

**Every role's on-slide line — both the `stat_callout` and the `text` — must advance real
comprehension: state plainly what happened and what it means.** A short, punchy `stat_callout` is
acceptable only when it is ALSO informative — it must still name a fact a reader could repeat back.
Never a bare mood/vibe line that carries no fact at all: **"Same week."** and **"You still check."**
are the anti-pattern to avoid — both read as a mood, not news, and name nothing a reader could repeat
back. A fixed version of each still names the fact in a few words ("3 launches, one week." / "You
still check the work.") — informative AND short, never one at the expense of the other.

For each role below, the `stat_callout` names the fact in a handful of words; the `text` states, in
one plain sentence, what that fact means for the reader. Follow the formula filled in with *this*
story's own specifics — never a generic restatement of the role's label, and never a mood-only
substitute for the fact itself.

1. **hook** — Compress the whole "before → now" shift into one sentence, specific enough to repeat
   to a friend after a glance. Real names, real numbers, no hype words ("game-changing,"
   "revolutionary"). This slide previews the whole arc; the next two slides get to slow down and
   unpack it. The `stat_callout` names the shift's size or count in a few words; the `text` spells out
   what changed and why it matters.
   *"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job."*

2. **then** — State the old assumption or status quo, specific and dated where you can. Give the
   reader the baseline the next slide's shift is about to break. The `stat_callout` names what the old
   way could not do; the `text` states that limitation in one plain sentence.
   *"An AI assistant could answer a question. It could not finish a task on its own."*

3. **shift** — Name the specific, concrete event that broke that assumption: who did what, when.
   This is the news itself — no hedging ("might," "could"). The `stat_callout` names the count or the
   headline fact; the `text` states who did what.
   *"OpenAI shipped ChatGPT Work. Anthropic shipped Claude Cowork. Meta shipped Muse Spark. All in the
   same week."*

4. **proof** — One specific, verifiable detail that shows the shift is real, not hype: a real demo,
   a real number, a real screenshot. This slide exists to answer the skeptic. The `stat_callout` pulls
   the one concrete figure; the `text` states what that figure proves.
   *"ChatGPT Work closed out a 12-step to-do list, unattended, in nine minutes."*

5. **different** — Answer "haven't we heard this before?" Name the concrete thing that makes this
   instance actually different from past, similar-sounding claims — never a vague "this time it's
   real." The `stat_callout` names the specific new capability; the `text` states what past attempts
   could not do that this one can.
   *"Past 'agent' launches could only browse a page. This one can submit a real form."*

6. **next** — A specific, near-term consequence — what should the reader expect to change in their
   own work because of this, not a vague prediction. The `stat_callout` names the timeframe or scope;
   the `text` states the concrete expected change.
   *"Expect your own inbox to start getting drafted replies by default within the month."*

7. **cta** — Close by directly asking the reader to follow **Straw Motion** (the Page — "Unhypped
   News" is this series' name, not a separate followable account), anchored to the no-hype promise.
   The `stat_callout` names the promise in a few words; the `text` (or the close line itself) states
   plainly what the reader keeps getting if they follow. Vary the wording per story. (The caption's
   own required CTA/hashtags are added later, separately, by the copy step — this is just the
   on-image close line.)
   *Variations to draw from:*
   - "Follow Straw Motion. We skip the hype, you get the story."
   - "No hype. No spin. Just what happened. Follow Straw Motion."
   - "Follow Straw Motion for AI news that isn't trying to sell you anything."
   - "Straw Motion: the unhypped take on AI. Follow for more."

---

**Reusable template** (swap the bracketed parts per slide; everything else is fixed):

> A vertical viral Instagram news post. A full frame high quality photograph[, cropped to the top
> ~70% of the frame, that photo filling its own region edge to edge with no black margins —
> full-width card style / filling the entire frame edge to edge with no black margins — floating
> toast card style], of `[SUBJECT: real products/logos/people/actions, named explicitly — prefer a real,
> recognizable product/screen over fine invented UI text, which renders as misspelled gibberish;
> where no real screen exists, keep any on-screen text minimal]`. Along
> the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally,
> `[SCALE — small and subtle in scale, no wider than roughly a third of the frame width, on the
> hook slide (slide_index 0); tiny in scale on slides 2-6 (slide_index 1-5 — then, shift, proof,
> different, next); back to no wider than roughly a sixth of the frame width on the cta slide
> (slide_index 6)]` so it stays a
> quiet brand mark and never competes with the headline or stat callout for attention. Render the
> logo exactly as provided in the reference image: do not change its shape, proportions, or color
> in any way, and do not restyle it to match the scene. Never render this reference image's name or
> file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies
> which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it
> for legibility against the photo, never a hard-edged solid black bar or box. Whichever placement
> is used — including a top card with the photo below it — the photograph always fills its own
> entire allotted region edge to edge, with no black margins or letterboxing on any side. `[CARD
> CLAUSE — full-width bottom card, or floating toast card with its own soft gradient vignette +
> drop shadow, never a hard-edged box]`. Inside the card, top-left, is a pill-shaped badge — a fully
> rounded, stadium-shaped outline with a thin black border and a white fill — containing the text
> "Unhypped News" centered inside it, set in Inter font, black text. Render the text inside the
> pill exactly as "Unhypped News" — capital U, capital N, every other letter lowercase. Never
> render it in all-caps/uppercase lettering, no matter the surrounding typography style. `[LOGO ROW —
> one sentence matched to this slide's companies list, e.g. "Positioned next to the pill are three
> tiny real product logos (OpenAI, Anthropic, Meta) in a row." for three, or "Positioned next to the
> pill is a single tiny OpenAI product logo." for one; omit the sentence entirely when companies is
> empty]` Below that,
> in large bold black display type, is the stat callout "`[STAT]`", and beneath it, in clearly
> readable near-black sentence-case text (no smaller than roughly 13-14px equivalent — never a tiny
> caption-sized afterthought), the supporting line "`[SLIDE TEXT / HEADLINE]`" All text on the
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
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, that photo filling its own region edge to edge with no black margins, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent), the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "2",
    "placement": "Bottom, floating \"toast\" card — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling the entire frame edge to edge with no black margins, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. Near the bottom of the frame, inset with a visible margin of photo on all sides (not touching the frame edges), floats a compact solid white rounded card, like a notification toast. A soft dark gradient vignette sits behind the card, in the photo, for legibility and separation — never a hard-edged solid black bar or box — in addition to its own subtle drop shadow. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in bold black display type, is the stat callout \"3 companies.\", and beneath it, in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent), the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "3",
    "placement": "Top card, photo below — pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent), the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame edge to edge with no black margins on any side, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "4",
    "placement": "Small floating badge card, lower-left — WINNING FORMULA, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling the entire frame edge to edge with no black margins, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark gradient vignette sits behind the card, in the photo, for legibility and separation — never a hard-edged solid black bar or box — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent) wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "5",
    "placement": "Bottom, full-width card + circular inset, bottom-right of the photo — JOB: DONE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph, cropped to the top ~70% of the frame, that photo filling its own region edge to edge with no black margins, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of the ChatGPT Work interface's task-complete checkmark, with the text \"JOB: DONE\" above it. Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card sitting on top of the image like a native app UI panel, full width, edge to edge. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent), the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "6",
    "placement": "Top card, photo below + circular inset, upper-right of the photo — no caption, pill badge",
    "image_prompt": "A vertical viral Instagram news post. Across the top ~25-30% of the frame is a solid white rounded card sitting on top of the image like a native app UI panel, full width. Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Below that, in large bold black display type, is the stat callout \"3 companies.\", and beneath it, in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent), the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Below the card, filling the remaining ~70-75% of the frame edge to edge with no black margins on any side, is a full frame high quality photograph of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the bottom edge of that photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. In the upper-right corner of that photo, a small circular inset photo shows a close-up of the Anthropic Claude Cowork interface synced across the laptop and the phone beside it. No caption text. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  },
  {
    "variation_id": "7",
    "placement": "Small floating badge card, lower-left + circular inset, bottom-right of the photo — TOOLS: LIVE, pill badge",
    "image_prompt": "A vertical viral Instagram news post. A full frame high quality photograph filling the entire frame edge to edge with no black margins, of a modern desk with three laptops side by side, each open to a different real AI product actively mid-task: on the left, the OpenAI ChatGPT Work interface completing a multi-step to-do; in the middle, the Anthropic Claude Cowork interface open across both the laptop screen and a phone propped beside it; on the right, Meta's Muse Spark interface shown mid-task, calling an external tool. Each screen shows its real, current logo and interface design. Along the top edge of the photo, lay the connected reference image Straw_Motion_Logo horizontally, small and subtle in scale — no wider than roughly a third of the frame width — so it stays a quiet brand mark and never competes with the headline or stat callout for attention. Render the logo exactly as provided in the reference image: do not change its shape, proportions, or color in any way, and do not restyle it to match the scene. Never render this reference image's name or file name (for example Straw_Motion_Logo) as visible text anywhere in the image. It identifies which reference to use, never a caption to draw. A soft dark gradient vignette sits behind it for legibility against the photo, never a hard-edged solid black bar or box. In the bottom-right corner of the photo, a small circular inset photo shows a close-up of Meta's Muse Spark interface mid-call to an external tool, with the text \"TOOLS: LIVE\" above it. In the lower-left corner, a small compact solid white rounded rectangle card, not full width, floats over the photo like a small overlay badge. A soft dark gradient vignette sits behind the card, in the photo, for legibility and separation — never a hard-edged solid black bar or box — in addition to its own subtle drop shadow. Inside the compact card, in a single condensed row, is a pill-shaped badge — a fully rounded, stadium-shaped outline with a thin black border and a white fill, matching a simple rounded-rectangle badge — containing the text \"Unhypped News\" centered inside it, set in Inter font, black text. Render the text inside the pill exactly as \"Unhypped News\" — capital U, capital N, every other letter lowercase. Never render it in all-caps/uppercase lettering, no matter the surrounding typography style. Positioned next to the pill are three tiny real product logos (OpenAI, Anthropic, Meta) in a row. Directly beneath that row, in bold black display type, is the condensed stat callout \"3 companies.\" with the supporting line \"A week ago your AI answered questions. This week OpenAI, Anthropic, and Meta gave it a job.\" in clearly readable near-black sentence-case text (no smaller than roughly 13-14px equivalent) wrapping beneath it. All text on the card — inside the \"Unhypped News\" pill, the stat callout, and the supporting line — is set in Inter. Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay for the photo, clean flat UI-card typography for the card."
  }
]
```

---
