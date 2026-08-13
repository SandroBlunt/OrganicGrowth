/**
 * FAKE app-lifecycle port implementing the narrow `CameraHubAppLifecyclePort` — THIS IS THE CAMERA HUB
 * PROCESS FAKE (issue #189, ADR-0027).
 *
 * Mirrors `FakeMediaHost` / `FakeZohoSchedulePort`: entirely in-memory, deterministic, and it records
 * every call it receives so a test can assert exactly what happened — without ever quitting, checking,
 * or relaunching a real desktop process.
 */

import type { CameraHubAppLifecyclePort } from "../app-lifecycle.ts";

export class FakeCameraHubAppLifecycle implements CameraHubAppLifecyclePort {
  /** Whether the (fake) app is currently "running" — set at construction, or later via `setRunning`. */
  public running: boolean;
  /** How many times `isRunning()` was called, in total. */
  public isRunningCalls = 0;
  /** How many times `launch()` was called, in total — proves the batching contract (one relaunch per
   *  batch call, never one per script). */
  public launchCalls = 0;

  constructor(initialRunning = false) {
    this.running = initialRunning;
  }

  /** Simulate the Operator quitting (or leaving open) the real app between calls. */
  setRunning(value: boolean): void {
    this.running = value;
  }

  async isRunning(): Promise<boolean> {
    this.isRunningCalls += 1;
    return this.running;
  }

  async launch(): Promise<void> {
    this.launchCalls += 1;
    this.running = true; // relaunching brings the (fake) app back up, mirroring real behavior
  }
}
