import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isAssetStatus } from "../asset/asset.ts";

/**
 * Documentation-conformance suite for issue #148 ("Schedule Batch: producer approval gate + docs and
 * glossary"). This slice is DOCS-ONLY — no production code changes — so its acceptance criteria are
 * proven entirely by pinning the shipped prose (CLAUDE.md, the producer agent doc, the run-pipeline
 * conductor doc, the export-schedule command doc, CONTEXT.md, and the new S3 setup doc) plus one real
 * code cross-check that no new AssetStatus was introduced by this "feature".
 *
 * Kept OUT of the unit suite (the `npm test` glob is "src/**\/*.test.ts", which does NOT match
 * "*.docs-test.ts"). Run with `npm run test:docs`. Editing these docs must never break `npm test`.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");
const CONTEXT_MD = join(REPO_ROOT, "CONTEXT.md");
const PRODUCER_AGENT = join(REPO_ROOT, ".claude", "agents", "producer.md");
const RUN_PIPELINE_CMD = join(REPO_ROOT, ".claude", "commands", "run-pipeline.md");
const EXPORT_SCHEDULE_CMD = join(REPO_ROOT, ".claude", "commands", "export-schedule.md");
const S3_SETUP_DOC = join(REPO_ROOT, "docs", "schedule-batch-s3-setup.md");

describe("CONTEXT.md defines Schedule Batch and Zoho Social Brand (issue #148 AC3)", () => {
  it("defines Schedule Batch as a glossary term, distinct from the Production Queue's 'batch'", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    assert.match(doc, /\*\*Schedule Batch\*\*/);
    assert.match(doc, /Schedule Batch[\s\S]{0,600}Zoho Social Brand/);
  });

  it("states the approval is conversational only and never written to the ledger", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const start = doc.indexOf("**Schedule Batch**");
    assert.ok(start >= 0, "CONTEXT.md must define Schedule Batch");
    const entry = doc.slice(start, start + 1200);
    assert.match(entry, /conversational only, never written to the ledger/);
    assert.match(entry, /scheduled_at/);
    assert.match(entry, /status.{0,20}stays.{0,20}produced|stays `produced`/);
  });

  it("states hosting/writing files is not publishing, and the Publish gate is a second distinct human step", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const start = doc.indexOf("**Schedule Batch**");
    const entry = doc.slice(start, start + 1200);
    assert.match(entry, /not publishing/);
    assert.match(entry, /second,?\s*\n?\s*distinct human step/);
    assert.match(entry, /ADR-0002/);
  });

  it("defines Zoho Social Brand as distinct from an OrganicGrowth Brand", async () => {
    const doc = await readFile(CONTEXT_MD, "utf8");
    const start = doc.indexOf("**Zoho Social Brand** (Zoho's own account container):");
    assert.ok(start >= 0, "CONTEXT.md must define Zoho Social Brand as its own glossary heading");
    const entry = doc.slice(start, start + 700);
    assert.match(entry, /not\*\* an OrganicGrowth \*\*Brand\*\*|not an OrganicGrowth Brand/);
    assert.match(entry, /LinkedInProfile/);
  });
});

