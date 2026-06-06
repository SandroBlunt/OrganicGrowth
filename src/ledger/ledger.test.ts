import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ledgerStatusForTransition,
  applyIdeaStatus,
  writeIdeaStatus,
  applyIdeaCast,
  writeIdeaCast,
  applyIdeaAsset,
  writeIdeaAsset,
  loadIdeas,
  type LedgerIdea,
  type LedgerIdeaWithCast,
  type LedgerCastCandidate,
  type LedgerIdeaWithAsset,
  type LedgerAsset,
} from "./ledger.ts";
import type { QueueJob } from "../production-queue/queue.ts";

function job(over: Partial<QueueJob> & Pick<QueueJob, "idea_id">): QueueJob {
  return {
    brand: "test-brand",
    phase: "cast",
    status: "queued",
    enqueued_at: "2026-06-05T10:00:00.000Z",
    ...over,
  };
}

describe("ledgerStatusForTransition — queue→ledger reflection points", () => {
  it("maps a cast job reaching its gate to ledger casting", () => {
    const result = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "awaiting_cast");
    assert.equal(result, "casting");
  });

  it("maps a render job completing to ledger produced", () => {
    const result = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "done");
    assert.equal(result, "produced");
  });

  it("implies no ledger change when a job enters running", () => {
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "running"), null);
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "running"), null);
  });

  it("implies no ledger change when any job fails", () => {
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "failed"), null);
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "failed"), null);
  });

  it("implies no ledger change for a cast job that completes (done) — only render→done means produced", () => {
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "done"), null);
  });

  it("implies no ledger change for a render job reaching awaiting_cast (render never gates)", () => {
    assert.equal(ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "awaiting_cast"), null);
  });
});

describe("applyIdeaStatus — pure status set", () => {
  const ideas: LedgerIdea[] = [
    { id: "idea-A", status: "accepted" },
    { id: "idea-B", status: "accepted" },
  ];

  it("sets the target Idea's status and leaves others unchanged", () => {
    const after = applyIdeaStatus(ideas, "idea-A", "casting");
    assert.equal(after.find((i) => i.id === "idea-A")!.status, "casting");
    assert.equal(after.find((i) => i.id === "idea-B")!.status, "accepted");
  });

  it("is pure: it never mutates the input array or its records", () => {
    const snapshot = JSON.stringify(ideas);
    applyIdeaStatus(ideas, "idea-A", "casting");
    assert.equal(JSON.stringify(ideas), snapshot);
  });

  it("returns the array unchanged for an unknown Idea", () => {
    const after = applyIdeaStatus(ideas, "idea-ZZZ", "casting");
    assert.deepEqual(after, ideas);
  });
});

