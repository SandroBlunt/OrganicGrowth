/**
 * Tests for IdeaStore (`src/idea/store.ts`) — issue #223.
 *
 * `{ db }`-only, genuinely new (mirrors `src/brand/store.ts`/`src/channel/store.ts`/`src/copy/store.ts`'s
 * own test shape, issue #222): no pre-existing `{ ledgerPath }`-taking "Idea store" to bridge. Every
 * test opens a real, throwaway SQLite file via `withTempDb` — never `:memory:`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createTrend } from "../trend/store.ts";
import { HOOK_TYPES, type HookType } from "../vocabulary/hook-type.ts";
import { THEMES, type Theme } from "../vocabulary/theme.ts";
import {
  createIdea,
  getIdea,
  getIdeaByLegacyRef,
  listUnclaimedIdeasForRunByTitle,
  claimLegacyRef,
  listIdeasForRun,
  listAllIdeas,
  listIdeasByHookType,
  acceptIdea,
  rejectIdea,
  selectIdeaRecipes,
  listIdeaRecipes,
  classifyIdea,
  IdeaValidationError,
  type IdeaRecord,
  type ClassificationSource,
} from "./store.ts";

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

/** Casts a plain (possibly invalid) `string` to `HookType`/`Theme` — mirroring a REAL caller that only
 *  has a `string` at compile time (e.g. a Brief-import script, or Operator-typed conversational input),
 *  never a hardcoded literal a static type could already reject. This is exactly what `createIdea`'s
 *  runtime `IdeaValidationError` guard exists to catch. */
function asHookType(value: string): HookType {
  return value as HookType;
}
function asTheme(value: string): Theme {
  return value as Theme;
}

/** Minimal brand -> format -> run fixture chain an `idea` row needs (no RunStore exists — mirrors
 *  `src/trend/store.test.ts`'s/`src/asset/db-store.test.ts`'s own `seedRun`/`seedIdea` convention). */