describe("CLAUDE.md documents the Schedule Batch approval step, ordered before export and before Publish (issue #148 AC1/AC2)", () => {
  it("documents the producer offering the export only after in-session approval of ALL outputs and captions", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    assert.match(doc, /Schedule Batch approval/i);
    assert.match(doc, /offers the \*\*Schedule Batch\*\* export/);
    assert.match(doc, /runs it only after the Operator approves/);
    assert.match(doc, /never unprompted/);
  });

  it("states the approval writes nothing to the ledger and is NOT one of the three formal gates", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    assert.match(doc, /not\*\* one of the three formal gates/);
    assert.match(doc, /writes \*\*nothing\*\* to the ledger|conversational only, and writes \*\*nothing\*\* to the ledger/);
  });

  it("states scheduled_at is stamped without changing status (ADR-0011 unchanged)", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    assert.match(doc, /stamps `scheduled_at`/);
    assert.match(doc, /status.{0,10}stays `produced`/);
    assert.match(doc, /ADR-0011's lifecycle is unchanged/);
  });

  it("documents Gate 3 as a SECOND, distinct human step from the Schedule Batch approval, citing ADR-0002", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    const gate3Start = doc.indexOf("Gate 3 — Publish");
    assert.ok(gate3Start >= 0);
    const gate3 = doc.slice(gate3Start, gate3Start + 900);
    assert.match(gate3, /uploads the exported CSVs to Zoho\s+Social/);
    assert.match(gate3, /not publishing/);
    assert.match(gate3, /ADR-0002/);
    assert.match(gate3, /second, distinct human step/);
  });

  it("still documents the unchanged per-Asset lifecycle (no new status introduced)", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    assert.match(doc, /queued → in_production → produced → posted → tracking → scored/);
    assert.doesNotMatch(doc, /"approved"|"scheduled"\s*status/i);
  });

  it("points to the one-time S3 setup doc (issue #148 AC4)", async () => {
    const doc = await readFile(CLAUDE_MD, "utf8");
    assert.match(doc, /docs\/schedule-batch-s3-setup\.md/);
    assert.match(doc, /one-time infrastructure setup|one-time.{0,20}setup/i);
  });
});

describe("producer.md documents the Schedule Batch offer as a conversational, no-ledger-trace approval gate (issue #148)", () => {
  it("names the offer step and that it never runs unprompted", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Schedule Batch offer/);
    assert.match(doc, /never triggered unprompted|never runs unprompted/);
  });

  it("states approval is conversational only — nothing written to the ledger for it", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /approval itself is conversational only/);
    assert.match(doc, /Nothing is written to `ledger\.json` for the approval\s+step/);
    assert.match(doc, /no new status, no new field/);
  });

  it("names exportScheduleCommand and runScheduleCleanup as the real code it runs, only after approval", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /exportScheduleCommand/);
    assert.match(doc, /src\/commands\/export-schedule\.ts/);
    assert.match(doc, /runScheduleCleanup/);
    assert.match(doc, /Only once approved/);
  });

  it("states the Publish gate still follows, still human, citing ADR-0002 — two distinct human steps", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    assert.match(doc, /Publish gate still follows, still human/);
    assert.match(doc, /ADR-0002/);
    assert.match(doc, /two distinct human steps/);
    assert.doesNotMatch(doc, /you (call|post to) Zoho\b/i);
  });

  it("carries a matching guardrail so the rule survives a skim of the Guardrails section alone", async () => {
    const doc = await readFile(PRODUCER_AGENT, "utf8");
    const guardrailsStart = doc.indexOf("## Guardrails");
    assert.ok(guardrailsStart >= 0);
    const guardrails = doc.slice(guardrailsStart);
    assert.match(guardrails, /Schedule Batch export never runs unprompted/);
    assert.match(guardrails, /conversational only/);
  });
});

describe("run-pipeline.md documents the same approval-before-export-before-Publish ordering (issue #148)", () => {
  it("documents the Schedule Batch approval as a distinct, in-conversation checkpoint before Gate 3", async () => {
    const doc = await readFile(RUN_PIPELINE_CMD, "utf8");
    assert.match(doc, /Schedule Batch approval \(in-conversation, before Gate 3/);
    assert.match(doc, /not\*\* one of the three formal gates/);
    assert.match(doc, /conversational only and writes nothing to\s+the ledger/);
  });

  it("documents Gate 3 distinguishing the Zoho upload path from direct publish, citing ADR-0002", async () => {
    const doc = await readFile(RUN_PIPELINE_CMD, "utf8");
    const gate3Start = doc.indexOf("Gate 3 — Publish");
    assert.ok(gate3Start >= 0);
    const gate3 = doc.slice(gate3Start, gate3Start + 700);
    assert.match(gate3, /uploading the exported CSVs to Zoho\s+Social/);
    assert.match(gate3, /SECOND, distinct human/);
    assert.match(gate3, /ADR-0002/);
  });
});

describe("export-schedule.md documents being producer-offered behind the same approval (issue #148)", () => {
  it("states the producer normally offers this export only after in-conversation approval", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /Normally offered by the `producer`/);
    assert.match(doc, /runs it\s+only after the Operator approves/);
    assert.match(doc, /conversational only and is never written to the ledger/);
  });

  it("still documents the command as directly runnable on its own (a granular power-tool)", async () => {
    const doc = await readFile(EXPORT_SCHEDULE_CMD, "utf8");
    assert.match(doc, /directly runnable on its own/);
    assert.match(doc, /granular power-tool/);
  });
});

