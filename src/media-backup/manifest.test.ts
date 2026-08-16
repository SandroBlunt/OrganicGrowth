import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  perBrandCounts,
  perBrandMissingCounts,
  diffManifestEntry,
} from "./manifest.ts";
import type { BackupManifest, ManifestEntry } from "./manifest.ts";

function manifest(entries: ManifestEntry[], missing: BackupManifest["missingLedgerPaths"] = []): BackupManifest {
  return { generatedAt: "2026-08-16T00:00:00.000Z", destination: "/dest", entries, missingLedgerPaths: missing };
}

describe("perBrandCounts", () => {
  it("counts entries per brand", () => {
    const m = manifest([
      { brand: "acme", path: "a.png", sha256: "x", sizeBytes: 1 },
      { brand: "acme", path: "b.png", sha256: "y", sizeBytes: 2 },
      { brand: "beta", path: "c.png", sha256: "z", sizeBytes: 3 },
    ]);
    assert.deepEqual(perBrandCounts(m), { acme: 2, beta: 1 });
  });

  it("returns {} for an empty manifest", () => {
    assert.deepEqual(perBrandCounts(manifest([])), {});
  });
});

describe("perBrandMissingCounts", () => {
  it("counts missing ledger paths per brand", () => {
    const m = manifest([], [
      { brand: "acme", ideaId: "idea-01", recipe: "news-carousel", path: "gone.png" },
      { brand: "acme", ideaId: "idea-02", recipe: "news-carousel", path: "also-gone.png" },
      { brand: "beta", ideaId: "idea-01", recipe: "news-carousel", path: "missing.png" },
    ]);
    assert.deepEqual(perBrandMissingCounts(m), { acme: 2, beta: 1 });
  });

  it("returns {} when nothing is missing", () => {
    assert.deepEqual(perBrandMissingCounts(manifest([])), {});
  });
});

describe("diffManifestEntry", () => {
  const entry: ManifestEntry = { brand: "acme", path: "a.png", sha256: "abc123", sizeBytes: 100 };

  it("returns undefined when the actual file matches exactly", () => {
    assert.equal(diffManifestEntry(entry, { sha256: "abc123", sizeBytes: 100 }), undefined);
  });

  it("reports missing-at-destination when no file is there", () => {
    assert.deepEqual(diffManifestEntry(entry, undefined), {
      path: "a.png",
      reason: "missing-at-destination",
    });
  });

  it("reports checksum-mismatch when the digest differs", () => {
    assert.deepEqual(diffManifestEntry(entry, { sha256: "different", sizeBytes: 100 }), {
      path: "a.png",
      reason: "checksum-mismatch",
    });
  });

  it("reports size-mismatch when only the size differs (checksum happens to match — pathological but handled)", () => {
    assert.deepEqual(diffManifestEntry(entry, { sha256: "abc123", sizeBytes: 999 }), {
      path: "a.png",
      reason: "size-mismatch",
    });
  });

  it("prefers checksum-mismatch over size-mismatch when both differ (avoids a redundant double report)", () => {
    assert.deepEqual(diffManifestEntry(entry, { sha256: "different", sizeBytes: 999 }), {
      path: "a.png",
      reason: "checksum-mismatch",
    });
  });
});
