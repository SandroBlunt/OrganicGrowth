## 1. Spec delta (before any code)

- [x] 1.1 Write the spec delta under `openspec/changes/issue-23-readiness-classifier/specs/readiness-classifier/spec.md`
  — ADDED requirements for the `readiness-classifier` capability: `Finding` type shape, `classify`
  signature, phase-scoped gating policy, `checkConfig` signature, healthy-config case, advisory-only
  findings, deterministic ordering, and pure isolation guarantee.
- [x] 1.2 Run `npx openspec validate issue-23-readiness-classifier --strict` (or validate structurally
  against archived examples if CLI unavailable) and confirm the spec is well-formed.

## 2. Failing tests (test-first)

- [x] 2.1 Write `src/readiness/classify.test.ts` with failing tests covering all 6 ACs:
  - AC1: `classify` returns `Finding[]` with severity and phase fields.
  - AC2a: Bad Apify token → `block` on `research`.
  - AC2b: No valid seed → `block` on `research`.
  - AC2c: Inaccessible Space → `advisory` on `research` + `block` on `production`.
  - AC2d: Credits insufficient → `advisory` on `research` + `block` on `production`.
  - AC2e: Missing Channel URL → `block` on `publish` (not research, not production).
  - AC3a: Off-niche seed → `advisory` only (no block).
  - AC3b: Empty banned-words → `advisory` only (no block).
  - AC3c: Null baseline → `advisory` only (no block).
  - AC5: Findings are ordered deterministically (same inputs → same output, same order).
  - AC6: No live Magnific/Apify calls (results are fed in as inputs).
- [x] 2.2 Write `src/readiness/check-config.test.ts` with failing tests covering AC4 and AC5:
  - AC4a: TODO placeholder in niche/voice → advisory finding.
  - AC4b: Niche unset → advisory finding.
  - AC4c: Voice unset → advisory finding.
  - AC4d: Fewer than 1 seed → block finding on research.
  - AC4e: Off-niche-seed flag → advisory finding.
  - AC4f: Missing Channel URL → block finding on publish.
  - AC4g: Empty banned-words → advisory finding.
  - AC4h: Healthy config → no findings.
  - AC5: Findings from `checkConfig` are deterministically ordered.

## 3. Implement the modules

- [x] 3.1 Create `src/readiness/types.ts` with `Finding`, `FindingSeverity`, `FindingPhase`, and
  `ReadinessInputs` types.
- [x] 3.2 Create `src/readiness/classify.ts` implementing `classify(inputs): Finding[]`.
- [x] 3.3 Create `src/readiness/check-config.ts` implementing `checkConfig(brandProfile, seeds): Finding[]`.
- [x] 3.4 Confirm all tests from steps 2.1 and 2.2 now pass (full suite green).

## 4. Self-review

- [x] 4.1 `npx openspec validate issue-23-readiness-classifier --strict` green (or structural check).
- [x] 4.2 `npm test` green (all prior tests + new tests).
- [x] 4.3 `npm run build` clean (no TypeScript errors).
- [x] 4.4 Simplify / dead-code pass: each AC maps to named test(s); no dead branches; module
  boundaries are clean.
- [x] 4.5 Write the Build Report into `handoff.md`.
