/**
 * Golden-file tests, one per legacy shape this ticket names explicitly (issue #204 AC4) — MundoTip's
 * pre-Format Idea shape, Straw Motion's three Idea shapes, all three ID schemes, and all four folder
 * layouts.
 *
 * Each test below points at ONE REAL record identified by its real id (never a synthetic copy) and
 * asserts the specific shape-defining fact about it, so a reviewer can audit "yes, this shape is really
 * covered" without re-deriving evidence from a single aggregate pass/fail. The real-data structural
 * smoke test in `plan.test.ts` proves the WHOLE import succeeds; this file proves WHICH real records
 * are responsible for proving which named shape.
 *
 * `data/brands/mundotip/ledger.json` and `data/brands/straw-motion/ledger.json` are read READ-ONLY here
 * (never written to) — mirrors `src/ledger/migrate-assets.test.ts`'s own "round-trip against the REAL
 * ledgers" pattern.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadFullIdeas } from "../ledger/ledger.ts";
import { loadBrief } from "./load-brief.ts";
import { resolveIdeaStatus } from "./idea-status.ts";

const MUNDOTIP_LEDGER = "data/brands/mundotip/ledger.json";
const STRAW_MOTION_LEDGER = "data/brands/straw-motion/ledger.json";

async function findIdea(ledgerPath: string, brand: string, id: string) {
  const ideas = await loadFullIdeas(ledgerPath, brand);
  const idea = ideas.find((i) => i.id === id);
  assert.ok(idea, `expected to find real Idea "${id}" in ${ledgerPath}`);
  return idea!;
}

describe("golden shape: MundoTip's pre-Format Idea (no format field at all)", () => {
  it("idea-2026-W22-01 carries no format, and its Brief resolves via the legacy-flat reconstruction (no brief_path either)", async () => {
    const idea = await findIdea(MUNDOTIP_LEDGER, "mundotip", "idea-2026-W22-01");
    assert.equal(idea.format, undefined);
    assert.equal(idea.briefPath, undefined);
    const brief = await loadBrief({ id: idea.id, run: idea.run! }, "mundotip");
    assert.equal(brief.ok, true);
  });
});

describe("golden shape: Straw Motion's three ID schemes", () => {
  it("scheme 1 — bare idea-NN (idea-01, from the legacy 2026-W29 run)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-01");
    assert.equal(idea.run, "2026-W29");
  });

  it("scheme 2 — ISO-week-embedded idea-<week>-NN (idea-2026-W30-01)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-W30-01");
    assert.equal(idea.run, "2026-W30");
  });

  it("scheme 3 — calendar-date-embedded idea-<date>-NN (idea-2026-08-11-01)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-08-11-01");
    assert.equal(idea.run, "2026-08-11");
  });
});

describe("golden shape: Straw Motion's three Idea shapes", () => {
  it("shape 1 — canonical, no Assets yet (idea-2026-W32-02, rejected before any Recipe ran)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-W32-02");
    assert.equal(idea.status, "rejected");
    assert.equal(idea.assets.length, 0);
    assert.notEqual(idea.rejectionReason, undefined);
  });

  it("shape 2 — canonical, Assets populated, top-level status already canonical (idea-2026-W30-01, accepted)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-W30-01");
    assert.equal(idea.status, "accepted");
    assert.equal(idea.assets.length, 2);
  });

  it("shape 3 — Assets already populated but a STALE legacy top-level status (idea-2026-08-11-12, raw status 'produced')", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-08-11-12");
    // normalizeIdeaStatus passes the raw, non-canonical status through unchanged once assets already
    // exist — this is exactly the shape resolveIdeaStatus exists to coerce.
    assert.notEqual(idea.status, "accepted");
    assert.notEqual(idea.status, "suggested");
    assert.notEqual(idea.status, "rejected");
    assert.equal(idea.assets.length, 2);
    assert.equal(resolveIdeaStatus(idea.status, idea.assets.length), "accepted");
  });
});

describe("golden shape: all four real folder layouts, each proven by reading a real file", () => {
  it("layout 1 — legacy flat, no Format namespace: ideas/<run>/idea-NN.md (2026-W29)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-01");
    assert.match(idea.briefPath!, /^data\/brands\/straw-motion\/ideas\/2026-W29\/idea-01\.md$/);
    const brief = await loadBrief({ id: idea.id, run: idea.run!, briefPath: idea.briefPath! }, "straw-motion");
    assert.equal(brief.ok, true);
  });

  it("layout 2 — Format-namespaced flat weekly: ideas/<format>/<run>/idea-NN.md (unhypped-news/2026-W30)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-W30-01");
    assert.match(idea.briefPath!, /^data\/brands\/straw-motion\/ideas\/unhypped-news\/2026-W30\/idea-01\.md$/);
    const brief = await loadBrief({ id: idea.id, run: idea.run!, briefPath: idea.briefPath! }, "straw-motion");
    assert.equal(brief.ok, true);
  });

  it("layout 3 — Format-namespaced flat daily (pre-ADR-0023): ideas/<format>/<date>/idea-NN.md (unhypped-daily/2026-08-11)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-08-11-01");
    assert.match(idea.briefPath!, /^data\/brands\/straw-motion\/ideas\/unhypped-daily\/2026-08-11\/idea-01\.md$/);
    const brief = await loadBrief({ id: idea.id, run: idea.run!, briefPath: idea.briefPath! }, "straw-motion");
    assert.equal(brief.ok, true);
  });

  it("layout 4 — nested-daily (ADR-0023): ideas/<format>/<ISO-week>/<weekday-DD-month>/idea-NN.md (unhypped-daily/2026-W33/friday-14-august)", async () => {
    const idea = await findIdea(STRAW_MOTION_LEDGER, "straw-motion", "idea-2026-08-14-01");
    // Note: idea.run is the FLAT date "2026-08-14" (the Run id stays opaque, ADR-0022) even though the
    // Brief physically lives under the nested ISO-week/weekday folder — brief_path is the ledger's own
    // verbatim record of where it actually is, trusted exclusively.
    assert.equal(idea.run, "2026-08-14");
    assert.match(idea.briefPath!, /^data\/brands\/straw-motion\/ideas\/unhypped-daily\/2026-W33\/friday-14-august\/idea-01\.md$/);
    const brief = await loadBrief({ id: idea.id, run: idea.run!, briefPath: idea.briefPath! }, "straw-motion");
    assert.equal(brief.ok, true);
  });
});
