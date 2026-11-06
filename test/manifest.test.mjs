import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Optional UI hints must preserve the same keys and string values on older text-only hosts.
test("typed settings remain usable through the official text-only contract", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));
  const fields = new Set(manifest.settings.map((field) => field.key));
  assert.deepEqual([...fields], ["serverUrl", "username", "password", "authMode", "musicFolderId", "scrobble"]);
  for (const field of manifest.settings) {
    assert.equal(typeof field.key, "string");
    assert.equal(typeof field.label, "string");
    assert.ok(field.help);
    assert.deepEqual(Object.keys(field).filter((key) => !["key", "label", "help", "link", "type", "options"].includes(key)), []);
  }
  const byKey = Object.fromEntries(manifest.settings.map((field) => [field.key, field]));
  assert.equal(byKey.password.type, "password");
  assert.equal(byKey.scrobble.type, "boolean");
  assert.equal(byKey.authMode.type, "select");
  assert.deepEqual(byKey.authMode.options.map((option) => option.value), ["", "token", "legacy"]);
  const main = new URL(`../${manifest.main}`, import.meta.url);
  const source = await readFile(main, "utf8");
  assert.ok(source.includes("export"));
});
