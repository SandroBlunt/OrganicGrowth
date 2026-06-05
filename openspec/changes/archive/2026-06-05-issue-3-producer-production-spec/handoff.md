# Slice Handoff — issue-3-producer-production-spec

> One bidirectional doc. The `developer` writes the Build Report; `qa` appends a QA Verdict; retries
> append Round-N blocks. Nothing is overwritten.

---

## Build Report (developer) — Round 1

### What changed

Delivers the **`production-spec`** capability (issue #3): the content **`producer`** agent definition,
plus the deep modules that turn an accepted **Brief** into a strict **Production Spec**, validate it
against the Space's contract, enforce the brand-safety hard filter, and persist it beside the Brief at
`ideas/<run>/idea-NN.spec.json`.

Architecture matches the Slice-1 house pattern: pure deterministic **deep modules** + thin **I/O
boundaries** + a thin **orchestration shell**, all under `src/production-spec/`. No clock is read inside
logic; all randomness/timestamps avoided (generation is deterministic). `node:test` +
`node:assert/strict`, `.ts` import extensions, JSDoc module headers throughout.

**Contract sourcing (Spike 3 decision — documented).** The Production Spec contract is encoded as a
compact in-code schema/style summary in `src/production-spec/contract.ts`, **not** read from the
truncated canvas system-prompt node. Spike 3 (`docs/producer-spikes-results.md`) found the Magnific read
API truncates text nodes at ~1,900 chars and cuts the system prompt off mid-section, so the canvas node
cannot reliably carry the tail of the contract (thumbnails / post_copy rules). The validator enforces
the in-code summary; this keeps the build hermetic (no live WebFetch in tests). The published-Google-Doc
WebFetch path is recorded in `contract.ts` as a deferred alternative if the in-code summary ever proves
insufficient.

### Files touched

**Added — agent**
- `.claude/agents/producer.md` — content `producer` agent (model `opus`).

**Added — code (`src/production-spec/`)**
- `contract.ts` — the in-code contract (constants + `ProductionSpec`/`SpecClip` types); header documents
  the Spike-3 "don't read the truncated canvas node" decision.
- `validate.ts` — pure `validate(spec) → { ok, errors }`; each error has a stable `code` + message.
- `brand-profile.ts` — defensive YAML reader for `data/brand-profile.yaml` `banned_words` (uses `yaml`).
- `brand-safety.ts` — pure `scanForBannedWords(spec, banned) → { ok, hits }` (case-insensitive,
  whole-word, scans every text field).
- `generate.ts` — pure deterministic `generate(brief) → ProductionSpec` composer.
- `store.ts` — `specPathFor(...)` + `saveSpec(...)` (writes `ideas/<run>/idea-NN.spec.json`).
- `compose.ts` — thin `composeSpec(brief, opts)` shell: generate → validate → brand-safety → persist
  (refuses to write a Spec that fails either gate).

**Added — tests + fixtures**
- `validate.test.ts`, `brand-safety.test.ts`, `generate.test.ts`, `store.test.ts`, `compose.test.ts`,
  `producer-agent.test.ts`.
- `fixtures/specs.ts` — a valid Spec + 8 deliberately-broken variants.
- `fixtures/brand-profile.banned.yaml` — fixture profile that **defines** banned words (the real
  profile's `banned_words` is empty, so it cannot exercise the reject path).

**Added — OpenSpec change**
- `openspec/changes/issue-3-producer-production-spec/` — `proposal.md`, `tasks.md`,
  `specs/production-spec/spec.md`, this `handoff.md`.

**Modified**
- `package.json` / `package-lock.json` — promoted `yaml` to a declared `dependencies` entry (it was only
  present transitively).

### How to run

```sh
npm install            # ensures yaml is installed (already in lockfile)
npm test               # tsc --noEmit type-check + node test runner over src/**/*.test.ts
npm run build          # tsc -p tsconfig.build.json (excludes *.test.ts)
npx openspec validate issue-3-producer-production-spec --strict
```

**Results (Round 1):**
- `npm test` → **65 tests, 65 pass, 0 fail** (41 new in this slice; the rest are Slice-1 tests, still
  green). The `tsc --noEmit` step inside `npm test` is clean.
- `npm run build` → exit 0.
- `openspec validate issue-3-producer-production-spec --strict` → `Change ... is valid`.

### Acceptance-criteria self-assessment (each → the test that proves it)

| # | Acceptance criterion | Proven by |
|---|---|---|
| 1 | A `producer` agent definition exists (Opus) describing its role per CLAUDE.md | `producer-agent.test.ts` — asserts the file exists, `model: opus`, `name: producer`, and that it mentions Production Spec / Magnific / Cast / "never publish" |
| 2 | Running the Producer on an accepted Idea writes `ideas/<run>/idea-NN.spec.json` that passes validation | `compose.test.ts` "happy path" — `composeSpec(acceptedBrief)` writes the file at `specPathFor(...)`; the written file is re-parsed and asserted `validate(...).ok === true` |
| 3 | `validate()` accepts a well-formed Spec and rejects, with specific reasons: ≠3 concepts, ≠3 clips, `post_copy` >180, `post_copy` 0/>3 emojis, missing thumbnails, nested `post_copy`/`thumbnails` | `validate.test.ts` — one test per case: valid; `character_concepts_count` (4); `clips_count` (2); `post_copy_length` (>180); `post_copy_emoji_count` (0 and 4); `thumbnails_missing`; `post_copy_not_top_level` (nested); `thumbnails_not_top_level` (nested) |
| 4 | A generated Spec containing a banned word is rejected — banned words never survive into a saved Spec | `compose.test.ts` "brand-safety gate" — a Brief carrying "miracle" yields `written: false`, `reason: "brand-safety"`, and **no file** on disk. Backed by `brand-safety.test.ts` (whole-field scan, case-insensitive, every text field) |
| 5 | The contract is sourced without depending on the truncated canvas system-prompt node (path documented) | Documented in `contract.ts` header + `proposal.md` + the spec Requirement "Production Spec contract is sourced without the truncated canvas node". No code path reads a canvas node or does a live WebFetch (enforced by hermetic tests — no network) |
| 6 | Validator unit tests cover the valid case and each broken case, against fixtures | `validate.test.ts` against `fixtures/specs.ts` (valid + 8 broken variants) |

### Fakes / fixtures used

- **No Magnific fake was needed.** Like Slice 1, this slice has **no Space interaction** — it composes
  and validates JSON and writes a file. No `spaces_*` / `creations_*` calls, no credits, no board
  mutation, no MCP boundary modelled. (The `magnific` MCP tools are present in the environment but were
  **not** used — the build is hermetic by construction.)
- **No live network.** No WebFetch in tests; the contract is in-code per Spike 3.
- **Fixtures:** `fixtures/specs.ts` (valid Spec + broken variants), `fixtures/brand-profile.banned.yaml`
  (a fixture profile with non-empty `banned_words`, because the real `data/brand-profile.yaml` has
  `banned_words: []`). All file-writing tests use OS temp dirs (`mkdtemp`), so the real `ideas/` tree is
  never touched (verified: no stray `*.spec.json` under `ideas/`).

### Self-review notes

- Simplified `buildPostCopy` in `generate.ts`: removed a convoluted `.slice(...) === ""` empty-check and
  a UTF-16 `.slice` that could split an emoji; truncation now slices the title by code point and appends
  a fixed emoji tail. Added a regression test (over-long, emoji-less title → contract-valid `post_copy`).
- Validator distinguishes "missing top-level" from "nested in a clip" so the error reason is specific
  (`post_copy_not_top_level` / `thumbnails_not_top_level` vs `*_missing`).
- Emoji counting uses `Intl.Segmenter` + `\p{Extended_Pictographic}` so a variation-selector/ZWJ emoji
  (e.g. `☀️`) counts once. The same logic is shared in spirit by `validate.ts` and `generate.ts`.
- Confirmed every acceptance criterion maps to a concrete test (table above); no dead code; deep modules
  are pure (no I/O), I/O isolated to `brand-profile.ts` / `store.ts`, orchestration isolated to
  `compose.ts`.

### Always-rules upheld (in behavior)

- **Generate-never-publish:** the slice only writes a JSON Spec file; nothing is posted, no Channel
  touched. The agent definition restates the boundary.
- **Brand-safety hard filter:** `composeSpec` refuses to write a Spec with a banned word (proven by a
  test asserting no file on disk).
- **Ledger-as-source-of-truth:** the Spec is a derived sibling of an accepted Brief; the slice reads
  state, never invents Idea status. (Wiring the producer to drain the ledger/queue is a later slice.)

### Known limits / deferred

- **Deterministic generator, not model-drafted.** `generate()` builds a contract-conformant Spec from a
  template so the build is hermetic and "generated Spec passes validation" is provable without an LLM.
  The eventual Producer may have a model draft the creative prompt text; the validator is the contract's
  guardian either way, so a future model-drafted Spec passes through the same gate.
- **No Space integration.** Injecting the Spec into the `JSON master` node, running cast/clips, and the
  Execution Protocol / Fallback Protocol are out of scope for this slice (later capabilities:
  `execution-protocol`, `cast-render`).
- **No ledger/queue wiring.** This slice does not yet hook `composeSpec` into the auto-enqueue worker or
  transition the ledger (`accepted → casting`); it provides the deep modules a later worker slice calls.
- **Brand-safety is whole-word, case-insensitive substring on word boundaries.** Banned *phrases* with
  spaces match on a boundary; this is intentionally conservative (won't flag "cure" inside "secure").
- **Contract is in-code (Spike-3 path).** The published-Google-Doc WebFetch path is documented but not
  implemented; add it only if the in-code summary proves insufficient (and keep tests hermetic).

---

## QA Verdict — Round 1: PASS

**Verifier:** qa (the only non-human gate). Read, ran, and reported only — no product code, tests,
specs, or the OpenSpec change were edited. The sole write is this appended Verdict block.

### Suite result — actually green

All three commands were run from the repo root and observed green (real output, not the Build Report's
claim):

| Command | Result |
|---|---|
| `npm install` | clean (0 vulnerabilities) |
| `npm test` (= `tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"`) | **tests 65 · pass 65 · fail 0 · skipped 0 · todo 0** — `tsc --noEmit` type-check clean |
| `npm run build` (= `tsc -p tsconfig.build.json`) | exit **0** |
| `npx openspec validate issue-3-producer-production-spec --strict` | `Change 'issue-3-producer-production-spec' is valid` — exit **0** |

Test breakdown confirmed by `it(` count: 41 new tests across the 6 `src/production-spec/*.test.ts`
files (validate 11, brand-safety 11, generate 9, compose 4, store 3, producer-agent 3); the remaining 24
are Slice-1 tests, still green. Matches the developer's "41 new / 65 total" claim.

### Per-criterion results (issue #3 acceptance criteria — verbatim)

| # | Acceptance criterion | Result | Proven by (verified to actually exercise it) |
|---|---|---|---|
| 1 | A `producer` agent definition exists (Opus) describing its role per CLAUDE.md | **PASS** | `producer-agent.test.ts` — reads `.claude/agents/producer.md`, asserts `^model:\s*opus$`, `^name:\s*producer$`, and that the body mentions `Production Spec`, `Magnific`, `Cast`, and `/never publish/i`. The file itself (verified) describes drive-the-Space, the three gates, generate-never-publish, and narrows this slice to compose-the-Spec — faithful to CLAUDE.md / CONTEXT.md. |
| 2 | Running the Producer on an accepted Idea writes `ideas/<run>/idea-NN.spec.json` that passes validation | **PASS** | `compose.test.ts` "happy path" — `composeSpec(acceptedBrief, {ideasRoot: tmp})` returns `written:true` at `specPathFor(id, run, tmp)`; the file is re-read, `JSON.parse`d, and `validate(parsed).ok === true` asserted. Path shape proven separately by `store.test.ts` "derives ideas/<run>/idea-NN.spec.json". |
| 3 | `validate()` accepts well-formed + rejects with specific reasons (≠3 concepts, ≠3 clips, post_copy >180, 0/>3 emojis, missing thumbnails, nested post_copy/thumbnails) | **PASS** | `validate.test.ts` — each broken case asserts a SPECIFIC error `code`, not just `ok:false`: `character_concepts_count` (4), `clips_count` (2), `post_copy_length` (181 chars + 1 emoji, so length is isolated), `post_copy_emoji_count` (0 and, separately, 4), `thumbnails_missing`, `post_copy_not_top_level` (nested), `thumbnails_not_top_level` (nested). Valid case → `ok:true, errors:[]`. |
| 4 | A generated Spec containing a `brand-profile.yaml` banned word is rejected — banned words never survive into a saved Spec | **PASS** | `compose.test.ts` "brand-safety gate" — a Brief carrying "miracle" against `fixtures/brand-profile.banned.yaml` → `written:false`, `reason:"brand-safety"`, hit `word:"miracle"`, and `exists(path) === false` (asserts NO file on disk). Reinforced by `brand-safety.test.ts`: case-insensitive, whole-word (won't flag "cure" in "secure"), scans concepts/clips/post_copy/thumbnails. |
| 5 | Contract sourced without the truncated canvas system-prompt node (chosen path documented) | **PASS** | Verified by static read: `contract.ts` encodes the contract in-code; its header documents the Spike-3 decision and names the deferred Google-Doc/WebFetch alternative. Grep over `src/production-spec/` found **no** `spaces_*` / `creations_*` / `WebFetch` / `fetch(` / `http(s)://` call sites (only documentary comments + the agent-description assertion). The spec Requirement "Production Spec contract is sourced without the truncated canvas node" + `proposal.md` + the agent def all state the path. |
| 6 | Validator unit tests cover the valid case and each broken case, against fixtures | **PASS** | `validate.test.ts` consumes `fixtures/specs.ts` (`validSpec()` + 8 broken variants derived by focused single-mutation `structuredClone`). One assertion per contract rule; all green. |

### Per-scenario results (spec deltas in `specs/production-spec/spec.md`)

Every Requirement Scenario traces back to issue #3 and the always-rules; each is covered by a passing
test:

| Requirement → Scenario | Result | Covering test |
|---|---|---|
| Contract sourced without truncated canvas node → Contract enforcement does not read the canvas system-prompt node | **PASS** | Grep (no `spaces_*`/WebFetch/network in `src/production-spec/`) + `contract.ts` is the only contract source; hermetic suite proves no live call. |
| Production Spec validation → A well-formed Spec is accepted | **PASS** | `validate.test.ts` "accepts a valid Spec with no errors" |
| → Wrong number of character_concepts is rejected | **PASS** | "rejects a Spec with 4 character_concepts" (`character_concepts_count`) |
| → Wrong number of clips is rejected | **PASS** | "rejects a Spec with 2 clips" (`clips_count`) |
| → Over-long post_copy is rejected | **PASS** | "rejects a Spec whose post_copy exceeds 180 chars" (`post_copy_length`) |
| → Wrong emoji count in post_copy is rejected (0 and 4) | **PASS** | "rejects … 0 emojis" + "rejects … 4 emojis" (`post_copy_emoji_count`) |
| → Missing thumbnails is rejected | **PASS** | "rejects a Spec with no thumbnails field" (`thumbnails_missing`) |
| → Nested post_copy or thumbnails is rejected | **PASS** | "post_copy nested inside a clip" + "thumbnails nested inside a clip" (`*_not_top_level`) |
| Brand-safety hard filter → A Spec containing a banned word is rejected (and not written) | **PASS** | `compose.test.ts` "brand-safety gate" + `brand-safety.test.ts` "rejects … post_copy … banned word and names the word" |
| → A clean Spec passes the brand-safety filter | **PASS** | `brand-safety.test.ts` "passes a clean Spec"; empty-list pass via "passes any Spec when no banned words are configured" + `compose.test.ts` "empty banned list" |
| Compose and persist beside the Brief → Composing an accepted Idea writes a valid Spec beside the Brief | **PASS** | `compose.test.ts` "happy path" (path = `ideas/<run>/idea-NN.spec.json`; written Spec re-validated) |
| → A failing Spec is refused, not written | **PASS** | `compose.test.ts` "validation gate" (injected 2-clip generator → `written:false`, no file) + "brand-safety gate" |
| Producer agent definition → The producer agent definition exists and is Opus | **PASS** | `producer-agent.test.ts` (all 3 cases) |

No scenario is self-consistent-but-wrong: each rule (counts, ≤180 chars, 1–3 emojis, top-level
post_copy/thumbnails, 3 thumbnails) was cross-checked against CONTEXT.md "Production Spec" (lines 60–64)
and PRD #1's contract block, and matches exactly. No new product vocabulary was coined — `Production
Spec`, `Cast`, `Character`, `Asset`, `Brief` are all used per CONTEXT.md. The capability id
`production-spec` is correctly scoped (compose + validate + brand-safety + persist; no Space interaction,
matching the issue's "saved beside it" framing).

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| **No live Magnific (hermetic)** | **PASS** | `grep -rniE "spaces_\|creations_\|WebFetch\|fetch(\|http(s)://\|magnific\|mcp\|library_\|images_generate\|video_generate" src/production-spec/` returned **only** documentary comments and the `producer-agent.test.ts` `/Magnific/` description assertion — **no call sites**. Developer's "no Magnific fake needed" claim is verified true: the code path composes/validates JSON and writes one file. No credits, no board mutation, no MCP boundary. |
| **No live network in tests** | **PASS** | Same grep: no `fetch(`, no `http(s)://`, no `WebFetch` outside doc comments. Contract is in-code per Spike 3. |
| **Generate-never-publish** (ADR-0002) | **PASS** | The only output is a `.spec.json` file via `saveSpec`. Nothing posts to a Channel; the agent def restates the boundary. |
| **Ledger-as-source-of-truth** | **PASS (not regressed)** | This slice neither reads nor writes `data/ledger.json`/`queue.json`; the Spec is a derived sibling of an accepted Brief. Wiring the producer to transition the ledger is correctly deferred to a later slice (no false claim of ledger writes). |
| **Public-metrics-only** | **N/A** | No metrics path in this compose+validate slice. |
| **Relative-not-absolute** | **N/A** | No scoring/comparison in this slice. |
| **Explicit-attribution** | **N/A** | No Post/Idea linking in this slice (that is `/log-post`, a later concern). |
| **File-writing tests stay off the real tree** | **PASS** | `store.test.ts` / `compose.test.ts` use `mkdtemp(tmpdir(), …)` and `rm(..., {recursive})` in `finally`. After the full run, `find ideas -name "*.spec.json"` is empty and `git status` shows no modification to `ideas/` or `data/` (only the slice's own new files + the declared `package.json`/`package-lock.json` change). |

### Defect list

None. No critical / high / medium / low defects. The slice is hermetic, every acceptance criterion is
proven by a test that actually exercises it, every spec Scenario traces back to the issue and matches
CONTEXT.md / PRD #1, and no always-rule is violated.

**Verdict: PASS — Round 1.** Cleared to proceed to branch + PR (with OpenSpec archive riding inside it),
pending Operator merge approval.
