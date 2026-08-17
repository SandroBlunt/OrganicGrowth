import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeMediaHost } from "./fake-media-host.ts";

describe("FakeMediaHost — THIS IS THE MEDIA HOST FAKE (issue #144 AC1)", () => {
  it("records every convertToJpg call, in order, with its exact arguments", async () => {
    const host = new FakeMediaHost();
    await host.convertToJpg("/tmp/slide-0.png", "/tmp/slide-0.jpg");
    await host.convertToJpg("/tmp/slide-1.png", "/tmp/slide-1.jpg");

    assert.deepEqual(host.convertCalls, [
      { sourcePath: "/tmp/slide-0.png", destPath: "/tmp/slide-0.jpg" },
      { sourcePath: "/tmp/slide-1.png", destPath: "/tmp/slide-1.jpg" },
    ]);
  });

  it("records every upload call (including its expiry) and returns a URL ending in the uploaded .jpg key", async () => {
    const host = new FakeMediaHost();
    const result = await host.upload("/tmp/slide-0.jpg", "straw-motion/2026-W32/idea-01/tok/0-hook.jpg", {
      expiresInSeconds: 3600,
    });

    assert.deepEqual(host.uploadCalls, [
      {
        localPath: "/tmp/slide-0.jpg",
        key: "straw-motion/2026-W32/idea-01/tok/0-hook.jpg",
        expiresInSeconds: 3600,
      },
    ]);
    assert.ok(result.url.endsWith("straw-motion/2026-W32/idea-01/tok/0-hook.jpg"));
    assert.ok(result.url.endsWith(".jpg"));
  });

  it("honors a custom baseUrl so tests can assert on a specific host shape", async () => {
    const host = new FakeMediaHost({ baseUrl: "https://bucket.example/" });
    const result = await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
    assert.equal(result.url, "https://bucket.example/a.jpg");
  });

  it("rejects an upload key that does not end in .jpg — never hosts a link Zoho can't fetch", async () => {
    const host = new FakeMediaHost();
    await assert.rejects(
      () => host.upload("/tmp/slide-0.png", "not-a-jpg.png", { expiresInSeconds: 3600 }),
      /\.jpg/,
    );
    // The rejected call is not recorded as a successful upload.
    assert.equal(host.uploadCalls.length, 0);
  });

  it("rejects an expiresInSeconds outside [1, MAX_PRESIGN_SECONDS] — mirrors the live adapter (issue #198)", async () => {
    const host = new FakeMediaHost();
    await assert.rejects(() => host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 0 }), /positive integer/);
    await assert.rejects(
      () => host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 604801 }),
      /604800/,
    );
    assert.equal(host.uploadCalls.length, 0);
  });

  it("records every delete call, in order", async () => {
    const host = new FakeMediaHost();
    await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
    await host.delete("a.jpg");
    await host.delete("b.jpg"); // deleting a never-uploaded key is not an error

    assert.deepEqual(host.deleteCalls, ["a.jpg", "b.jpg"]);
  });

  it("isHosted reflects upload then delete — true after upload, false after delete", async () => {
    const host = new FakeMediaHost();
    assert.equal(host.isHosted("a.jpg"), false);
    await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
    assert.equal(host.isHosted("a.jpg"), true);
    await host.delete("a.jpg");
    assert.equal(host.isHosted("a.jpg"), false);
  });

  it("deleting an already-gone key is not an error (idempotent)", async () => {
    const host = new FakeMediaHost();
    await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
    await host.delete("a.jpg");
    await assert.doesNotReject(() => host.delete("a.jpg"));
  });

  it("failConverts models a convertToJpg failure while still recording the attempted call", async () => {
    const host = new FakeMediaHost({ failConverts: true });
    await assert.rejects(() => host.convertToJpg("/tmp/a.png", "/tmp/a.jpg"));
    assert.deepEqual(host.convertCalls, [{ sourcePath: "/tmp/a.png", destPath: "/tmp/a.jpg" }]);
  });

  it("failUploads models an upload failure while still recording the attempted call, and does not host it", async () => {
    const host = new FakeMediaHost({ failUploads: true });
    await assert.rejects(() => host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 }));
    assert.deepEqual(host.uploadCalls, [{ localPath: "/tmp/a.jpg", key: "a.jpg", expiresInSeconds: 3600 }]);
    assert.equal(host.isHosted("a.jpg"), false);
  });

  it("failDeletes models a delete failure while still recording the attempted call", async () => {
    const host = new FakeMediaHost({ failDeletes: true });
    await host.upload("/tmp/a.jpg", "a.jpg", { expiresInSeconds: 3600 });
    await assert.rejects(() => host.delete("a.jpg"));
    assert.deepEqual(host.deleteCalls, ["a.jpg"]);
    // The modelled failure means the delete did not actually take effect.
    assert.equal(host.isHosted("a.jpg"), true);
  });
});
