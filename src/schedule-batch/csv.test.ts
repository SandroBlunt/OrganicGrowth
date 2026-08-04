import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ZOHO_ROWS,
  escapeCsvField,
  encodeZohoLineBreaks,
  zohoCaptionField,
  buildZohoCsvRow,
  buildZohoCsvFile,
  zohoCsvFileName,
} from "./csv.ts";

describe("csv — the live-verified Zoho bulk-scheduler CSV dialect (issue #145)", () => {
  describe("escapeCsvField", () => {
    it("wraps a plain value in double quotes", () => {
      assert.equal(escapeCsvField("Facebook"), '"Facebook"');
    });

    it("doubles an internal double-quote (standard CSV escaping)", () => {
      assert.equal(escapeCsvField('he said "hi"'), '"he said ""hi"""');
    });

    it("leaves a comma inside the field untouched (quoting alone protects it)", () => {
      assert.equal(escapeCsvField("a, b, c"), '"a, b, c"');
    });
  });

  describe("encodeZohoLineBreaks", () => {
    it("replaces a real newline with the literal two-character \\n", () => {
      assert.equal(encodeZohoLineBreaks("line one\nline two"), "line one\\nline two");
    });

    it("replaces CRLF the same as LF", () => {
      assert.equal(encodeZohoLineBreaks("line one\r\nline two"), "line one\\nline two");
    });

    it("replaces a double blank-line break with two consecutive literal \\n", () => {
      assert.equal(encodeZohoLineBreaks("a\n\nb"), "a\\n\\nb");
    });

    it("is a no-op on text with no newline", () => {
      assert.equal(encodeZohoLineBreaks("no breaks here"), "no breaks here");
    });
  });

  describe("zohoCaptionField", () => {
    it("joins the caption body and hashtags with a blank line, no trailing newline", () => {
      const field = zohoCaptionField("Hello world.", ["#AInews", "#AIcosts"]);
      assert.equal(field, "Hello world.\n\n#AInews #AIcosts");
    });

    it("returns just the trimmed caption when there are no hashtags", () => {
      const field = zohoCaptionField("Hello world.   ", []);
      assert.equal(field, "Hello world.");
    });

    it("trims trailing whitespace off the caption body before appending hashtags", () => {
      const field = zohoCaptionField("Hello world.\n\n  ", ["#x"]);
      assert.equal(field, "Hello world.\n\n#x");
    });
  });

  describe("buildZohoCsvRow", () => {
    it("matches the live-verified dialect byte-for-byte for a 7-slide carousel row", () => {
      const row = buildZohoCsvRow({
        scheduleTime: "08/04/2026 16:23",
        channelLabel: "Facebook",
        caption: "First paragraph.\n\nSecond paragraph.",
        hashtags: ["#AInews", "#AIcosts"],
        mediaUrls: [
          "https://example.com/0-hook.jpg",
          "https://example.com/1-then.jpg",
          "https://example.com/2-shift.jpg",
          "https://example.com/3-proof.jpg",
          "https://example.com/4-different.jpg",
          "https://example.com/5-next.jpg",
          "https://example.com/6-cta.jpg",
        ],
      });
      assert.equal(
        row,
        '08/04/2026 16:23,"Facebook","First paragraph.\\n\\nSecond paragraph.\\n\\n#AInews #AIcosts",,' +
          "https://example.com/0-hook.jpg,https://example.com/1-then.jpg,https://example.com/2-shift.jpg," +
          "https://example.com/3-proof.jpg,https://example.com/4-different.jpg,https://example.com/5-next.jpg," +
          "https://example.com/6-cta.jpg,,",
      );
    });

    it("produces a RAGGED row with only 4 media fields for X (never quoted or comma-joined)", () => {
      const row = buildZohoCsvRow({
        scheduleTime: "08/04/2026 16:23",
        channelLabel: "X",
        caption: "Short caption.",
        hashtags: ["#AInews"],
        mediaUrls: [
          "https://example.com/0-hook.jpg",
          "https://example.com/1-then.jpg",
          "https://example.com/2-shift.jpg",
          "https://example.com/3-proof.jpg",
        ],
      });
      assert.equal(
        row,
        '08/04/2026 16:23,"X","Short caption.\\n\\n#AInews",,' +
          "https://example.com/0-hook.jpg,https://example.com/1-then.jpg,https://example.com/2-shift.jpg," +
          "https://example.com/3-proof.jpg,,",
      );
      // Never a single quoted, comma-joined media cell (that dialect parses as NO media at all).
      assert.ok(!row.includes('","https://example.com/0-hook.jpg,https://example.com/1-then.jpg"'));
    });

    it("leaves the Link and both GMB columns empty", () => {
      const row = buildZohoCsvRow({
        scheduleTime: "08/04/2026 16:23",
        channelLabel: "Instagram",
        caption: "x",
        hashtags: [],
        mediaUrls: ["https://example.com/0.jpg"],
      });
      const fields = row.split(",");
      // 08/04/2026 16:23 | "Instagram" | "x" | (Link empty) | media | (GMB Button empty) | (GMB Link empty)
      assert.equal(fields.at(-1), "");
      assert.equal(fields.at(-2), "");
    });
  });

  describe("buildZohoCsvFile", () => {
    it("joins rows with LF and ends with a trailing newline, no header row", () => {
      const file = buildZohoCsvFile(["row-one", "row-two"]);
      assert.equal(file, "row-one\nrow-two\n");
    });

    it("returns an empty string for zero rows", () => {
      assert.equal(buildZohoCsvFile([]), "");
    });

    it("throws, naming the row count, past MAX_ZOHO_ROWS (350)", () => {
      const rows = Array.from({ length: MAX_ZOHO_ROWS + 1 }, (_, i) => `row-${i}`);
      assert.throws(() => buildZohoCsvFile(rows), /350/);
    });

    it("accepts exactly MAX_ZOHO_ROWS rows", () => {
      const rows = Array.from({ length: MAX_ZOHO_ROWS }, (_, i) => `row-${i}`);
      assert.doesNotThrow(() => buildZohoCsvFile(rows));
    });
  });

  describe("zohoCsvFileName", () => {
    it("names the FIRST Zoho Social Brand grouping zoho-main.csv", () => {
      assert.equal(zohoCsvFileName(0, ["facebook", "instagram", "tiktok"]), "zoho-main.csv");
    });

    it("names a SECOND grouping by its sorted platform slugs", () => {
      assert.equal(zohoCsvFileName(1, ["x", "linkedin"]), "zoho-linkedin-x.csv");
    });

    it("is pure and deterministic regardless of input platform order", () => {
      const a = zohoCsvFileName(1, ["x", "linkedin"]);
      const b = zohoCsvFileName(1, ["linkedin", "x"]);
      assert.equal(a, b);
    });
  });
});