describe("the one-time S3 setup is documented, not code (issue #148 AC4; re-shaped private-bucket issue #198)", () => {
  it("the setup doc exists and states it is infrastructure setup, not code", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /not code/);
    assert.match(doc, /one-time/i);
  });

  it("documents the bucket and the 30-day expiry lifecycle rule", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /strawmotion-schedule-media/);
    assert.match(doc, /30 days/);
    assert.match(doc, /lifecycle rule/i);
  });

  it("states the bucket is PRIVATE — no public bucket policy — and Block Public Access stays ON (issue #198)", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /is PRIVATE, not public-read/);
    assert.match(doc, /Block Public Access.{0,40}ON/s);
    assert.match(doc, /NONE\./); // "Bucket policy: NONE."
    assert.doesNotMatch(doc, /"Principal":\s*"\*"/); // no public-principal grant anywhere
  });

  it("documents the real signed-link mechanism by name: presignViaAwsCli, computeMediaExpiry, randomMediaKeyToken", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /presignViaAwsCli/);
    assert.match(doc, /computeMediaExpiry/);
    assert.match(doc, /randomMediaKeyToken/);
    assert.match(doc, /src\/schedule-batch\/media-expiry\.ts/);
    assert.match(doc, /src\/media-host\/token\.ts/);
  });

  it("documents the exact IAM permissions the running credentials need — GetObject, PutObject, DeleteObject, never ListBucket or a wildcard", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /"s3:GetObject"/);
    assert.match(doc, /"s3:PutObject"/);
    assert.match(doc, /"s3:DeleteObject"/);
    assert.doesNotMatch(doc, /"s3:\*"|"s3:ListBucket"/);
  });

  it("documents the AWS 7-day SigV4 presign ceiling (MAX_PRESIGN_SECONDS) and that a link beyond it is refused loudly, never shipped (issue #198 QA Round 1 Defect #1)", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /MAX_PRESIGN_SECONDS/);
    assert.match(doc, /604,800|604800/);
    assert.match(doc, /7 days/);
    assert.match(doc, /cappedByAwsLimit/);
    assert.match(doc, /validateWithinPresignWindow/);
    assert.match(doc, /EXPORT REFUSED/);
    assert.match(doc, /presign-window/);
    assert.match(doc, /refused loudly, never shipped/);
  });

  it("documents the concrete migration steps for an already-public bucket (delete-bucket-policy, get-public-access-block)", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /aws s3api delete-bucket-policy/);
    assert.match(doc, /aws s3api get-public-access-block/);
    assert.match(doc, /NoSuchBucketPolicy/);
  });

  it("states it is already live for straw-motion", async () => {
    const doc = await readFile(S3_SETUP_DOC, "utf8");
    assert.match(doc, /already live for straw-motion/i);
  });
});

describe("no new AssetStatus was introduced by this docs-only slice (ADR-0011 unchanged, real code cross-check, issue #148 AC5)", () => {
  it("isAssetStatus rejects 'approved' and 'scheduled' — the six-stage vocabulary is exactly what it was", async () => {
    assert.equal(isAssetStatus("approved"), false);
    assert.equal(isAssetStatus("scheduled"), false);
    for (const s of ["queued", "in_production", "produced", "posted", "tracking", "scored"]) {
      assert.equal(isAssetStatus(s), true, `${s} must still be a valid AssetStatus`);
    }
  });
});
