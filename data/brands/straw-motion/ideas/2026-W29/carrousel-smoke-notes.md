# News Carousel — live e2e smoke test (2026-07-18)

> Connected issue: SandroBlunt/OrganicGrowth#102 (HITL — iterate baseline prompt + contract).

Three `news-carousel` Ideas produced end-to-end against the **live Carrousel Space**
(`https://www.magnific.com/app/spaces/a2402c48-b688-436b-8cb6-23a4aad7822e`), one attended session,
one job at a time. **Generated, never published.** 21 slides, 75 credits/slide, ~1,575 total, zero
mechanical-gate failures.

This branch carries the produced state (ledger + queue + 3 spec files) as the starting point for
iterating the recipe's **contract** (baseline prompt + skill instructions + code contract). It is a
**HITL** iteration branch — not for `/build-issue`.

## What to iterate (the contract)

- Baseline prompt: `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md`
- Skill instructions: `.claude/skills/produce-news-carousel/SKILL.md`
- Code contract: `src/recipe/registry.ts` (`NEWS_CAROUSEL`) · `src/production-spec/news-carousel-contract.ts` · `news-carousel-author-checklist.ts`

## Runs

### Run 1 — idea-01 "AI just got a job" (three-company story)
Spec: `idea-01.news-carousel.spec.json`
- hook  — https://www.magnific.com/app/creation/brQ0ACM5Y2
- then  — https://www.magnific.com/app/creation/swrBVkCl8e
- shift — https://www.magnific.com/app/creation/ONUaoU1ynm
- proof — https://www.magnific.com/app/creation/ubazifDQLD
- different — https://www.magnific.com/app/creation/gJj8pwXSXO
- next  — https://www.magnific.com/app/creation/rl5pcgGxtc
- cta   — https://www.magnific.com/app/creation/kLqMYll16B

### Run 2 — idea-02 "GPT-5.6 is live for everyone" (one-company story)
Spec: `idea-02.news-carousel.spec.json`
- hook  — https://www.magnific.com/app/creation/brQ0pPa5Y2
- then  — https://www.magnific.com/app/creation/y6wfFVvPW9
- shift — https://www.magnific.com/app/creation/IaXNZjEtvE
- proof — https://www.magnific.com/app/creation/MXcUyqvDCm
- different — https://www.magnific.com/app/creation/aQtZnw6fSh
- next  — https://www.magnific.com/app/creation/hE83GUIvqL
- cta   — https://www.magnific.com/app/creation/fFm2YOeCDY

### Run 3 — idea-03 "Grok 4.5 vs Claude Opus 4.8" (two-company comparison)
Spec: `idea-03.news-carousel.spec.json`
- hook  — https://www.magnific.com/app/creation/J9SvKrEOq4
- then  — https://www.magnific.com/app/creation/74gh5xqJAL
- shift — https://www.magnific.com/app/creation/ohe4nD2829
- proof — https://www.magnific.com/app/creation/74gh5lkJAL
- different — https://www.magnific.com/app/creation/aQtZMmvfSh
- next  — https://www.magnific.com/app/creation/9ROuj40NYZ
- cta   — https://www.magnific.com/app/creation/MXcURpiDCm

## Findings to resolve in the contract (logo rendering explicitly OUT of scope)

1. **Eyebrow product-logos must be a first-class per-slide parameter (count + which companies).**
   The baseline doc hardcodes "three tiny real product logos (OpenAI, Anthropic, Meta)". The producer
   had to reword that one clause per story; it flexed correctly to **3 → 1 → 2** companies (verified in
   render: no phantom logos, none dropped), but the contract should make count+companies explicit
   rather than a literal "three" the author must improvise around.

2. **Pin the correct spec-injection method for the driver.** The producer's single-shot inject of the
   full ~17 KB spec into `JSON Master` via `spaces_edit` returned `query must not be greater than 4000
   characters` and it fell back to 7 chunked appends. Operator confirms longer prompts inject fine —
   so this is the **wrong method**, not a canvas limit. Define + document the correct one-shot inject
   so an unassisted run injects the whole spec in one call.
   - **Resolved 2026-07-21 (PR #103): the 4,000-character-limit premise above was wrong** (Operator-
     confirmed). The pinned one-shot method is the driver's own `injectSpec`
     (`src/space-driver/driver.ts`): ONE `spaces_edit` call carrying the full Spec, polled to
     terminal, then a read-back confirming the node text changed. Production routes through
     `driveToNextGate`, whose first leg uses exactly this — the chunked-append improvisation above is
     retired, not the method.

3. **Ledger asset shape for a carousel.** `LedgerAssetRecord.asset_url` is a single, signed/expiring
   URL; a 7-slide carousel needs a durable, multi-image representation. Durable per-slide links are the
   `magnific.com/app/creation/...` URLs above.

4. **Producer robustness (minor).** Scoped `spaces_get_nodes` reports the `creation`-type `Brand_Logo`
   node as "missing" though a full `spaces_state` shows it bound — verify creation-node binds via the
   full board read. Mid-run the aggregated creation list count/order is flaky — map creations to slides
   by unique `stat_callout`, not position.

5. **Card-style distinctness (optional).** The two confirmed card styles (`full_width` vs
   `floating_toast`) read only weakly different in output — worth revisiting in the baseline doc.

## Out of scope (per Operator)
- Brand-logo rendering (legibility / recolor / composite-vs-redraw) — not a concern for this iteration.
- Brand-logo reference name — already aligned: the canvas node name (`Brand_Logo`) is canonical and stays.
