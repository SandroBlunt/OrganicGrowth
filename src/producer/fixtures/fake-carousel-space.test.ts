/**
 * Proves issue #89 AC1: the FAKE Carrousel replays #86's sanitized captures and matches the live
 * single-lane node inventory — node names + types, the wiring (connections), the Producer Protocol's
 * run_points (`start: "JSON Master"`, zero gates), and the Image Generator's settings.
 *
 * This test reads the REAL captured board (`00-spaces_show.fullboard.json`) directly — never a
 * hand-typed copy of its shape — and asserts the fake's exported inventory constants equal what the
 * capture actually says, so the fake can never silently drift from the live canvas it stands in for.
 * No Magnific fake is exercised here beyond its exported constants (this is a plain-file + pure-data
 * comparison); `carousel-end-to-end.test.ts` exercises the fake's actual `SpaceMcpPort` behaviour.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readJsonFile } from "../../fs/safe-io.ts";
import { canonicalCarouselProtocol, PRODUCER_PROTOCOL_NODE_NAME } from "../../execution-protocol/protocol.ts";
import {
  CARROUSEL_NODE_INVENTORY,
  CARROUSEL_CONNECTIONS,
  CARROUSEL_IMAGE_GENERATOR_SETTINGS,
  CARROUSEL_SLIDE_CREATION_IDS,
  CARROUSEL_JSON_MASTER_NODE_NAME,
  CARROUSEL_BRAND_LOGO_NODE_NAME,
  CARROUSEL_IMAGE_GENERATOR_NODE_NAME,
  CARROUSEL_GENERATED_SLIDES_NODE_NAME,
} from "./fake-carousel-space.ts";

const CAPTURE_PATH =
  "src/space-driver/fixtures/live-captures/carrousel/00-spaces_show.fullboard.json";

interface CaptureElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly data: Record<string, unknown>;
}

interface CaptureConnection {
  readonly sourceElementId: string;
  readonly targetElementId: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly dataType: string;
}

interface CaptureBoard {
  readonly space: { readonly id: string; readonly name: string; readonly elementCount: number };
  readonly elements: readonly CaptureElement[];
  readonly connections: readonly CaptureConnection[];
}

async function loadCapture(): Promise<CaptureBoard> {
  return readJsonFile<CaptureBoard>(CAPTURE_PATH);
}

describe("the FAKE Carrousel replays #86's captured node inventory exactly (issue #89 AC1)", () => {
  it("the capture is the real single-lane 'Carrousel' Space (7 nodes, 5 connections)", async () => {
    const capture = await loadCapture();
    assert.equal(capture.space.name, "Carrousel");
    assert.equal(capture.space.elementCount, 7);
    assert.equal(capture.elements.length, 7);
    assert.equal(capture.connections.length, 5);
  });

  it("the fake's CARROUSEL_NODE_INVENTORY matches the capture's elements exactly — same names, same types, same order", async () => {
    const capture = await loadCapture();
    const fromCapture = capture.elements.map((e) => ({ name: e.name, type: e.type }));
    assert.deepEqual([...CARROUSEL_NODE_INVENTORY], fromCapture);
  });

  it("the fake's CARROUSEL_CONNECTIONS matches the capture's wiring exactly (element ids resolved to names)", async () => {
    const capture = await loadCapture();
    const nameById = new Map(capture.elements.map((e) => [e.id, e.name]));
    const fromCapture = capture.connections.map((c) => ({
      source: nameById.get(c.sourceElementId)!,
      target: nameById.get(c.targetElementId)!,
      sourcePort: c.sourcePort,
      targetPort: c.targetPort,
      dataType: c.dataType,
    }));
    // Every connection resolved to a real node name (no dangling reference in the capture).
    for (const c of fromCapture) {
      assert.ok(c.source !== undefined, "every connection's source must resolve to a captured node");
      assert.ok(c.target !== undefined, "every connection's target must resolve to a captured node");
    }
    assert.deepEqual([...CARROUSEL_CONNECTIONS], fromCapture);
  });

  it("the capture's Producer Protocol node holds the SAME run_points canonicalCarouselProtocol() declares — start: 'JSON Master', zero gates", async () => {
    const capture = await loadCapture();
    const protocolNode = capture.elements.find((e) => e.name === PRODUCER_PROTOCOL_NODE_NAME)!;
    assert.ok(protocolNode, "the capture must carry a Producer Protocol node");
    const parsed = JSON.parse(protocolNode.data.text as string) as {
      run_points: readonly { start: string; mode: string; gate: string | null }[];
    };
    assert.deepEqual(parsed, canonicalCarouselProtocol());
    assert.equal(parsed.run_points.length, 1);
    assert.equal(parsed.run_points[0]!.start, CARROUSEL_JSON_MASTER_NODE_NAME);
    assert.equal(parsed.run_points[0]!.gate, null, "zero gates — the Producer drives straight through");
  });

  it("the capture's Image Generator settings match CARROUSEL_IMAGE_GENERATOR_SETTINGS (model = flash, kept — Operator confirmed, no canvas change)", async () => {
    const capture = await loadCapture();
    const generator = capture.elements.find((e) => e.name === CARROUSEL_IMAGE_GENERATOR_NODE_NAME)!;
    assert.ok(generator, "the capture must carry the Image Generator node");
    assert.equal(generator.data.mode, CARROUSEL_IMAGE_GENERATOR_SETTINGS.mode);
    assert.equal(generator.data.aspectRatio, CARROUSEL_IMAGE_GENERATOR_SETTINGS.aspectRatio);
    assert.equal(generator.data.resolution, CARROUSEL_IMAGE_GENERATOR_SETTINGS.resolution);
  });

  it("the capture's Generated slides list holds the SAME 7 creation identifiers CARROUSEL_SLIDE_CREATION_IDS carries", async () => {
    const capture = await loadCapture();
    const list = capture.elements.find((e) => e.name === CARROUSEL_GENERATED_SLIDES_NODE_NAME)!;
    assert.ok(list, "the capture must carry the Generated slides node");
    const items = list.data.items as readonly { creationIdentifier: string }[];
    assert.deepEqual(
      items.map((i) => i.creationIdentifier),
      [...CARROUSEL_SLIDE_CREATION_IDS],
    );
  });

  it("the capture's Brand_Logo node is a 'creation' node — the real logo reference (issue #86's pinned Clear Logo.png)", async () => {
    const capture = await loadCapture();
    const logo = capture.elements.find((e) => e.name === CARROUSEL_BRAND_LOGO_NODE_NAME)!;
    assert.ok(logo, "the capture must carry the Brand_Logo node");
    assert.equal(logo.type, "creation");
  });

  it("the OLD placeholder names ('Slides Prompts', 'Brand Logo') are NOT on the real canvas at all", async () => {
    const capture = await loadCapture();
    const names = capture.elements.map((e) => e.name);
    assert.ok(!names.includes("Slides Prompts"));
    assert.ok(!names.includes("Brand Logo"));
  });
});
