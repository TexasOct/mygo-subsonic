import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
import { readFile } from "node:fs/promises";

// Missing or malformed settings guide the listener without sending a request.
test("sign-in setup failures explain where to configure Subsonic without opening external UI", async (t) => {
  const f = await fixture(t);
  for (const [key, value] of [["username", ""], ["authMode", "invalid"], ["serverUrl", "not-a-url"]]) {
    const previous = f.settings[key];
    f.settings[key] = value;
    f.prompts.length = 0;
    await assert.rejects(f.plugin.signIn(), (error) => error.code === "setup" && error.message.includes("Settings → Plugins → Subsonic"));
    assert.equal(f.calls.length, 0);
    assert.equal(f.prompts.length, 1);
    assert.match(f.prompts[0].text, /Settings → Plugins → Subsonic/);
    assert.match(f.prompts[0].text, /server address, username and password/);
    assert.match(f.prompts[0].text, /sign in again/);
    f.settings[key] = previous;
  }
  assert.equal(f.plugin.account(), null);
});

// Sign-in guidance uses the host locale without exposing configuration values.
test("sign-in setup and failure guidance are translated into the host locale", async (t) => {
  const f = await fixture(t, { interceptPing: true, handler: () => ({ status: "failed", error: { code: 40 } }) });
  const translations = JSON.parse(await readFile(new URL("../locales/zh-CN.json", import.meta.url), "utf8"));
  globalThis.host.t = (text) => translations[text] || text;
  f.settings.username = "";
  await assert.rejects(f.plugin.signIn(), (error) => error.code === "setup" && error.message.includes("设置 → 插件 → Subsonic"));
  assert.match(f.prompts.at(-1).text, /服务器地址、用户名和密码/);
  f.settings.username = "listener";
  await assert.rejects(f.plugin.signIn(), (error) => error.code === "signIn" && error.message.includes("设置 → 插件 → Subsonic"));
  assert.match(f.prompts.at(-1).text, /用户名、密码和登录方式/);
});

// A cancelled or superseded attempt must not overwrite the current dialog guidance.
test("a stale sign-in response does not replace guidance after logout or a newer login", async (t) => {
  let arrived;
  let release;
  const seen = new Promise((resolve) => { arrived = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { interceptPing: true, handler: async () => { arrived(); await pending; return { status: "failed", error: { code: 40 } }; } });
  const oldLogin = f.plugin.signIn();
  await seen;
  f.plugin.signOut();
  f.handle(() => ({}));
  await f.plugin.signIn();
  const before = structuredClone(f.prompts);
  release();
  await assert.rejects(oldLogin, { code: "signIn" });
  assert.deepEqual(f.prompts, before);
  assert.deepEqual(f.plugin.account(), { id: "listener", name: "listener" });
});

// Instructions are visible during a pending ping, not only after it fails.
test("sign-in shows verification guidance before ping resolves and then replaces it on failure", async (t) => {
  let arrived;
  let release;
  const seen = new Promise((resolve) => { arrived = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { interceptPing: true, handler: async () => { arrived(); await pending; return { status: "failed", error: { code: 40, message: "SERVER_SECRET" } }; } });
  const login = f.plugin.signIn();
  const rejected = assert.rejects(login, (error) => {
    assert.equal(error.code, "signIn");
    assert.equal(error.subsonicCode, 40);
    assert.match(error.message, /Settings → Plugins → Subsonic/);
    assert.match(error.message, /Check your username and password/);
    assert.ok(!error.message.includes("SERVER_SECRET"));
    return true;
  });
  t.after(() => release());
  await seen;
  assert.equal(f.prompts.length, 1);
  assert.match(f.prompts[0].text, /Connecting to Subsonic/);
  assert.equal(f.plugin.account(), null);
  release();
  await rejected;
  assert.equal(f.prompts.length, 2);
  assert.match(f.prompts.at(-1).text, /Username, Password and Sign-in method/);
  assert.match(f.prompts.at(-1).text, /Settings → Plugins → Subsonic/);
  assert.equal(f.plugin.account(), null);
  const text = JSON.stringify(f.prompts);
  for (const secret of ["SERVER_SECRET", f.settings.password, f.settings.username, f.settings.serverUrl]) assert.ok(!text.includes(secret));
});

// Network and server failures keep their error categories while offering relevant remedies.
test("failed login guidance distinguishes network, credentials and protocol failures", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  for (const [response, code, expected] of [
    [{ httpStatus: 503 }, "network", /Check your network connection/],
    [{ httpStatus: 401 }, "signIn", /Username, Password and Sign-in method/],
    [{ status: "failed", error: { code: 41 } }, "signIn", /Username, Password and Sign-in method/],
    [{ raw: {} }, "server", /ask your server administrator to check Subsonic access/],
  ]) {
    f.handle(() => response);
    f.prompts.length = 0;
    await assert.rejects(f.plugin.signIn(), (error) => {
      assert.equal(error.code, code);
      assert.match(error.message, expected);
      assert.match(error.message, /Settings → Plugins → Subsonic/);
      if (response.httpStatus) assert.equal(error.httpStatus, response.httpStatus);
      if (response.error) assert.equal(error.subsonicCode, response.error.code);
      return true;
    });
    assert.equal(f.prompts.length, 2);
    assert.match(f.prompts.at(-1).text, expected);
    assert.equal(f.plugin.account(), null);
  }
  f.handle(() => ({}));
  const account = await f.plugin.signIn();
  assert.deepEqual(f.plugin.account(), account);
  assert.match(f.prompts.at(-1).text, /Connecting to Subsonic/);
});
