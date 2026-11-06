import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";

// A longer-budget caller must survive a short-budget caller's shared probe timeout.
test("shared discovery outlives the initiating browse deadline", async (t) => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  let arrived;
  let release;
  const seen = new Promise((resolve) => { arrived = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  t.after(() => { release(); });
  const f = await fixture(t, { interceptPing: true });
  await f.plugin.signIn();
  now += 31000;
  f.handle(async ({ method }) => {
    if (method === "ping") { arrived(); await blocked; return {}; }
    return { albumList2: { album: [] } };
  });
  let first = true;
  Date.now = () => {
    if (first) { first = false; return now - 7990; }
    return now;
  };
  const browse = assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "network" });
  await seen;
  const home = f.plugin.home();
  const completed = home.then(() => "ok", (error) => error.code);
  try {
    await browse;
  } finally { release(); }
  assert.equal(await completed, "ok");
  assert.equal(f.calls.filter((c) => c.method === "ping").length, 2);
  assert.equal(f.calls.filter((c) => c.method === "getAlbumList2").length, 3);
});

// A short-budget browse must not wait for another caller's long route probe.
test("album browsing bounds its wait for a shared probe without cancelling other callers", async (t) => {
  const realNow = Date.now;
  const base = realNow();
  let now = base;
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  let arrived;
  let release;
  const seen = new Promise((resolve) => { arrived = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { interceptPing: true });
  await f.plugin.signIn();
  now = base + 31000; // Expire the route and start a longer caller's probe.
  f.handle(async ({ method }) => {
    if (method === "ping") { arrived(); await blocked; return {}; }
    return { albumList2: { album: [] } };
  });
  const home = f.plugin.home();
  await seen;
  let first = true;
  Date.now = () => {
    if (first) { first = false; return now - 7990; } // Browse has 10ms left.
    return now;
  };
  try {
    await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "network" });
    assert.equal(f.calls.filter((c) => c.method === "getAlbumList2").length, 0);
  } finally {
    Date.now = () => now;
    release();
    await home;
  }
  assert.equal(f.calls.filter((c) => c.method === "ping").length, 2);
  // The timed-out browse must not issue a late request after discovery finishes.
  assert.equal(f.calls.filter((c) => c.method === "getAlbumList2").length, 3);
});
