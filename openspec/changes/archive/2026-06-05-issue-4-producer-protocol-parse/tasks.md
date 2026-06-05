## 1. Canonical Execution Protocol artifact (in code)

- [x] 1.1 Add `src/execution-protocol/protocol.ts`: run-point + document types, `Producer Protocol`
  node name, the read-API truncation cap (~1,900) + a tighter size budget, `canonicalProtocol()` (two
  ordered run-points: cast "Character Variants Generator" downstream → Cast gate; clip "Clip extractor"
  downstream → no gate) and `serializeProtocol()`. Header documents the by-name (ADR-0003) and
  truncation (Spike 3) decisions. Node names come from `docs/producer-spikes-results.md`.

## 2. Magnific FAKE fixture (no live Space)

- [x] 2.1 Add `src/execution-protocol/fixtures/space-state.ts`: a synthetic `spaces_state` with the
  `Producer Protocol` node (canonical protocol), uniquely-named run-point targets, and DUPLICATE-named
  nodes elsewhere (two "Character #2"). Plus broken variants: duplicate-named run-point, missing-named
  run-point, no-protocol-node. Flagged in-file as the Magnific fake (hermetic).

## 3. Parser deep module (test-first, pure)

- [x] 3.1 Write failing tests (`parse.test.ts`): correct resolution of cast + clip run-points to the
  right node IDs; Cast-gate parsing; by-name (not by-ID) resolution under a re-id'd state;
  duplicate-name rejection (clear error naming the node); unresolved-name rejection (distinct code);
  missing/empty/non-JSON/wrong-shape protocol failures; invalid mode/gate/missing-`start` field
  validation; every error carries a code + non-empty message.
- [x] 3.2 Implement the pure `parse(spaceState) → ParseResult` deep module to pass the tests — by-name
  resolution + unique-name guard, no hard-coded run-point IDs, `{ code, message }` failures.

## 4. Protocol artifact tests (round-trip under the read cap)

- [x] 4.1 Write tests (`protocol.test.ts`): ordered run-points + marked Cast gate; both downstream;
  references by name only (no node IDs in JSON); serialized size comfortably under the read-API cap
  (round-trip-without-truncation proven hermetically by a size assertion).

## 5. Self-review

- [x] 5.1 `openspec validate issue-4-producer-protocol-parse --strict` green.
- [x] 5.2 `npm test` green; `npm run build` green.
- [x] 5.3 Simplify / dead-code pass; confirm each acceptance criterion maps to a specific test.
- [x] 5.4 Write the Build Report into `handoff.md`.
