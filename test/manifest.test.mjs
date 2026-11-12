import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./helpers.mjs";

const manifest = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));

// Native controls are optional metadata; old hosts still expose all six string settings.
test("manifest uses official typed controls with a legacy text fallback", async () => {
  assert.deepEqual(manifest.settings.map((field) => field.key), ["serverUrl", "username", "password", "authMode", "musicFolderId", "scrobble"]);
  for (const field of manifest.settings) {
    assert.deepEqual(Object.keys(field).filter((key) => !["key", "label", "help", "link", "type", "options"].includes(key)), []);
    assert.ok(["text", "password", "boolean", "select"].includes(field.type || "text"));
    assert.ok(field.help);
  }
  assert.equal(manifest.settings.find((field) => field.key === "password").type, "password");
  assert.equal(manifest.settings.find((field) => field.key === "scrobble").type, "boolean");
  const auth = manifest.settings.find((field) => field.key === "authMode");
  assert.equal(auth.type, "select");
  assert.deepEqual(auth.options.map((option) => option.value), ["", "token", "legacy"]);
  assert.equal(new Set(auth.options.map((option) => option.label)).size, auth.options.length);
  const source = await readFile(new URL(`../${manifest.main}`, import.meta.url), "utf8");
  assert.ok(source.includes("export"));
});

// Localized option labels must never become stored protocol values.
test("all setting labels, help and select choices have Chinese translations", async () => {
  const locale = JSON.parse(await readFile(new URL("../locales/zh-CN.json", import.meta.url), "utf8"));
  for (const field of manifest.settings) {
    for (const text of [field.label, field.help, ...(field.options || []).map((option) => option.label)]) {
      assert.ok(locale[text], `missing translation: ${text}`);
    }
  }
  const auth = manifest.settings.find((field) => field.key === "authMode");
  assert.equal(new Set(auth.options.map((option) => locale[option.label])).size, auth.options.length);
});

// Every declared choice must execute with its original string, including the unset default.
test("sign-in choices preserve credentials and never migrate existing settings", async (t) => {
  const f = await fixture(t);
  for (const { value } of manifest.settings.find((field) => field.key === "authMode").options) {
    f.settings.authMode = value;
    const before = structuredClone(f.settings);
    await f.plugin.signIn();
    const request = f.calls.at(-1);
    if (value === "legacy") {
      assert.equal(Buffer.from(request.params.get("p").slice(4), "hex").toString(), f.settings.password);
      assert.equal(request.params.has("t"), false);
    } else {
      assert.ok(request.params.get("t"));
      assert.equal(request.params.has("p"), false);
    }
    assert.deepEqual(f.settings, before);
  }
});

// Switch values remain strings, are opt-in, and do not invalidate the signed-in connection.
test("listening history accepts switch strings without changing login state", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const value of ["", "true", "false", " TRUE "]) {
    f.settings.scrobble = value;
    await f.plugin.setSetting({ key: "scrobble", value });
    assert.ok(await f.plugin.account());
    const before = f.calls.filter((call) => call.method === "scrobble").length;
    await f.plugin.played({ id: "track" });
    assert.equal(f.calls.filter((call) => call.method === "scrobble").length - before, value.trim().toLowerCase() === "true" ? 1 : 0);
    assert.equal(f.settings.scrobble, value);
  }
});
