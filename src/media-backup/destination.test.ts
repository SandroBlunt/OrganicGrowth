import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { expandTilde, resolveBackupDestination } from "./destination.ts";

const HOME = "/Users/test-operator";

describe("expandTilde", () => {
  it("expands a bare ~ to homeDir", () => {
    assert.equal(expandTilde("~", HOME), HOME);
  });

  it("expands ~/... against homeDir", () => {
    assert.equal(expandTilde("~/OrganicGrowth-Backups", HOME), join(HOME, "OrganicGrowth-Backups"));
  });

  it("returns an absolute path unchanged", () => {
    assert.equal(expandTilde("/Volumes/Backup/og", HOME), "/Volumes/Backup/og");
  });

  it("returns a relative path (no leading ~) unchanged", () => {
    assert.equal(expandTilde("./backups", HOME), "./backups");
  });
});

describe("resolveBackupDestination — argument > env var > default, no hardcoded personal path (issue #197)", () => {
  it("prefers an explicit argDest over everything else", () => {
    const dest = resolveBackupDestination({
      argDest: "/Volumes/External/og-backup",
      env: { MEDIA_BACKUP_DEST: "/should/not/win" },
      homeDir: HOME,
    });
    assert.equal(dest, "/Volumes/External/og-backup");
  });

  it("~-expands an explicit argDest", () => {
    const dest = resolveBackupDestination({ argDest: "~/my-backups", homeDir: HOME });
    assert.equal(dest, join(HOME, "my-backups"));
  });

  it("falls back to MEDIA_BACKUP_DEST when no argDest is given", () => {
    const dest = resolveBackupDestination({
      env: { MEDIA_BACKUP_DEST: "/Volumes/External/og-backup" },
      homeDir: HOME,
    });
    assert.equal(dest, "/Volumes/External/og-backup");
  });

  it("~-expands MEDIA_BACKUP_DEST too", () => {
    const dest = resolveBackupDestination({ env: { MEDIA_BACKUP_DEST: "~/env-backups" }, homeDir: HOME });
    assert.equal(dest, join(HOME, "env-backups"));
  });

  it("defaults to ~/OrganicGrowth-Backups when neither argDest nor env is set", () => {
    const dest = resolveBackupDestination({ env: {}, homeDir: HOME });
    assert.equal(dest, join(HOME, "OrganicGrowth-Backups"));
  });

  it("treats a blank argDest as absent, falling through to env then default", () => {
    const dest = resolveBackupDestination({ argDest: "   ", env: {}, homeDir: HOME });
    assert.equal(dest, join(HOME, "OrganicGrowth-Backups"));
  });

  it("treats a blank MEDIA_BACKUP_DEST as absent, falling through to the default", () => {
    const dest = resolveBackupDestination({ env: { MEDIA_BACKUP_DEST: "" }, homeDir: HOME });
    assert.equal(dest, join(HOME, "OrganicGrowth-Backups"));
  });

  it("never hardcodes a specific personal home directory — the default tracks whatever homeDir is passed", () => {
    const dest = resolveBackupDestination({ env: {}, homeDir: "/Users/someone-else-entirely" });
    assert.equal(dest, "/Users/someone-else-entirely/OrganicGrowth-Backups");
  });
});
