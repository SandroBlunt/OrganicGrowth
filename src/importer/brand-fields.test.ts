/**
 * Tests for `deriveBrandDisplayFields` (`src/importer/brand-fields.ts`) — issue #204.
 *
 * Neither Brand's `brand-profile.yaml` carries a canonical top-level `name`/`timezone` field (verified:
 * neither file has one). Straw Motion's DOES carry a Zoho Social Brand config
 * (`production-spec/brand-profile.ts`'s `loadZohoConfig`) whose first entry names both
 * (`"Straw Motion"` / `"Europe/Berlin"`) for a real, Operator-authored reason (the Zoho bulk-scheduling
 * config, issue #143). MundoTip has no `zoho` block at all. This module picks the best available real
 * source and falls back to a documented default otherwise — never throws, never invents a plausible-
 * looking value from nothing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveBrandDisplayFields } from "./brand-fields.ts";
import { zohoConfigFrom } from "../production-spec/brand-profile.ts";

describe("deriveBrandDisplayFields — a Brand's display name + timezone, from the best real source available", () => {
  it("uses the first Zoho Social Brand's name + timezone when configured", () => {
    const raw = {
      zoho: {
        brands: [{ name: "Straw Motion", timezone: "Europe/Berlin", channels: [{ platform: "facebook", label: "Facebook" }] }],
      },
    };
    const lookup = zohoConfigFrom(raw, "straw-motion");
    const fields = deriveBrandDisplayFields(lookup, "straw-motion");
    assert.deepEqual(fields, { name: "Straw Motion", timezone: "Europe/Berlin" });
  });

  it("falls back to a title-cased slug + UTC when no Zoho config exists (MundoTip's real shape)", () => {
    const lookup = zohoConfigFrom({}, "mundotip");
    const fields = deriveBrandDisplayFields(lookup, "mundotip");
    assert.deepEqual(fields, { name: "Mundotip", timezone: "UTC" });
  });

  it("title-cases a hyphenated slug", () => {
    const lookup = zohoConfigFrom({}, "straw-motion");
    const fields = deriveBrandDisplayFields(lookup, "straw-motion");
    assert.deepEqual(fields, { name: "Straw Motion", timezone: "UTC" });
  });

  it("falls back the same way when the zoho block is present but malformed", () => {
    const lookup = zohoConfigFrom({ zoho: { brands: "not-an-array" } }, "mundotip");
    const fields = deriveBrandDisplayFields(lookup, "mundotip");
    assert.deepEqual(fields, { name: "Mundotip", timezone: "UTC" });
  });
});