describe("writeIdeaStatus — thin shell keeps the ledger in step", () => {
  async function withLedger(fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-"));
    const path = join(dir, "ledger.json");
    try {
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("applies the casting status implied by a cast job reaching its gate, touching only that Idea", async () => {
    await withLedger(async (path) => {
      const seed = {
        baseline: { note: "seed" },
        ideas: [
          { id: "idea-A", run: "2026-W22", status: "accepted", title: "A", post_url: null },
          { id: "idea-B", run: "2026-W22", status: "accepted", title: "B", post_url: null },
        ],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      const status = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "awaiting_cast");
      assert.equal(status, "casting");
      await writeIdeaStatus("idea-A", status!, { ledgerPath: path });

      const after = JSON.parse(await readFile(path, "utf8")) as typeof seed;
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      const b = after.ideas.find((i) => i.id === "idea-B")!;
      assert.equal(a.status, "casting");
      assert.equal(b.status, "accepted");
      // unrelated fields preserved
      assert.equal(a.title, "A");
      assert.equal(after.baseline.note, "seed");
    });
  });

  it("applies the produced status implied by a render job completing", async () => {
    await withLedger(async (path) => {
      const seed = {
        ideas: [{ id: "idea-A", run: "2026-W22", status: "casting", title: "A" }],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      const status = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "done");
      assert.equal(status, "produced");
      await writeIdeaStatus("idea-A", status!, { ledgerPath: path });

      const ideas = await loadIdeas(path);
      assert.equal(ideas.find((i) => i.id === "idea-A")!.status, "produced");
    });
  });
});

describe("applyIdeaCast — pure cast set", () => {
  const ideas: LedgerIdeaWithCast[] = [
    { id: "idea-A", status: "accepted" },
    { id: "idea-B", status: "accepted" },
  ];
  const cast: LedgerCastCandidate[] = [
    { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
    { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
  ];

  it("sets the target Idea's cast field and leaves others unchanged", () => {
    const after = applyIdeaCast(ideas, "idea-A", cast);
    assert.deepEqual(after.find((i) => i.id === "idea-A")!.cast, cast);
    assert.equal(after.find((i) => i.id === "idea-B")!.cast, undefined);
  });

  it("is pure: it never mutates the input array or its records", () => {
    const snapshot = JSON.stringify(ideas);
    applyIdeaCast(ideas, "idea-A", cast);
    assert.equal(JSON.stringify(ideas), snapshot);
  });

  it("returns the array unchanged for an unknown Idea", () => {
    const after = applyIdeaCast(ideas, "idea-ZZZ", cast);
    assert.deepEqual(after, ideas);
  });
});

describe("writeIdeaCast — records the Cast candidates on the Idea record (ADR-0003)", () => {
  async function withLedger(fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-cast-"));
    const path = join(dir, "ledger.json");
    try {
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const cast: LedgerCastCandidate[] = [
    { identifier: "cast-1", url: "https://magnific.example/cast/1.png" },
    { identifier: "cast-2", url: "https://magnific.example/cast/2.png" },
  ];

  it("writes the cast field for the target Idea, preserving unrelated fields", async () => {
    await withLedger(async (path) => {
      const seed = {
        baseline: { note: "seed" },
        ideas: [
          { id: "idea-A", run: "2026-W22", status: "casting", title: "A", post_url: null },
          { id: "idea-B", run: "2026-W22", status: "accepted", title: "B", post_url: null },
        ],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      await writeIdeaCast("idea-A", cast, { ledgerPath: path });

      const after = JSON.parse(await readFile(path, "utf8")) as {
        baseline: { note: string };
        ideas: Array<{ id: string; title: string; cast?: LedgerCastCandidate[] }>;
      };
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      const b = after.ideas.find((i) => i.id === "idea-B")!;
      assert.deepEqual(a.cast, cast);
      assert.equal(b.cast, undefined);
      // unrelated fields preserved
      assert.equal(a.title, "A");
      assert.equal(after.baseline.note, "seed");
    });
  });

  it("records BOTH casting status and the Cast for an Idea moving accepted → casting", async () => {
    await withLedger(async (path) => {
      const seed = {
        ideas: [{ id: "idea-A", run: "2026-W22", status: "accepted", title: "A" }],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      // Phase A completes: the cast job reaches its gate ⇒ casting, and the Cast candidates are recorded.
      const status = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "cast" }), "awaiting_cast");
      assert.equal(status, "casting");
      await writeIdeaStatus("idea-A", status!, { ledgerPath: path });
      await writeIdeaCast("idea-A", cast, { ledgerPath: path });

      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; status: string; cast?: LedgerCastCandidate[] }>;
      };
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      assert.equal(a.status, "casting");
      assert.deepEqual(a.cast, cast);
    });
  });

  it("leaves the ledger untouched for an unknown Idea", async () => {
    await withLedger(async (path) => {
      const seed = { ideas: [{ id: "idea-A", status: "accepted" }] };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await writeIdeaCast("idea-ZZZ", cast, { ledgerPath: path });
      const ideas = await loadIdeas(path);
      assert.equal(ideas.find((i) => i.id === "idea-A")!.status, "accepted");
      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; cast?: unknown }>;
      };
      assert.equal(after.ideas[0]!.cast, undefined);
    });
  });
});

// === Phase B: the Asset fields (character / asset_url / produced_at) =================================

describe("applyIdeaAsset — pure Asset-field set", () => {
  const ideas: LedgerIdeaWithAsset[] = [
    { id: "idea-A", status: "casting" },
    { id: "idea-B", status: "casting" },
  ];
  const asset: LedgerAsset = {
    character: "cast-3",
    asset_url: "https://magnific.example/asset/1.mp4",
    produced_at: "2026-06-05T12:00:00.000Z",
  };

  it("sets the target Idea's Asset fields and leaves others unchanged", () => {
    const after = applyIdeaAsset(ideas, "idea-A", asset);
    const a = after.find((i) => i.id === "idea-A")!;
    assert.equal(a.character, "cast-3");
    assert.equal(a.asset_url, "https://magnific.example/asset/1.mp4");
    assert.equal(a.produced_at, "2026-06-05T12:00:00.000Z");
    const b = after.find((i) => i.id === "idea-B")!;
    assert.equal(b.character, undefined);
    assert.equal(b.asset_url, undefined);
    assert.equal(b.produced_at, undefined);
  });

  it("is pure: it never mutates the input array or its records", () => {
    const snapshot = JSON.stringify(ideas);
    applyIdeaAsset(ideas, "idea-A", asset);
    assert.equal(JSON.stringify(ideas), snapshot);
  });

  it("returns the array unchanged for an unknown Idea", () => {
    const after = applyIdeaAsset(ideas, "idea-ZZZ", asset);
    assert.deepEqual(after, ideas);
  });
});

describe("writeIdeaAsset — records the Asset fields on the Idea record (ADR-0003 Phase B)", () => {
  async function withLedger(fn: (path: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "og-ledger-asset-"));
    const path = join(dir, "ledger.json");
    try {
      await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const asset: LedgerAsset = {
    character: "cast-3",
    asset_url: "https://magnific.example/asset/1.mp4",
    produced_at: "2026-06-05T12:00:00.000Z",
  };

  it("writes character / asset_url / produced_at for the target Idea, preserving unrelated fields", async () => {
    await withLedger(async (path) => {
      const seed = {
        baseline: { note: "seed" },
        ideas: [
          { id: "idea-A", run: "2026-W22", status: "casting", title: "A", post_url: null, cast: [{ identifier: "cast-3", url: "u" }] },
          { id: "idea-B", run: "2026-W22", status: "accepted", title: "B", post_url: null },
        ],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      await writeIdeaAsset("idea-A", asset, { ledgerPath: path });

      const after = JSON.parse(await readFile(path, "utf8")) as {
        baseline: { note: string };
        ideas: Array<{
          id: string;
          title: string;
          post_url: string | null;
          cast?: unknown;
          character?: string;
          asset_url?: string;
          produced_at?: string;
        }>;
      };
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      const b = after.ideas.find((i) => i.id === "idea-B")!;
      assert.equal(a.character, "cast-3");
      assert.equal(a.asset_url, "https://magnific.example/asset/1.mp4");
      assert.equal(a.produced_at, "2026-06-05T12:00:00.000Z");
      assert.equal(b.character, undefined);
      // unrelated fields preserved (including the prior Phase-A cast and post_url)
      assert.equal(a.title, "A");
      assert.equal(a.post_url, null);
      assert.ok(a.cast);
      assert.equal(after.baseline.note, "seed");
    });
  });

  it("records BOTH produced status and the Asset fields for an Idea moving casting → produced", async () => {
    await withLedger(async (path) => {
      const seed = {
        ideas: [{ id: "idea-A", run: "2026-W22", status: "casting", title: "A" }],
      };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");

      // Phase B completes: the render job reaches done ⇒ produced (derived), and the Asset is recorded.
      const status = ledgerStatusForTransition(job({ idea_id: "idea-A", phase: "render" }), "done");
      assert.equal(status, "produced");
      await writeIdeaStatus("idea-A", status!, { ledgerPath: path });
      await writeIdeaAsset("idea-A", asset, { ledgerPath: path });

      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{
          id: string;
          status: string;
          character?: string;
          asset_url?: string;
          produced_at?: string;
        }>;
      };
      const a = after.ideas.find((i) => i.id === "idea-A")!;
      assert.equal(a.status, "produced");
      assert.equal(a.character, "cast-3");
      assert.equal(a.asset_url, "https://magnific.example/asset/1.mp4");
      assert.equal(a.produced_at, "2026-06-05T12:00:00.000Z");
    });
  });

  it("leaves the ledger untouched for an unknown Idea", async () => {
    await withLedger(async (path) => {
      const seed = { ideas: [{ id: "idea-A", status: "casting" }] };
      await writeFile(path, JSON.stringify(seed, null, 2) + "\n", "utf8");
      await writeIdeaAsset("idea-ZZZ", asset, { ledgerPath: path });
      const after = JSON.parse(await readFile(path, "utf8")) as {
        ideas: Array<{ id: string; status: string; asset_url?: unknown }>;
      };
      assert.equal(after.ideas[0]!.status, "casting");
      assert.equal(after.ideas[0]!.asset_url, undefined);
    });
  });
});
