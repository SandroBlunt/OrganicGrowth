/**
 * Documentation-conformance suite pinning issue #228's openly-readable-source rule: the PROSE in
 * `.claude/agents/idea-strategist.md` (its "Never suggest an Idea whose every source is paywalled"
 * sentence, step 6, lines ~69-79) and `IdeaStore`'s REAL `createIdea` enforcement must agree.
 *
 * Repo trap this file exists to dodge: pinning a whole free-prose sentence verbatim rots the first time
 * someone rewords it (`.claude/agents/producer.md`'s own registry-backed guards, e.g. the "News Carousel
 * Recipe canvas node names" block in `src/production-spec/producer-agent.docs-test.ts`, already
 * established the fix — read the REAL, live value from code, never a frozen literal). There is no
 * registry for a paywall rule, so this file's stable anchors are CODE-LEVEL identifiers the doc must
 * keep citing (`createIdea`, `IdeaValidationError`, `src/idea/store.ts`) plus the rule's own historical
 * precedent citation ("idea-03", "2026-08-11") — a specific, factual reference that is far less likely
 * to be casually reworded than a descriptive sentence — and, separately, this file PROVES the doc's
 * claim against the REAL store: it calls the genuine `createIdea` (never a stub/fake) against a real,
 * throwaway SQLite database (`withTempDb`, never `:memory:`), exercising both the rejection case and the
 * acceptance case the doc describes. If the doc and the store ever disagree, one half of this file fails.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../db/migrate.ts";
import { withTempDb } from "../db/test-support.ts";
import { createBrand } from "../brand/store.ts";
import { createFormat } from "../format/store.ts";
import { createTrend } from "../trend/store.ts";
import { HOOK_TYPES } from "../vocabulary/hook-type.ts";
import { THEMES } from "../vocabulary/theme.ts";
import { createIdea, IdeaValidationError } from "./store.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const IDEA_STRATEGIST_AGENT = join(REPO_ROOT, ".claude", "agents", "idea-strategist.md");

const VALID_HOOK_TYPE = HOOK_TYPES[0]!.value;
const VALID_THEME = THEMES[0]!.value;

/** Minimal brand -> format -> run fixture chain (mirrors `src/idea/store.test.ts`'s own `seedRun`). */
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

describe("idea-strategist.md's openly-readable-source rule is pinned to IdeaStore's real enforcement (issue #228)", () => {
  it("the doc still states the rule, anchored on its real historical precedent — not free prose alone", async () => {
    const text = await readFile(IDEA_STRATEGIST_AGENT, "utf8");
    assert.match(
      text,
      /Never suggest an\s*\n?\s*Idea whose every source is paywalled/,
      "idea-strategist.md must still state the never-all-paywalled rule",
    );
    assert.match(text, /2026-08-11/, "the rule must keep its Operator-rule date citation");
    assert.match(
      text,
      /idea-03 of the first daily\s*\n?\s*Run was rejected exactly for this/,
      "the rule must keep its real precedent citation (idea-03) — a factual anchor, not paraphrase-prone prose",
    );
    assert.match(text, /paywalled/i);
    assert.match(text, /openly readable/i);
  });

  it("the doc cites the store-boundary enforcement this issue adds — createIdea / IdeaValidationError / src/idea/store.ts", async () => {
    const text = await readFile(IDEA_STRATEGIST_AGENT, "utf8");
    assert.match(text, /createIdea/, "the doc must name the real enforcement function");
    assert.match(text, /IdeaValidationError/, "the doc must name the real thrown error type");
    assert.match(text, /src\/idea\/store\.ts/, "the doc must cite the real module");
    assert.match(text, /issue #228/, "the doc must cite this issue");
  });

  it("the doc states the constraint the RIGHT way round — never 'reject because trendId is paywalled'", async () => {
    const text = await readFile(IDEA_STRATEGIST_AGENT, "utf8");
    assert.match(
      text,
      /never merely because the linked Trend is paywalled/,
      "the doc must be explicit that a paywalled trendId ALONE is never the rejection trigger",
    );
    assert.match(
      text,
      /carrying its own openly readable\s*\n?\s*`sourceUrls` is accepted/,
      "the doc must state an Idea with its own openly readable sourceUrls is accepted despite a paywalled trendId",
    );
  });

  it("PROVES the real store enforces exactly what the doc claims: a paywalled trendId with empty sourceUrls is rejected", async () => {
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
            title: "Docs-test proof Idea",
            brief: "A brief.",
            hookType: VALID_HOOK_TYPE,
            theme: VALID_THEME,
          }),
        IdeaValidationError,
      );
    });
  });

  it("PROVES the doc's stated exception holds too: a paywalled trendId with the Idea's OWN sourceUrls is accepted", async () => {
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
        title: "Docs-test proof Idea",
        brief: "A brief.",
        hookType: VALID_HOOK_TYPE,
        theme: VALID_THEME,
        sourceUrls: ["https://an-openly-readable-outlet.example/covers-the-same-story"],
      });
      assert.ok(id);
    });
  });
});
