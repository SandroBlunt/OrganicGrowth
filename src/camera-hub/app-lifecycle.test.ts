import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createDefaultCameraHubAppLifecycle } from "./app-lifecycle.ts";

/**
 * SHAPE-ONLY tests (issue #189). `createDefaultCameraHubAppLifecycle`'s real `isRunning`/`launch` shell
 * out to `pgrep`/`open` against the REAL desktop — this suite constructs the port but NEVER calls either
 * method, so no test here ever touches a real process. Every behavioral test of the upload sequence
 * (`upload.test.ts`) injects `fixtures/fake-app-lifecycle.ts` instead.
 */
describe("createDefaultCameraHubAppLifecycle — shape only, never invoked against a real process", () => {
  it("returns a port exposing isRunning/launch as functions", () => {
    const port = createDefaultCameraHubAppLifecycle();
    assert.equal(typeof port.isRunning, "function");
    assert.equal(typeof port.launch, "function");
  });

  it("accepts custom processPattern/appName options without touching anything", () => {
    const port = createDefaultCameraHubAppLifecycle({
      processPattern: "Some Other App",
      appName: "Some Other App.app",
    });
    assert.equal(typeof port.isRunning, "function");
    assert.equal(typeof port.launch, "function");
  });

  it("has no quit method at all — a structural guarantee that quitting is never scripted here", () => {
    const port = createDefaultCameraHubAppLifecycle();
    assert.equal(Object.hasOwn(port, "quit"), false);
    assert.equal((port as unknown as Record<string, unknown>)["quit"], undefined);
  });
});