function seedRun(db: DatabaseSync): { readonly brandId: string; readonly formatId: string; readonly runId: string } {
  const brandId = createBrand(db, {
    slug: `straw-motion-${randomUUID()}`,
    name: "Straw Motion",
    timezone: "UTC",
    mediaRoot: "data/brands/straw-motion",
  });
  const formatId = createFormat(db, { brandId, slug: "unhypped-news", name: "Unhypped News", voice: "plain" });
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO run (id, brand_id, format_id, run_key, cadence, started_at, created_at, updated_at)
     VALUES (?, ?, ?, '2026-W33', 'weekly', ?, ?, ?)`,
  ).run(runId, brandId, formatId, now, now, now);
  return { brandId, formatId, runId };
}

/** Creates one `suggested` Idea with the given `runId`/`brandId`/`formatId`, returning its id. */
function seedIdea(db: DatabaseSync, fixture: { readonly runId: string; readonly brandId: string; readonly formatId: string }): string {
  return createIdea(db, {
    runId: fixture.runId,
    brandId: fixture.brandId,
    formatId: fixture.formatId,
    title: "Google cuts Gemini pricing in half",
    brief: "Google just dropped Gemini 3.7 Flash three weeks after 3.6, and cut the price in half.",
    hookType: VALID_HOOK_TYPE,
    theme: VALID_THEME,
  });
}

describe("createIdea — inserts one idea row, always at status: 'suggested' (issue #223)", () => {
  it("with only the required fields, defaults the optional ones", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal(idea.status, "suggested");
      assert.deepEqual(idea.sourceUrls, []);
      assert.equal("trendId" in idea, false);
      assert.equal("fitScore" in idea, false);
      assert.equal("relevance" in idea, false);
      assert.equal("momentum" in idea, false);
      assert.equal("brandFit" in idea, false);
      assert.equal("rejectionReason" in idea, false);
      assert.equal("legacyRef" in idea, false);
    });
  });

  it("stores every optional field when given, including a real trendId and legacyRef", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "Gemini 3.7 Flash launches" });
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        trendId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        sourceUrls: ["https://example.com/a", "https://example.com/b"],
        fitScore: 0.82,
        relevance: 0.7,
        momentum: 0.9,
        brandFit: 0.6,
        legacyRef: "idea-05",
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal(idea.trendId, trendId);
      assert.deepEqual(idea.sourceUrls, ["https://example.com/a", "https://example.com/b"]);
      assert.equal(idea.fitScore, 0.82);
      assert.equal(idea.relevance, 0.7);
      assert.equal(idea.momentum, 0.9);
      assert.equal(idea.brandFit, 0.6);
      assert.equal(idea.legacyRef, "idea-05");
    });
  });

  it("rejects an unknown runId/brandId/formatId via the schema's own foreign keys", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      assert.throws(
        () =>
          createIdea(db, {
            runId: "does-not-exist",
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
          }),
        /FOREIGN KEY/,
      );
    });
  });
});

describe("createIdea — hook_type/theme are required and validated against the closed vocabularies at the store boundary (issue #223)", () => {
  it("rejects an out-of-vocabulary hookType BEFORE any write, naming every legal value", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: asHookType("not_a_real_hook_type"),
            theme: VALID_THEME,
          }),
        (err: unknown) => {
          assert.ok(err instanceof IdeaValidationError);
          assert.match(err.message, /not_a_real_hook_type/);
          for (const t of HOOK_TYPES) assert.match(err.message, new RegExp(t.value));
          return true;
        },
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("rejects an out-of-vocabulary theme BEFORE any write, naming every legal value", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: asTheme("not_a_real_theme"),
          }),
        (err: unknown) => {
          assert.ok(err instanceof IdeaValidationError);
          assert.match(err.message, /not_a_real_theme/);
          for (const t of THEMES) assert.match(err.message, new RegExp(t.value));
          return true;
        },
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("accepts 'unclassified' for both hookType and theme, like any other closed-vocabulary member", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: "unclassified",
        theme: "unclassified",
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal(idea.hookType, "unclassified");
      assert.equal(idea.theme, "unclassified");
    });
  });
});

describe("createIdea — the openly-readable-source rule is enforced at the store boundary (issue #228)", () => {
  it("accepts a paywalled trendId when the Idea carries its own sourceUrls — the case a naive implementation breaks", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, {
        runId: fixture.runId,
        label: "FT reports a private valuation leak",
        isPaywalled: true,
      });
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        trendId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        sourceUrls: ["https://an-open-outlet.example/covers-the-same-story"],
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal(idea.trendId, trendId);
      assert.deepEqual(idea.sourceUrls, ["https://an-open-outlet.example/covers-the-same-story"]);
    });
  });

  it("rejects a paywalled trendId when the Idea's own sourceUrls is empty (omitted), BEFORE any write", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, {
        runId: fixture.runId,
        label: "FT reports a private valuation leak",
        isPaywalled: true,
      });
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
          }),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("rejects a paywalled trendId when the Idea's own sourceUrls is explicitly []", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "NYT scoop", isPaywalled: true });
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
            sourceUrls: [],
          }),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("never blocks on a non-paywalled trendId, even with no sourceUrls — this rule is about the Idea's OWN sources, never the Trend's paywall status alone", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, {
        runId: fixture.runId,
        label: "Openly readable launch post",
        isPaywalled: false,
      });
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        trendId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal(idea.trendId, trendId);
      assert.deepEqual(idea.sourceUrls, []);
    });
  });

  it("never blocks when trendId is omitted entirely, regardless of sourceUrls", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.equal("trendId" in idea, false);
    });
  });

  it("never pre-validates trendId itself — an unknown/dangling trendId falls through to the schema's own FOREIGN KEY, never IdeaValidationError (deliberate, mirrors runId/brandId/formatId)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId: "does-not-exist",
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
          }),
        /FOREIGN KEY/,
      );
    });
  });

  it("rejects a paywalled trendId when sourceUrls holds only a single blank string", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "FT scoop", isPaywalled: true });
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
            sourceUrls: [""],
          }),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("rejects a paywalled trendId when sourceUrls holds only a whitespace-only entry", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "FT scoop", isPaywalled: true });
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
            sourceUrls: ["   "],
          }),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("rejects a paywalled trendId when EVERY sourceUrls entry is blank or whitespace-only (mixed blanks)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "NYT scoop", isPaywalled: true });
      assert.throws(
        () =>
          createIdea(db, {
            runId: fixture.runId,
            brandId: fixture.brandId,
            formatId: fixture.formatId,
            trendId,
            title: "Test Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
            sourceUrls: ["", "   ", ""],
          }),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("accepts a paywalled trendId when sourceUrls mixes one blank entry with one real entry", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const trendId = createTrend(db, { runId: fixture.runId, label: "WIRED scoop", isPaywalled: true });
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        trendId,
        title: "Test Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        sourceUrls: ["   ", "https://an-open-outlet.example/covers-the-same-story"],
      });
      const idea = getIdea(db, id) as IdeaRecord;
      assert.deepEqual(idea.sourceUrls, ["   ", "https://an-open-outlet.example/covers-the-same-story"]);
    });
  });
});

describe("getIdea / listIdeasForRun — null-for-unknown, [] for none, never throw", () => {
  it("getIdea returns null for an unknown id", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.equal(getIdea(db, "does-not-exist"), null);
    });
  });

  it("listIdeasForRun returns [] for a Run with no Ideas yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      assert.deepEqual(listIdeasForRun(db, fixture.runId), []);
    });
  });

  it("listIdeasForRun returns every Idea for a Run, in creation order", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const idA = seedIdea(db, fixture);
      const idB = seedIdea(db, fixture);
      const ideas = listIdeasForRun(db, fixture.runId);
      assert.deepEqual(ideas.map((i) => i.id), [idA, idB]);
    });
  });
});

describe("getIdeaByLegacyRef — the real, per-Brand-unique identity the accept-flow SQL sync keys on (migration 5, issue #254)", () => {
  it("returns null when no Idea in this Brand carries that legacyRef", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      seedIdea(db, fixture); // carries no legacyRef
      assert.equal(getIdeaByLegacyRef(db, fixture.brandId, "idea-01"), null);
    });
  });

  it("finds the Idea by (brandId, legacyRef)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "A real headline",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      const found = getIdeaByLegacyRef(db, fixture.brandId, "idea-01");
      assert.equal(found?.id, id);
      assert.equal(found?.legacyRef, "idea-01");
    });
  });

  it("TWO DIFFERENT accepted Ideas sharing an IDENTICAL title never collide — each keeps its own row (QA round-1 Defect 1)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const firstId = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "Same Headline Twice",
        brief: "The first, real story.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      const secondId = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "Same Headline Twice",
        brief: "The second, DIFFERENT real story.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-02",
      });
      assert.notEqual(firstId, secondId, "two distinct legacyRefs must never resolve to one row");
      assert.equal(getIdeaByLegacyRef(db, fixture.brandId, "idea-01")?.id, firstId);
      assert.equal(getIdeaByLegacyRef(db, fixture.brandId, "idea-02")?.id, secondId);
      assert.equal(listIdeasForRun(db, fixture.runId).length, 2, "both Ideas keep their own row");
    });
  });

  it("scopes by Brand — two DIFFERENT Brands may legitimately reuse the same legacyRef without colliding", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixtureA = seedRun(db);
      const fixtureB = seedRun(db);
      const idA = createIdea(db, {
        runId: fixtureA.runId,
        brandId: fixtureA.brandId,
        formatId: fixtureA.formatId,
        title: "Brand A's first idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      const idB = createIdea(db, {
        runId: fixtureB.runId,
        brandId: fixtureB.brandId,
        formatId: fixtureB.formatId,
        title: "Brand B's first idea",
        brief: "A different brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      assert.equal(getIdeaByLegacyRef(db, fixtureA.brandId, "idea-01")?.id, idA);
      assert.equal(getIdeaByLegacyRef(db, fixtureB.brandId, "idea-01")?.id, idB);
    });
  });

  it("multiple Ideas with NO legacyRef coexist fine — the UNIQUE index is partial (NULL never compared)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      seedIdea(db, fixture);
      seedIdea(db, fixture);
      // No throw — proves the partial index (`WHERE legacy_ref IS NOT NULL`) never compares NULLs.
      assert.equal(listIdeasForRun(db, fixture.runId).length, 2);
    });
  });

  it("the schema itself is the backstop: a SECOND Idea with the SAME (brand, legacyRef) throws loudly, never silently succeeds", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "First",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      assert.throws(() =>
        createIdea(db, {
          runId: fixture.runId,
          brandId: fixture.brandId,
          formatId: fixture.formatId,
          title: "A different title, same legacyRef", // even a different title never bypasses the guard
          brief: "A different brief.",
          hookType: VALID_HOOK_TYPE,
          theme: VALID_THEME,
          legacyRef: "idea-01",
        }),
      );
    });
  });
});

describe("listUnclaimedIdeasForRunByTitle / claimLegacyRef — the pre-migration-5 fallback (Round 3, Defect A, issue #254)", () => {
  it("returns [] when no Idea in this Run has that title", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      seedIdea(db, fixture);
      assert.deepEqual(listUnclaimedIdeasForRunByTitle(db, fixture.runId, "No such title"), []);
    });
  });

  it("finds a pre-migration-5 row (no legacy_ref) by (run_id, title)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "A real headline",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        // No legacyRef — exactly what every row imported before migration 5 looks like.
      });
      const matches = listUnclaimedIdeasForRunByTitle(db, fixture.runId, "A real headline");
      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.id, id);
    });
  });

  it("never matches a row that ALREADY carries a legacy_ref — an already-reconciled row is never re-adopted", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "A real headline",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01", // already reconciled
      });
      assert.deepEqual(listUnclaimedIdeasForRunByTitle(db, fixture.runId, "A real headline"), []);
    });
  });

  it("returns MULTIPLE matches when two or more unclaimed rows share a title — the caller decides this is ambiguous", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      createIdea(db, { runId: fixture.runId, brandId: fixture.brandId, formatId: fixture.formatId, title: "Same title", brief: "First.", hookType: VALID_HOOK_TYPE, theme: VALID_THEME });
      createIdea(db, { runId: fixture.runId, brandId: fixture.brandId, formatId: fixture.formatId, title: "Same title", brief: "Second.", hookType: VALID_HOOK_TYPE, theme: VALID_THEME });
      assert.equal(listUnclaimedIdeasForRunByTitle(db, fixture.runId, "Same title").length, 2);
    });
  });

  it("claimLegacyRef stamps legacyRef onto an unclaimed row, in place", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "A real headline",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
      });
      claimLegacyRef(db, id, "idea-01");
      assert.equal(getIdea(db, id)!.legacyRef, "idea-01");
      assert.equal(getIdeaByLegacyRef(db, fixture.brandId, "idea-01")?.id, id, "the fast path now finds it directly");
    });
  });

  it("claimLegacyRef throws for an unknown Idea id — never silently no-ops", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => claimLegacyRef(db, "no-such-id", "idea-01"), /not found, or already carries a legacy_ref/);
    });
  });

  it("claimLegacyRef throws when the row ALREADY carries a legacy_ref — refuses to overwrite an existing identity claim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const id = createIdea(db, {
        runId: fixture.runId,
        brandId: fixture.brandId,
        formatId: fixture.formatId,
        title: "A real headline",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        legacyRef: "idea-01",
      });
      assert.throws(() => claimLegacyRef(db, id, "idea-02"), /not found, or already carries a legacy_ref/);
      assert.equal(getIdea(db, id)!.legacyRef, "idea-01", "the original claim is left untouched");
    });
  });
});

describe("acceptIdea / rejectIdea — the two Review outcomes, guarding the suggested-only precondition (issue #223)", () => {
  it("acceptIdea moves a suggested Idea to accepted, changing nothing else", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      acceptIdea(db, ideaId);
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.status, "accepted");
      assert.equal(idea.title, "Google cuts Gemini pricing in half");
    });
  });

  it("acceptIdea throws, changing nothing, for an already-accepted Idea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      acceptIdea(db, ideaId);
      assert.throws(() => acceptIdea(db, ideaId), /accepted/);
      assert.equal((getIdea(db, ideaId) as IdeaRecord).status, "accepted");
    });
  });

  it("acceptIdea throws for an unknown ideaId", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      assert.throws(() => acceptIdea(db, "does-not-exist"), /not found/);
    });
  });

  it("acceptIdea throws, changing nothing, for an already-REJECTED Idea (the cross-case, not just already-accepted)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      rejectIdea(db, ideaId, "Not a fit");
      assert.throws(() => acceptIdea(db, ideaId), /rejected/);
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.status, "rejected");
      assert.equal(idea.rejectionReason, "Not a fit");
    });
  });

  it("rejectIdea moves a suggested Idea to rejected and records the reason verbatim", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      rejectIdea(db, ideaId, "Too close to last week's Idea 04");
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.status, "rejected");
      assert.equal(idea.rejectionReason, "Too close to last week's Idea 04");
    });
  });

  it("rejectIdea throws IdeaValidationError for a blank rejectionReason, BEFORE touching the row", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(() => rejectIdea(db, ideaId, "   "), IdeaValidationError);
      assert.equal((getIdea(db, ideaId) as IdeaRecord).status, "suggested");
    });
  });

  it("rejectIdea throws, changing nothing, for an already-rejected Idea", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      rejectIdea(db, ideaId, "Not a fit");
      assert.throws(() => rejectIdea(db, ideaId, "Second reason"), /rejected/);
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.rejectionReason, "Not a fit");
    });
  });

  it("rejectIdea throws, changing nothing, for an already-ACCEPTED Idea (the cross-case, not just already-rejected)", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      acceptIdea(db, ideaId);
      assert.throws(() => rejectIdea(db, ideaId, "Too late"), /accepted/);
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.status, "accepted");
      assert.equal("rejectionReason" in idea, false);
    });
  });
});

describe("selectIdeaRecipes / listIdeaRecipes — Recipe selection, atomic (issue #223)", () => {
  it("writes one row per offered item, chosen and declined together", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      selectIdeaRecipes(db, ideaId, [
        { recipe: "news-carousel", chosen: true },
        { recipe: "news-short-script", chosen: false, declineReason: "Not enough footage this week" },
      ]);
      const rows = listIdeaRecipes(db, ideaId);
      assert.equal(rows.length, 2);
      const carousel = rows.find((r) => r.recipe === "news-carousel")!;
      assert.equal(carousel.chosen, true);
      assert.equal("declineReason" in carousel, false);
      const script = rows.find((r) => r.recipe === "news-short-script")!;
      assert.equal(script.chosen, false);
      assert.equal(script.declineReason, "Not enough footage this week");
    });
  });

  it("calling it again for the SAME (idea, recipe) updates in place, never duplicating", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      selectIdeaRecipes(db, ideaId, [{ recipe: "news-carousel", chosen: false, declineReason: "Not yet" }]);
      selectIdeaRecipes(db, ideaId, [{ recipe: "news-carousel", chosen: true }]);
      const rows = listIdeaRecipes(db, ideaId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.chosen, true);
      assert.equal("declineReason" in rows[0]!, false);
    });
  });

  it("rejects a declined item with no declineReason, BEFORE any row is written", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          selectIdeaRecipes(db, ideaId, [
            { recipe: "news-carousel", chosen: true },
            { recipe: "news-short-script", chosen: false },
          ]),
        IdeaValidationError,
      );
      assert.deepEqual(listIdeaRecipes(db, ideaId), []);
    });
  });

  it("rolls back the WHOLE batch when an unwired recipe_slug appears partway through", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          selectIdeaRecipes(db, ideaId, [
            { recipe: "news-carousel", chosen: true },
            { recipe: "not-a-real-recipe", chosen: true },
          ]),
        /FOREIGN KEY/,
      );
      assert.deepEqual(listIdeaRecipes(db, ideaId), []);
    });
  });

  it("listIdeaRecipes returns [] for an Idea with no Recipe selection yet", async () => {
    await withTempDb(async (db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.deepEqual(listIdeaRecipes(db, ideaId), []);
    });
  });
});

const OTHER_HOOK_TYPE = HOOK_TYPES[1]!.value;
const OTHER_THEME = THEMES[1]!.value;

describe("listAllIdeas — every Idea in the database, across every Run, in creation order (issue #206)", () => {
  it("returns [] for an empty database", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.deepEqual(listAllIdeas(db), []);
    });
  });

  it("returns every Idea across MULTIPLE Runs, in creation order", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixtureA = seedRun(db);
      const ideaA = seedIdea(db, fixtureA);
      const fixtureB = seedRun(db);
      const ideaB = seedIdea(db, fixtureB);
      const ids = listAllIdeas(db).map((i) => i.id);
      assert.deepEqual(ids, [ideaA, ideaB]);
    });
  });
});

describe("classifyIdea — writes hook_type/theme plus their provenance, through IdeaStore (issue #206)", () => {
  it("updates hook_type, theme, and both provenance columns, readable back by getIdea", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);

      classifyIdea(db, ideaId, {
        hookType: asHookType(OTHER_HOOK_TYPE),
        theme: asTheme(OTHER_THEME),
        hookTypeSource: "heading",
        themeSource: "inferred",
      });

      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.hookType, OTHER_HOOK_TYPE);
      assert.equal(idea.theme, OTHER_THEME);
      assert.equal(idea.hookTypeSource, "heading");
      assert.equal(idea.themeSource, "inferred");
    });
  });

  it("a freshly created Idea carries no provenance (hookTypeSource/themeSource absent) until classifyIdea is called", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal("hookTypeSource" in idea, false);
      assert.equal("themeSource" in idea, false);
    });
  });

  it("calling classifyIdea again for the SAME Idea overwrites in place, never a second row", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);

      classifyIdea(db, ideaId, {
        hookType: asHookType(OTHER_HOOK_TYPE),
        theme: asTheme(OTHER_THEME),
        hookTypeSource: "heading",
        themeSource: "heading",
      });
      classifyIdea(db, ideaId, {
        hookType: asHookType(VALID_HOOK_TYPE),
        theme: asTheme(VALID_THEME),
        hookTypeSource: "inferred",
        themeSource: "inferred",
      });

      assert.equal(listAllIdeas(db).length, 1, "must still be exactly one idea row");
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.hookType, VALID_HOOK_TYPE);
      assert.equal(idea.theme, VALID_THEME);
      assert.equal(idea.hookTypeSource, "inferred");
      assert.equal(idea.themeSource, "inferred");
    });
  });

  it("rejects an out-of-vocabulary hookType before any write", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          classifyIdea(db, ideaId, {
            hookType: asHookType("not_a_real_hook_type"),
            theme: asTheme(VALID_THEME),
            hookTypeSource: "heading",
            themeSource: "heading",
          }),
        IdeaValidationError,
      );
      const idea = getIdea(db, ideaId) as IdeaRecord;
      assert.equal(idea.hookType, VALID_HOOK_TYPE, "the original value must be untouched");
    });
  });

  it("rejects an out-of-vocabulary theme before any write", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          classifyIdea(db, ideaId, {
            hookType: asHookType(VALID_HOOK_TYPE),
            theme: asTheme("not_a_real_theme"),
            hookTypeSource: "heading",
            themeSource: "heading",
          }),
        IdeaValidationError,
      );
    });
  });

  it("rejects an out-of-vocabulary hookTypeSource before any write", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          classifyIdea(db, ideaId, {
            hookType: asHookType(VALID_HOOK_TYPE),
            theme: asTheme(VALID_THEME),
            hookTypeSource: "guessed" as ClassificationSource,
            themeSource: "heading",
          }),
        IdeaValidationError,
      );
    });
  });

  it("rejects an out-of-vocabulary themeSource before any write", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const ideaId = seedIdea(db, fixture);
      assert.throws(
        () =>
          classifyIdea(db, ideaId, {
            hookType: asHookType(VALID_HOOK_TYPE),
            theme: asTheme(VALID_THEME),
            hookTypeSource: "heading",
            themeSource: "guessed" as ClassificationSource,
          }),
        IdeaValidationError,
      );
    });
  });

  it("throws a clear error, naming the Idea, for an unknown ideaId", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      assert.throws(
        () =>
          classifyIdea(db, "does-not-exist", {
            hookType: asHookType(VALID_HOOK_TYPE),
            theme: asTheme(VALID_THEME),
            hookTypeSource: "heading",
            themeSource: "heading",
          }),
        /does-not-exist/,
      );
    });
  });
});

describe("listIdeasByHookType — a query for a single hook type returns exactly the expected Ideas (issue #206 AC)", () => {
  it("returns only the Ideas currently at that hook_type, none other", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      const matchIdeaA = seedIdea(db, fixture);
      const matchIdeaB = seedIdea(db, fixture);
      const otherIdea = seedIdea(db, fixture);
      classifyIdea(db, matchIdeaA, {
        hookType: asHookType(OTHER_HOOK_TYPE),
        theme: asTheme(VALID_THEME),
        hookTypeSource: "heading",
        themeSource: "heading",
      });
      classifyIdea(db, matchIdeaB, {
        hookType: asHookType(OTHER_HOOK_TYPE),
        theme: asTheme(VALID_THEME),
        hookTypeSource: "inferred",
        themeSource: "heading",
      });
      // otherIdea stays at VALID_HOOK_TYPE (createIdea's default in this test's own seedIdea helper).

      const results = listIdeasByHookType(db, asHookType(OTHER_HOOK_TYPE));

      assert.deepEqual(
        results.map((r) => r.id).sort(),
        [matchIdeaA, matchIdeaB].sort(),
      );
      assert.ok(!results.some((r) => r.id === otherIdea), "an Idea at a different hook_type must not be returned");
    });
  });

  it("returns [] for a hook type no Idea currently carries", async () => {
    await withTempDb((db) => {
      runMigrations(db);
      const fixture = seedRun(db);
      seedIdea(db, fixture);
      assert.deepEqual(listIdeasByHookType(db, asHookType(OTHER_HOOK_TYPE)), []);
    });
  });
});
