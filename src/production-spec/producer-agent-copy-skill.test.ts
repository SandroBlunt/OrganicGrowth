/**
 * Proves issue #111 AC2 ("A swappable copywriting Skill exists and is invoked by the producer's copy
 * step to compose the caption and sharpen on-slide text") on the `.claude/agents/producer.md` side:
 * the Copy-phase section resolves the copywriting Skill FROM `Recipe.copySkill`
 * (`src/recipe/registry.ts`) — never a hard-coded Skill name — mirroring how the Author phase already
 * resolves its own Skill by the job's Recipe slug.
 *
 * Deliberately a REGULAR `.test.ts` (not `*.docs-test.ts`), mirroring `src/format/format-docs.test.ts`'s
 * own precedent: this is a headline acceptance criterion of this slice, not incidental documentation
 * conformance, so it runs under `npm test`'s always-on gate.
 *
 * The doc's own example Skill slug is cross-checked against the LIVE registry value (never a frozen
 * literal), mirroring `producer-agent.docs-test.ts`'s own "pinned against the registry's REAL values"
 * regression-guard pattern (issue #89) — a future rename of `Recipe.copySkill` without a matching doc
 * update fails this file loudly, rather than drifting silently.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getRecipe } from "../recipe/registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");

async function readProducerDoc(): Promise<string> {
  return readFile(PRODUCER_AGENT, "utf8");
}

describe("producer.md's Copy phase resolves the Skill from Recipe.copySkill, never a hard-coded name (issue #111 AC2)", () => {
  it("names Recipe.copySkill / src/recipe/registry.ts and the Skill tool", async () => {
    const text = await readProducerDoc();
    assert.match(text, /copySkill/);
    assert.match(text, /src\/recipe\/registry\.ts/);
    assert.match(text, /Skill tool/);
  });

  it("the doc's own example copySkill slug equals the LIVE registry's real value for BOTH wired Recipes", async () => {
    const character = getRecipe("character-explainer-with-cast")!;
    const carousel = getRecipe("news-carousel")!;
    // Both wired Recipes share one copySkill today — the doc may cite either/both as its example.
    assert.equal(character.copySkill, carousel.copySkill);

    const text = await readProducerDoc();
    assert.match(
      text,
      new RegExp(character.copySkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `producer.md must cite the REAL copySkill value "${character.copySkill}" (src/recipe/registry.ts), not a stale one`,
    );
  });
});

describe("producer.md's Copy phase still documents sharpening the produced on-slide narrative (issue #111)", () => {
  it("states the producer sharpens the produced on-slide narrative into the caption once the media exists", async () => {
    const text = await readProducerDoc();
    assert.match(text, /sharpen/i);
    assert.match(text, /on-slide narrative/i);
  });
});

describe("producer.md's Copy phase retains every pre-existing reference (issue #111 must not regress issue #58/#85)", () => {
  it("still names the injector, the validator, auditCopyPhase, and ADR-0012", async () => {
    const text = await readProducerDoc();
    assert.match(text, /src\/copy\/inject\.ts/);
    assert.match(text, /injectRequiredParts/);
    assert.match(text, /src\/copy\/validate\.ts/);
    assert.match(text, /validateCopy/);
    assert.match(text, /auditCopyPhase/);
    assert.match(text, /ADR-0012/);
  });

  it("still states a banned word is reject-only, never silently swapped", async () => {
    const text = await readProducerDoc();
    assert.match(text, /REJECT-ONLY/);
    assert.match(text, /never\s+silently swap/i);
  });
});
