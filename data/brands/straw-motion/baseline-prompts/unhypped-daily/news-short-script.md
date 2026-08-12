# ★ THE BASELINE PROMPT — News Short Script (Unhypped Daily)

This document is the **voice** of the News Short Script Recipe: how a script must sound when the
Operator reads it on camera. The `produce-news-short-script` Skill reads and interprets this document
to author each script (ADR-0015/0018); the Recipe itself (registry) owns the Spec shape, the Shot
List mechanics, and the validators — none of that lives here.

**The product:** one story per short. A teleprompter script of **120–150 words**, read fast, landing
at **45–60 seconds**. Published as a YouTube short on https://www.youtube.com/@strawmotion.

**Where this voice comes from:** a transcript study of 12 episodes of Fireship's "The Code Report"
(the delivery-mechanics report is recorded on issue #173). We copy the delivery machinery — the cold
hook, the long-run-then-punch rhythm, the smuggled dry humor, the self-posed-question pivots, the
receipts behind every claim. We strip everything that needs developer insider knowledge, and we make
his occasional skeptic beat **mandatory** — that beat is what "Unhypped" means on camera.

---

## The beat map

These beats are the required CONTENT and their word budgets — they keep the total inside 120–150.
They are NOT a fixed running order or a visible scaffold (Operator rule, 2026-08-11): the structure
flexes to the story. A story can open on its catch, land its verdict mid-way, or merge two story
beats — as long as every beat's content is present and the machinery stays invisible.

| # | Beat | Budget | Job |
|---|------|--------|-----|
| 1 | **Hook** | 12–27 words | Starts with "You". A number in the first two sentences. Never throat-clearing. |
| 2 | **Story beats** (2–3) | 25–45 each | What happened → how it works or the proof. Real names, real numbers, one stupidly simple explanation. |
| 3 | **The honest catch** | 15–30 words | The limit, cost, or caveat the announcement glossed over. Mandatory. |
| 4 | **Verdict** | 10–20 words | What the viewer should do or expect. Blunt, no hedging. |
| 5 | **Sign-off** | 6–11 words | Invites a comment/question about the viewer's OWN life and how AI is affecting it (2026-08-12 grilling) — never a generic follower-growth line. Rotates within a small fixed family — see §12. |

Each beat pairs with one Shot List entry (source URL + show-cue) — the Recipe's Spec shape carries
that; the teleprompter text itself contains **only speakable words**. No stage directions, no emoji,
no headings read aloud. The produced script file marks each beat's pairing inline with a `[Next shot]`
annotation between beats — a document marker only, never spoken (issue #187). Every beat also carries
3-5 **Curiosity Queries** — suggested search queries that help the Operator find better real source
material for that beat; never spoken, never itself the beat's `source_url`/`media_url`/`show_cue`
(CONTEXT.md "Curiosity Queries").

**Never an explicit calendar date anywhere in a beat's spoken line** (not just the hook) — the platform
already shows the date; see "What we deliberately did NOT copy from Fireship" below. **Never let two
beats' source page repeat the same site/company** — vary the Shot List's own sourcing, beat to beat.
Both are mechanically checked (`news-short-script-author-checklist.ts`), the same reject-only way as
the banned-word scan.

---

## Delivery rules

### 1. The hook: starts with "You" (Operator rule, locked)

The first word of every script is **"You"** (or "Your") — the viewer is grabbed personally before
the news is named. Inside that direct address, keep the machinery: a real event, a superlative that
earns itself, and a number within the first two sentences. Never warm up.

- **Don't:** "Today we're going to talk about AI pricing, because something interesting happened."
- **Do:** "You just got an eighty percent discount on AI, and nobody made the model smarter."
- **Do:** "You know the AI that makes video clips? It just moved a real robot's hand."

An occasional inflate-then-deflate open is allowed (build fake stakes for one sentence, puncture
them, then deliver the real news) — at most one per week of shorts, or it becomes the formula. It
still starts with "You".

### 2. Rhythm: long run, then punch

Chain facts into one longer breathless sentence, then stop it dead with a punch of three to eight
words. The punch is a **judgment**, not a fact. Aim for one punch roughly every three or four
sentences, and vary sentence length unpredictably — never two long runs back to back, never a page
of staccato.

- **Do:** "It makes twenty second clips with the sound already in them. No voice tool, no dubbing
  pass, no stitching."
- **Do (verdict punch):** "Same invoice, better brain."
- **Don't:** even-length sentences marching in step, the AI tell this rule exists to kill.

### 3. Explain it stupidly simple (mandatory when any concept appears)

Every technical concept that enters the script gets a one-breath explanation so plain it feels
almost stupid — an everyday object, an everyday chore, a thing your aunt owns. Not a definition. A
picture. If a concept can't be explained this way in one breath, cut the concept, not the clarity.
Saying "here's the stupidly simple version" out loud before the explanation is allowed and
encouraged — it's a promise the viewer loves.

- **Don't:** "Tokens are the tokenized subword units the API meters."
- **Do:** "A token is a little chunk of text. It's the taxi meter AI bills you on."
- **Do:** "Open weights means the brain itself is a file you can download."

**The mapping test (Operator rule, 2026-08-10):** the picture must behave the way the real thing
behaves, in the way that matters to this story. A taxi meter works for tokens because both tick up
as you use them. When the mapping doesn't hold, the picture confuses instead of explains — and when
the plain sentence is already simple, say it plain; don't decorate it.

- **Don't (recorded example):** "They rewrote the kitchen that serves it." A kitchen explains
  nothing about serving code. The plain version needs no picture at all: "They rewrote the code
  that delivers its answers."

Never two pictures in the same beat — they collide. These tiny pictures don't count against the
one-big-analogy cap in rule 5, but the mapping test applies to both.

### 4. Every superlative gets a receipt

A claim of size is immediately followed by its number. If there's no number, shrink the claim.
Banned outright: *game changing, revolutionary, mind blowing, insane, unbelievable, jaw dropping,
massive* (as a bare intensifier). The number states the size; the adjective never does.

- **Don't:** "This is a massive price cut."
- **Do:** "The price fell eighty percent, to twenty cents per million tokens."

### 5. One household analogy

At most one *extended* analogy per short — "X is basically Y" where Y is a household object, an
everyday job, or a relationship, never another technical thing (an analogy that needs its own
definition is a failed analogy). The one-breath pictures from rule 3 are exempt from this cap.

- **Do:** "Making video is guessing the next picture. Moving a hand is guessing the next move. Same
  guess, different body."
- **Don't:** "It's like a Kubernetes operator for your prompts."

### 6. Dry humor: one to two per short, never zero

A script with no joke is off-voice. One to two per short, delivered deadpan inside the news read —
the sentence still works if the joke is removed, and the read never winks at its own line. Three
approved shapes:

- **Smuggled aside** — a short fact-flavored jab inside a factual sentence.
  *"Reaction time, 101 milliseconds. Yours is about 250, on a good day."*
- **Deadpan after a straight fact** — one flat sentence of consequence right after the fact.
  *"Nothing you can see changed. The bill did."*
- **Absurd literalization** — take the advice or consequence one concrete step too far, briefly.
  *"No voice tool, no dubbing, no gluing three apps together at midnight."*

Humor punches at products, prices, and situations. A real person may be teased by **playful
nickname** (rule 11) — never mocked with malice.

### 7. Transitions come from the story, never from a template (Operator rule, 2026-08-11)

Move between beats with connective tissue that arises from THIS story's own logic — a self-posed
question the story itself raises, or picking up the previous sentence's thread. The shapes below
are inspiration only, **never stock lines to reuse**: *a self-posed question ("So how did it get
in?") · an escalation ("And that's not even the strange part.") · a concession ("To be fair,")*.
**Never announce a beat by its name** — "Now the catch.", "Here's the verdict.", "The hook is" are
banned on-air: they are the scaffolding showing. And never reuse the same transition phrase across
scripts — a recurring connective is a formula the audience hears by day three.
Never academic connectors (*furthermore, moreover, additionally*).

### 8. The honest catch — the brand beat, mandatory

Every script has one: the limit, the fine print, the number the announcement didn't lead with.
It is CONTENT, not a segment — woven into the story wherever the story turns (usually late, but a
story can even open on it), and **never introduced by a label phrase** (rule 7). Make it specific — a real constraint with a real figure where
possible, never a vague "time will tell." This is the beat that separates Unhypped Daily from every
other AI news channel, and it is never skipped, even for genuinely good news.

- **Do:** "One test, one setup. Eight points is a gap, not a knockout, and no benchmark has ever
  met your customers."
- **Don't:** "Of course, it remains to be seen how this plays out."

### 9. Hedge facts, never opinions

Unverified facts carry an explicit flag: *"allegedly," "the company says," "we don't know yet."*
**Never speak a news outlet's name in the script (Operator rule, 2026-08-11):** attribution lives
on screen (the Shot List's source page is visibly open) and in the description's Sources block. In
the spoken text, hedge without the name: *"one report says," "reportedly," "its own post says."*
A company that IS the story (OpenAI, Meta, Anthropic) is named freely; the outlet covering it never.
Opinions are stated flat, with no cushion: *"That's worth your time."* Never corporate hedges
(*arguably, it's worth noting, some might say*), never hedged opinions.

### 10. Register: plain human

- Contractions everywhere. Second person constantly — the viewer is in the story ("your bill,"
  "the project you shelved").
- Present tense for the news; past tense only inside the time-anchored event.
- No developer slang, no insider memes, no acronym soup.
- Write for the mouth: money and awkward decimals as you'd say them ("twenty cents," "five
  dollars"), plain figures as digits ("53.4," "101 milliseconds").
- Sparing casual compressors are fine ("basically," "kind of"). Banned filler intensifiers:
  *genuinely, really, truly, actually, honestly*. Banned corporate verbs: *leverage, underscore,
  reflect, empower*.
- No performed enthusiasm. The facts carry the excitement; the read stays flat.

### 11. Real people: playful, never nasty (Operator rule)

Naming real people is encouraged when the story is theirs. A **funny, affectionate nickname is
allowed** — the test is that the person themselves could laugh at it. Never offensive, never an
accusation dressed as a joke (a nickname that implies fraud, malice, or incompetence fails the
test), never invented quotes, never fabricated situations.

- **Do (playful):** a teasing epithet about a public habit everyone knows — their fashion, their
  posting streak, their tenth keynote this year.
- **Don't (accusation):** anything in the shape of "Snake Oil Sam" — it calls the person a fraud
  and fails the laugh test.

### 12. The close: verdict, then ritual Sign-off

The verdict tells the viewer what to do or expect in one blunt sentence. Then the **Sign-off**
(CONTEXT.md "Sign-off") — a fixed, small family of lines, ≤11 words, that invite a comment or question
about the viewer's OWN life and how AI is affecting them (2026-08-12 grilling) — never a generic
follower-growth line. Rotate within the family; don't invent a new close per script — a daily show earns
recognition through ritual repetition, the SAME way this Sign-off's own wording stays fixed while the
caption's own CTA (composed separately, out of this Recipe, by `write-social-copy`) is paraphrased fresh
every time.

- "Did AI change your week? Tell us how."
- "How is AI touching your life right now? Tell us."
- "What's one way AI touched your day? Comment below."

---

## Hard rules

- **Dash ban (code-enforced):** no em dash, no en dash, no hyphen used as a sentence dash, in any
  text field. Write two short sentences instead. Ordinary hyphenated words are fine.
- **Brand safety** (`brand-profile.yaml`): no medical or cure claims, no dangerous stunts presented
  as safe, no miracle framing.
- **One story per short.** A second story is tomorrow's short.
- **Never fabricate.** Every number in the script traces to the Idea brief's sources. If a fact
  isn't in the brief, it isn't in the script.

## What we deliberately did NOT copy from Fireship

Developer in-jokes, framework wars, and ecosystem slang (stripped register). The sponsor segment
(no sponsors). Accusatory epithets — playful nicknames stay (rule 11), nasty ones don't. The
multi-minute beats — the backfill history beat and the live demo beat — cut for the 60-second
budget. The mid-intro date stamp ("It is August 11th, 2026…") — it costs words the budget doesn't
have, and the platform shows the date; branding lives in the close instead.

---

## Sample scripts

Written from real stories (run 2026-W32), at target length. Beat labels are annotations for this
document — the teleprompter file carries only the spoken text.

### Sample 1 — "AI got 80% cheaper without getting smarter" (~145 words ≈ 55s)

> **[hook]** You just got an eighty percent discount on AI, and nobody made the model smarter. Your
> rent has never once done that.
> **[beat]** OpenAI didn't touch the model. They rewrote the code that delivers its answers, and
> the price fell to twenty cents per million tokens. A token is a little chunk of text. It's the
> taxi meter AI bills you on, and the ride just got cheaper.
> **[beat]** Anthropic's new Claude Opus 5 matches their best model on most tests at the same five
> dollar price. Same invoice, better brain. And Google's new Gemini does the same work with
> seventeen percent fewer tokens. That discount never shows up on a price tag.
> **[catch]** Now the catch. List price is one line on your bill. What you send and how often you
> retry still decide what you pay.
> **[verdict]** So that idea you shelved because it cost too much? Price it again. The math changed
> while you slept.
> **[cta]** Did AI change your week? Tell us how.

### Sample 2 — "The video model that moves a robot's hand" (~147 words ≈ 56s)

> **[hook]** You know the AI that makes video clips? It just moved a real robot's hand. Reaction
> time, 101 milliseconds. Yours is about 250, on a good day.
> **[beat]** Black Forest Labs opened early access to FLUX 3. One model that learned images, video,
> and sound together. A twenty second clip comes out with the audio already inside. No voice tool,
> no dubbing, no gluing three apps together at midnight.
> **[beat]** Then the same lab pointed the same kind of model at a robot arm. Here's the stupidly
> simple version. Making video is guessing the next picture. Moving a hand is guessing the next
> move. Same guess, different body.
> **[catch]** The catch. It's early access, and twenty seconds is a clip, not a film. Don't promise
> a client a movie yet.
> **[verdict]** But video tools and robots just became the same aisle of the store.
> **[cta]** How is AI touching your life right now? Tell us.

### Sample 3 — "The free model beat the one you rent" (~148 words ≈ 56s)

> **[hook]** You can now download a free model that beats the flagship you rent. On the test that
> measures actually doing work.
> **[beat]** Alibaba's Qwen 3.8 Max scored 53.4 on JobBench. OpenAI's GPT 5.6 Sol scored 45.4.
> Here's what JobBench checks, stupidly simply. Not how nicely a model chats. Whether it can finish
> a to-do list without a babysitter.
> **[beat]** And Qwen is open weights. The brain itself is a file you download and run on your own
> machines, so the per token bill simply stops existing. There's even a small version for hardware
> a two person team can afford.
> **[catch]** The catch. One test, one setup. Eight points is a gap, not a knockout, and no
> benchmark has ever met your customers.
> **[verdict]** If you parked an agent idea because of cost, retest it this week on your own tasks.
> **[cta]** What's one way AI touched your day? Comment below.

### How a script pairs with its Shot List (illustration, Sample 2)

| Beat | Source | Show-cue |
|------|--------|----------|
| hook | bfl.ai/blog/flux-3-mimic | The robot-hand demo clip, full frame |
| beat 1 | bfl.ai/blog/flux-3 | A FLUX 3 sample clip with its native audio audible for a beat |
| beat 2 | bfl.ai/blog/flux-3-mimic | Mimic demo again, side by side with a FLUX 3 clip |
| catch | (talking head) | Operator on camera, no overlay |
| cta | youtube.com/@strawmotion | Straw Motion logo end card |

Each row's real Shot List entry ALSO carries 3-5 Curiosity Queries (never shown here — a research aid
for the Operator, never spoken) and, in the produced `script.txt`, a `[Next shot]` marker sits between
every pair of beats' spoken lines (never inside them). The Shot List's real shape (source page URL,
media URL when identifiable, downloaded-or-link marking) is the Recipe's concern — this table only shows
how beats and shots line up one to one. Note the `cta` row now points at Straw Motion's own channel
rather than a bare `(end card)` placeholder — every beat's `source_url` must be a real, distinct URL, and
no two beats may point at the same site (issue #187).
