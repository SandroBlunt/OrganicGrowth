import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_RECIPE,
  outputDirFromSpecPath,
  selectUnuploadedNewsShortScripts,
  stripNextShotMarkers,
} from "./news-short-script.ts";
import { splitChapters } from "./chapters.ts";
import { scriptText, NEXT_SHOT_MARKER } from "../asset/news-short-script-output.ts";
import { validNewsShortScriptSpec } from "../production-spec/fixtures/news-short-script-specs.ts";
import type { NewsShortScriptSpec } from "../production-spec/news-short-script-contract.ts";
import type { LedgerAssetRecord } from "../asset/asset.ts";

function specFixture(): NewsShortScriptSpec {
  return validNewsShortScriptSpec() as unknown as NewsShortScriptSpec;
}

function asset(patch: Partial<LedgerAssetRecord> & { readonly status: LedgerAssetRecord["status"] }): LedgerAssetRecord {
  return { recipe: SUPPORTED_RECIPE, ...patch };
}

describe("selectUnuploadedNewsShortScripts (issue #189, ADR-0027)", () => {
  it("includes a produced news-short-script Asset carrying no camera_hub_uploaded_at", () => {
    const ideas = [{ id: "idea-1", assets: [asset({ status: "produced" })] }];
    const swept = selectUnuploadedNewsShortScripts(ideas);
    assert.equal(swept.length, 1);
    assert.equal(swept[0]!.ideaId, "idea-1");
  });

  it("excludes an Asset that already carries camera_hub_uploaded_at", () => {
    const ideas = [
      { id: "idea-1", assets: [asset({ status: "produced", camera_hub_uploaded_at: "2026-08-13T09:00:00.000Z" })] },
    ];
    assert.deepEqual(selectUnuploadedNewsShortScripts(ideas), []);
  });

  it("excludes queued/in_production Assets — script.txt does not exist yet", () => {
    const ideas = [
      { id: "idea-1", assets: [asset({ status: "queued" })] },
      { id: "idea-2", assets: [asset({ status: "in_production", pending_gate: "cast" })] },
    ];
    assert.deepEqual(selectUnuploadedNewsShortScripts(ideas), []);
  });

  it("excludes a different Recipe's Asset entirely", () => {
    const ideas = [{ id: "idea-1", assets: [{ recipe: "news-carousel", status: "produced" as const }] }];
    assert.deepEqual(selectUnuploadedNewsShortScripts(ideas), []);
  });

  it("includes posted/tracking/scored Assets too — sweeps ALL un-uploaded, not just produced-this-session (ADR-0027 'no silent drops')", () => {
    const ideas = [
      { id: "idea-posted", assets: [asset({ status: "posted" })] },
      { id: "idea-tracking", assets: [asset({ status: "tracking" })] },
      { id: "idea-scored", assets: [asset({ status: "scored" })] },
    ];
    const swept = selectUnuploadedNewsShortScripts(ideas);
    assert.deepEqual(
      swept.map((s) => s.ideaId).sort(),
      ["idea-posted", "idea-scored", "idea-tracking"],
    );
  });

  it("no Idea/no Assets -> []", () => {
    assert.deepEqual(selectUnuploadedNewsShortScripts([]), []);
    assert.deepEqual(selectUnuploadedNewsShortScripts([{ id: "idea-1" }]), []);
  });

  it("sweeps across MULTIPLE ideas, pairing each swept Asset with its OWN Idea id", () => {
    const ideas = [
      { id: "idea-1", assets: [asset({ status: "produced" })] },
      { id: "idea-2", assets: [asset({ status: "produced" }), { recipe: "news-carousel", status: "produced" as const }] },
    ];
    const swept = selectUnuploadedNewsShortScripts(ideas);
    assert.deepEqual(
      swept.map((s) => s.ideaId).sort(),
      ["idea-1", "idea-2"],
    );
  });
});

describe("outputDirFromSpecPath (issue #189)", () => {
  it("swaps the .spec.json suffix for .output, keeping everything else identical", () => {
    const specPath = "data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-04.news-short-script.spec.json";
    assert.equal(
      outputDirFromSpecPath(specPath, "news-short-script"),
      "data/brands/straw-motion/ideas/unhypped-daily/2026-08-11/idea-04.news-short-script.output",
    );
  });

  it("falls back to a plain .spec.json strip for an unexpected suffix shape, never throws", () => {
    assert.equal(outputDirFromSpecPath("some/path/idea-01.spec.json", "news-short-script"), "some/path/idea-01.output");
  });
});

describe("stripNextShotMarkers (issue #189)", () => {
  it("removes the [Next shot] document marker, leaving the SAME beat paragraphs splitChapters recovers", () => {
    const spec = specFixture();
    const rendered = scriptText(spec);
    assert.ok(rendered.includes(NEXT_SHOT_MARKER), "the fixture's rendered script must actually contain the marker");

    const stripped = stripNextShotMarkers(rendered);
    assert.doesNotMatch(stripped, /\[Next shot\]/);

    const chapters = splitChapters(stripped);
    assert.deepEqual(chapters, spec.beats.map((b) => b.text.trim()));
  });

  it("a marker-free script.txt round-trips unchanged", () => {
    assert.equal(stripNextShotMarkers("Beat one.\n\nBeat two.\n"), "Beat one.\n\nBeat two.\n");
  });
});
