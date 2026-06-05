## 1. `producer` agent definition

- [x] 1.1 Add `.claude/agents/producer.md` (model `opus`) describing the content Producer's role per
  CLAUDE.md / CONTEXT.md: drives a Magnific Space, generates a Production Spec, runs cast, pauses at the
  Cast gate, renders the Asset after the Operator picks the Character; **generates, never publishes**.
  Narrow this slice's job to: turn an accepted Brief into a strict Production Spec saved beside it.

## 2. Contract source (no truncated canvas node)

- [x] 2.1 Encode the Production Spec contract as a compact, documented schema/style summary in
  `src/production-spec/contract.ts` (constants + types). Header comment documents the Spike-3 decision:
  the contract is **not** read from the truncated canvas system-prompt node.

## 3. Validator deep module (test-first, pure)

- [x] 3.1 Add fixtures: a valid Spec, plus deliberately-broken variants (4 concepts, 2 clips,
  `post_copy` >180 chars, `post_copy` with 0 emojis, `post_copy` with 4 emojis, missing `thumbnails`,
  `post_copy` nested in a clip, `thumbnails` nested in a clip).
- [x] 3.2 Write failing tests: `validate()` accepts the valid Spec and rejects each broken variant with
  a specific, identifiable error reason.
- [x] 3.3 Implement the pure `validate(spec) → { ok, errors }` deep module to pass the tests.

## 4. Brand-safety filter (test-first, pure)

- [x] 4.1 Add a fixture `brand-profile.yaml` that **defines banned words** (the real profile's list is
  empty), and a Spec containing one of them.
- [x] 4.2 Write failing tests: a Spec with a banned word is rejected (case-insensitive, whole-field
  scan across concepts, clips, copy, thumbnails); a clean Spec passes.
- [x] 4.3 Implement the pure brand-safety scanner + a defensive YAML reader for `brand-profile.yaml`
  (using the `yaml` package; missing/empty list → no banned words).

## 5. Composer + persistence (test-first)

- [x] 5.1 Write a failing test: `generate(brief, contract, profile)` produces a Spec that passes
  `validate()` and the brand-safety filter.
- [x] 5.2 Implement the pure deterministic `generate()` deep module.
- [x] 5.3 Write failing tests (against a temp dir): `composeSpec` writes
  `ideas/<run>/idea-NN.spec.json`, the written file passes `validate()`, and a Spec that fails
  validation or brand-safety is **refused** (not written).
- [x] 5.4 Implement the store (write JSON beside the Brief) + the thin `composeSpec` orchestration shell
  (generate → validate → brand-safety → persist).

## 6. Dependency + wiring

- [x] 6.1 Promote `yaml` to a declared `dependencies` entry in `package.json`.

## 7. Self-review

- [x] 7.1 `openspec validate issue-3-producer-production-spec --strict` green.
- [x] 7.2 `npm test` green; `npm run build` green.
- [x] 7.3 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific test.
- [x] 7.4 Write the Build Report into `handoff.md`.
