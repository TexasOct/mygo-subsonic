import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The official host ignores unknown metadata: every configurable key must be reachable as text.
test("release manifest exposes official settings without relying on fork-only controls", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));
  const fields = new Set(manifest.settings.map((field) => field.key));
  assert.deepEqual([...fields], ["serverUrl", "username", "password", "authMode", "musicFolderId", "scrobble"]);
  for (const field of manifest.settings) {
    assert.deepEqual(Object.keys(field).filter((key) => !["key", "label", "help", "link"].includes(key)), []);
  }
  const main = new URL(`../${manifest.main}`, import.meta.url);
  const source = await readFile(main, "utf8");
  assert.ok(source.includes("export"));
});
