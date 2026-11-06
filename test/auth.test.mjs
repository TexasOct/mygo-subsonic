import test from "node:test";
import assert from "node:assert/strict";
import { fixture, md5 } from "./helpers.mjs";

// A LAN HTTP login validates ping and uses an encoded, fresh token, never p.
test("token authentication supports HTTP, Unicode, spaces and reverse-proxy paths", async (t) => {
  const f = await fixture(t);
  f.settings.serverUrl += "/rest///";
  assert.equal(f.plugin.account(), null);
  const account = await f.plugin.signIn();
  assert.deepEqual(account, { id: "listener", name: "listener" });
  assert.deepEqual(f.plugin.account(), account);
  await f.plugin.signIn();
  for (const call of f.calls) {
    assert.equal(call.verb, "POST");
    assert.equal(call.url.pathname, "/music/rest/ping.view");
    assert.equal(call.url.search, "");
    assert.match(call.headers["content-type"], /application\/x-www-form-urlencoded/);
    assert.equal(call.params.get("v"), "1.16.1");
    assert.equal(call.params.get("c"), "mygo-subsonic");
    assert.equal(call.params.get("f"), "json");
    assert.equal(call.params.get("u"), "listener");
    assert.ok(call.params.get("s").length >= 6);
    assert.equal(call.params.get("t"), md5(f.settings.password + call.params.get("s")));
    assert.equal(call.params.has("p"), false);
  }
  assert.notEqual(f.calls[0].params.get("s"), f.calls[1].params.get("s"));
  assert.equal(JSON.stringify([...f.storage]).includes(f.settings.password), false);
});

// Legacy authentication is opt-in and never a silent downgrade after failure.
test("legacy mode hex-encodes the original password, token failure never retries legacy", async (t) => {
  const f = await fixture(t, { interceptPing: true, handler: () => ({ status: "failed", error: { code: 41 } }) });
  await assert.rejects(f.plugin.signIn(), { code: "signIn" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].params.has("p"), false);
  f.settings.authMode = "legacy";
  f.handle(() => ({}));
  await f.plugin.signIn();
  const params = f.calls.at(-1).params;
  assert.equal(params.get("p"), `enc:${Buffer.from(f.settings.password, "utf8").toString("hex")}`);
  assert.equal(params.has("s"), false);
  assert.equal(params.has("t"), false);
  f.settings.password = "enc:6162 密码 +&= ";
  await f.plugin.signIn();
  assert.equal(f.calls.at(-1).params.get("p"), `enc:${Buffer.from(f.settings.password, "utf8").toString("hex")}`);
  const url = new URL((await f.plugin.stream({ id: "s" })).url);
  assert.equal(Buffer.from(url.searchParams.get("p").slice(4), "hex").toString("utf8"), f.settings.password);
});

// Logout and credential changes prevent further authenticated operations.
test("logout, changed credentials and persisted configuration invalidate account", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.plugin.home(), { code: "signIn" });
  await f.plugin.signIn();
  f.settings.username = "new-user";
  assert.equal(f.plugin.account(), null);
  await assert.rejects(f.plugin.home(), { code: "signIn" });
  await f.plugin.signIn();
  f.settings.password = "changed"; // The host persists before invoking setSetting.
  f.plugin.setSetting({ key: "password", value: "changed" });
  assert.equal(f.plugin.account(), null);
  await f.plugin.signIn();
  f.plugin.signOut();
  assert.equal(f.plugin.account(), null);
  await assert.rejects(f.plugin.stream({ id: "1" }), { code: "signIn" });
});

// A slow ping cannot sign the listener back in after logout.
test("sign-out while ping is pending does not resurrect the session", async (t) => {
  let release;
  let arrived;
  const pending = new Promise((resolve) => { release = resolve; });
  const seen = new Promise((resolve) => { arrived = resolve; });
  const f = await fixture(t, { interceptPing: true, handler: async () => { arrived(); await pending; return {}; } });
  const login = f.plugin.signIn();
  await seen;
  f.plugin.signOut();
  release();
  await assert.rejects(login, { code: "signIn" });
  assert.equal(f.plugin.account(), null);
});

// Invalid URLs are rejected locally, without sending credentials anywhere.
test("invalid setup is rejected but HTTPS and private HTTP addresses are both supported", async (t) => {
  const f = await fixture(t);
  const original = f.settings.serverUrl;
  for (const address of ["ftp://example.com", "http://user:pass@host", "http://host?a=1", "http://host/#fragment", "localhost:4533", ""]) {
    f.settings.serverUrl = address;
    await assert.rejects(f.plugin.signIn(), { code: "setup" });
  }
  assert.equal(f.calls.length, 0);
  f.settings.serverUrl = original;
  f.settings.authMode = "unknown";
  await assert.rejects(f.plugin.signIn(), { code: "setup" });
  f.settings.authMode = "";
  await f.plugin.signIn();
});

// Server errors are classified and sanitized instead of echoing secret URLs.
test("Subsonic errors, HTTP failures, invalid JSON and redirects are not false successful logins", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  for (const [response, code] of [
    [{ status: "failed", error: { code: 40, message: "SECRET_PASSWORD" } }, "signIn"],
    [{ status: "failed", error: { code: 50, message: "SECRET_PASSWORD" } }, "server"],
    [{ status: "failed", error: { code: 70 } }, "unavailable"],
    [{ httpStatus: 401 }, "signIn"],
    [{ httpStatus: 500 }, "network"],
    [{ raw: {} }, "server"],
    [{ httpStatus: 200, text: "not json" }, "server"],
    [{ httpStatus: 302, headers: { Location: "https://example.com/SECRET_PASSWORD" } }, "network"],
  ]) {
    f.handle(() => response);
    await assert.rejects(f.plugin.signIn(), (error) => error.code === code && !error.message.includes("SECRET_PASSWORD"));
    assert.equal(f.plugin.account(), null);
  }
});
