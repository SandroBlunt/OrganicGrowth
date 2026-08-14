import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Documentation-conformance suite for issue #189 / ADR-0027 (producer offers a Camera Hub teleprompter
 * upload for News Short Script Assets). Pins the shipped prose (`GEMINI.md`,
 * `docs/adr/0027-...md`) this slice's docs-only acceptance criteria depend on.
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCER_AGENT = join(REPO_ROOT, ".agents", "skills", "producer", "SKILL.md");
const ADR_0027 = join(REPO_ROOT, "docs", "adr", "0027-producer-offers-camera-hub-teleprompter-upload.md");

describe("producer.md documents the Camera Hub teleprompter upload offer (issue #189, ADR-0027)", () => {
  it("names the offer section, scoped to news-short-script only, with no standalone command", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Camera Hub teleprompter upload offer/);
    assert.match(doc, /scoped to the `news-short-script` Recipe ONLY/);
    assert.match(doc, /no standalone command/i);
  });

  it("names the real code this offer runs, not just prose", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /selectUnuploadedNewsShortScripts/);
    assert.match(doc, /src\/camera-hub\/news-short-script\.ts/);
    assert.match(doc, /uploadCameraHubScriptsCommand/);
    assert.match(doc, /src\/commands\/upload-camera-hub-scripts\.ts/);
    assert.match(doc, /uploadTeleprompterScripts/);
    assert.match(doc, /src\/camera-hub\/upload\.ts/);
  });

  it("states the sweep covers the WHOLE ledger, no silent drops", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Sweep the WHOLE ledger, not just this Run's Assets/);
    assert.match(doc, /no silent drops/);
  });

  it("states quit is semi-manual, never scripted, and the still-running check is authoritative", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Quit is semi-manual \(ADR-0027\) — never scripted/);
    assert.match(doc, /camera_hub_still_running/);
    assert.match(doc, /ask the Operator to\s+quit again and re-run, never proceed/);
    assert.match(doc, /relaunch, by contrast, IS automatic/i);
  });

  it("states the upload is batched — one quit-verify and one relaunch across the whole batch", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /One batched call, not one per script/);
    assert.match(doc, /single\s+quit-verify and a single relaunch across the whole batch/);
  });

  it("states a failed upload never blocks anything else, script.txt stays for manual paste", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Never blocks anything else/);
    assert.match(doc, /script\.txt` stays exactly where it already is, ready for manual copy-paste/);
  });

  it("states camera_hub_uploaded_at carries no new lifecycle status, status is preserved", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /camera_hub_uploaded_at` is stamped automatically/);
    assert.match(doc, /status.{0,20}is preserved exactly as it was/);
    assert.match(doc, /no new `AssetStatus` is ever introduced by this offer/);
  });

  it("carries a matching guardrail so the rule survives a skim of the Guardrails section alone", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    const guardrailsStart = doc.indexOf("## Guardrails");
    assert.ok(guardrailsStart >= 0);
    const guardrails = doc.slice(guardrailsStart);
    assert.match(guardrails, /Camera Hub upload is News-Short-Script-only, offer-gated, and quit is never scripted/);
    assert.match(guardrails, /never script an\s+automated quit/);
  });
});

describe("docs/adr/0027 — the accepted Camera Hub upload decision (issue #189)", () => {
  it("exists and records the decision as accepted", async () => {
    const doc = await readFile(ADR_0027, "utf8");
    assert.match(doc, /\*\*Status:\*\* accepted/);
  });

  it("settles quit as semi-manual, the file-edit approach shipping now, WebSocket deferred", async () => {
    const doc = await readFile(ADR_0027, "utf8");
    assert.match(doc, /Quit is semi-manual, not automated/);
    assert.match(doc, /WebSocket route is deliberately deferred/);
  });

  it("states the offer sweeps ALL un-uploaded Assets and is scoped to News Short Script only", async () => {
    const doc = await readFile(ADR_0027, "utf8");
    assert.match(doc, /No silent drops/);
    assert.match(doc, /Scoped to the `news-short-script` Recipe only/);
  });

  it("states the tracking field is a plain marker, not a new lifecycle status", async () => {
    const doc = await readFile(ADR_0027, "utf8");
    assert.match(doc, /Tracked with a plain field, not a new lifecycle status/);
    assert.match(doc, /carries no\s*\n?\s*lifecycle meaning of its own/);
  });
});
