---
name: log-post
description: "Link a published Facebook Post URL back to the Idea AND Recipe it came from for the named Brand, so its performance can be tracked."
---

# /log-post

Usage: `/log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]`

Record that the Operator published a Post from one of an Idea's **Assets** (one per chosen Recipe —
ADR-0009/0011) for the named Brand. **This is the only way a Post is attributed to an Idea's Asset —
attribution is keyed `(Idea, Recipe)`, explicit, and never inferred (always-rules #5).**

`<brand>` is required — omitting it is an error, never a silent default. `<recipe>` is REQUIRED
(issue #56) — it names WHICH of the Idea's Assets this Post belongs to. If `<recipe>` does not match
one of the Idea's recorded Assets, the command REFUSES and lists the Idea's actual Assets (recipe +
status) so the Operator can correct the call — it never guesses "the only one" or "the most recent
one", even when the Idea happens to have exactly one Asset today.

**Gate 3 — Publish. Brand: `<brand>`.** The Operator is logging a Post for Brand `<brand>`. The
`post_url` is written onto the NAMED Recipe's Asset in `data/brands/<slug>/ledger.json` via
`AssetStore.writeAsset` — never onto a different Asset, never onto the Idea's own top-level fields.

## Steps

1. **Resolve the Brand.** Slugify `<brand>` and derive the Brand's ledger path via the resolver.
   State the active Brand: "Logging Post for Brand: `<brand>`."
2. **Run** `npm run log-post <brand> <idea-id> <recipe> <facebook-url> [posted-at]` (or call
   `logPostCommand()` in `src/commands/log-post.ts`). It:
   - Loads the Idea's recorded Assets (`data/brands/<slug>/ledger.json`, already per-Recipe —
     ADR-0011) and finds the Asset whose `recipe` matches `<recipe>` EXACTLY.
   - **Refuses** — and lists every one of the Idea's Assets (`recipe (status)`) — when no Asset
     matches `<recipe>`. Never infers.
   - **Refuses** when the matched Asset is not yet `produced` (still `queued`/`in_production`) — there
     is nothing to publish yet.
   - **Validates the URL** is a `facebook.com` (or `*.facebook.com`) permalink. Rejects anything else.
   - On success, writes `post_url`, `posted_at` (arg or now, ISO-8601) onto THAT Asset, advancing a
     `produced` Asset to `posted` (an already `posted`/`tracking`/`scored` Asset keeps its own status —
     a re-log only corrects the URL/timestamp, it never regresses progress).
   - Also refreshes that Asset's `post.json` (in its `idea-NN.<recipe>.output/` bundle — issue #112)
     from the ledger via `src/asset/output-bundle.ts`'s `refreshPostJson` — a GENERATED view, never
     a second store; an Asset with no local bundle directory yet is skipped cleanly.
3. **Confirm:** "Linked Post ◀ Recipe `<recipe>` for Idea `<id>`, Brand `<brand>`. Run
   `/track-performance <brand>` once engagement has accrued (give it a few days)."

## Guardrails
- **Brand is explicit** — `<brand>` is required; never fall back to a default Brand.
- **Recipe is explicit** — `<recipe>` is required; attribution is keyed `(Idea, Recipe)` and this is
  the ONLY way a Post is linked to an Asset — never inferred, never defaulted to "the only Asset" even
  when there is exactly one.
- All ledger reads/writes are scoped to `data/brands/<slug>/ledger.json`, and onto the ONE named
  Recipe's Asset — every sibling Asset of the same Idea is left untouched.
- One Post per (Idea, Recipe). Re-logging the same (Idea, Recipe) updates the URL/timestamp without
  regressing the Asset's status.
- Only `facebook.com` URLs. Don't accept a guess — the Operator states the URL.
- Don't pull metrics here; that's `/track-performance <brand>`.
