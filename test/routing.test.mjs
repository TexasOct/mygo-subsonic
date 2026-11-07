import test from "node:test";
import assert from "node:assert/strict";
import { fixture, md5, song } from "./helpers.mjs";

function addresses(f, names = ["lan", "wan"], separator = ", ") {
  const urls = names.map((name) => `${f.settings.serverUrl}/${name}`);
  f.settings.serverUrl = urls.join(separator);
  return urls;
}
const endpoint = (call) => call.url.pathname.split("/").at(-3);

// The user's order selects one entrance for metadata, covers and audio.
test("ordered HTTP addresses fail over and pin stream/cover URLs", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  f.handle((call) => endpoint(call) === "lan" ? { httpStatus: 503 } : call.method === "search3" ? { searchResult3: { song: [song("same", { coverArt: "cover" })] } } : call.method === "getSong" ? { song: song("same") } : {});
  await f.plugin.signIn();
  assert.deepEqual(f.calls.map(endpoint), ["lan", "wan"]);
  const track = (await f.plugin.search({ query: "x", kind: "tracks" })).tracks[0];
  assert.equal(track.id, "same");
  assert.equal(new URL(track.album.imageUrl).pathname, "/music/wan/rest/getCoverArt.view");
  const url = new URL((await f.plugin.stream({ id: track.id })).url);
  assert.equal(url.pathname, "/music/wan/rest/stream.view");
  assert.equal(url.searchParams.get("id"), "same");
  assert.equal(url.searchParams.get("u"), f.settings.username);
  assert.equal(url.searchParams.get("t"), md5(f.settings.password + url.searchParams.get("s")));
});

// Reads may retry another entrance; a mutation might already have committed.
test("reads fail over but ambiguous playlist writes are never retried", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  let failRead = false;
  f.handle((call) => {
    if (call.method === "search3") {
      if (failRead && endpoint(call) === "lan") return { httpStatus: 502 };
      return { searchResult3: { song: [song("one", { coverArt: "cover" })] } };
    }
    if (call.method === "createPlaylist") return { httpStatus: 503 };
    return {};
  });
  await f.plugin.signIn();
  failRead = true;
  const track = (await f.plugin.search({ query: "x", kind: "tracks" })).tracks[0];
  assert.equal(new URL(track.album.imageUrl).pathname, "/music/wan/rest/getCoverArt.view");
  assert.deepEqual(f.calls.filter((call) => call.method === "search3").map(endpoint), ["lan", "wan"]);
  await assert.rejects(f.plugin.createPlaylist({ name: "test" }), { code: "network" });
  assert.equal(f.calls.filter((call) => call.method === "createPlaylist").length, 1);
});

// Wrong credentials and malformed protocol responses are not connectivity failures.
test("authentication, permission and malformed-server errors stop failover", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  for (const response of [{ status: "failed", error: { code: 40 } }, { status: "failed", error: { code: 50 } }, { httpStatus: 403 }, { raw: { unexpected: true } }]) {
    f.calls.length = 0;
    f.handle(() => response);
    await assert.rejects(f.plugin.signIn());
    assert.equal(f.calls.length, 1);
    assert.equal(endpoint(f.calls[0]), "lan");
    assert.equal(f.plugin.account(), null);
  }
});

// Commas and newlines share one parser; normalization preserves the first occurrence.
test("address text normalizes HTTP paths and deduplicates without changing priority", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  const base = f.settings.serverUrl;
  f.settings.serverUrl = ` ${base}/lan/rest///,\r\n${base}/wan/, ${base}/lan/\n `;
  f.handle((call) => endpoint(call) === "lan" ? { httpStatus: 503 } : {});
  await f.plugin.signIn();
  assert.deepEqual(f.calls.map(endpoint), ["lan", "wan"]);
  f.settings.serverUrl = base;
  assert.equal(f.plugin.account(), null);
  await f.plugin.signIn();
  assert.equal(f.calls.at(-1).url.pathname, "/music/rest/ping.view");
});

// Every candidate must be safe before any credential is sent to any address.
test("invalid address lists fail locally and exhausted lists try every address once", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  const base = f.settings.serverUrl;
  for (const value of [",\n", `${base}, ftp://bad`, `${base}, http://user:pass@host`, `${base}, https://host?a=1`, Array.from({ length: 6 }, (_, i) => `${base}/${i}`).join(",")]) {
    f.settings.serverUrl = value;
    await assert.rejects(f.plugin.signIn(), { code: "setup" });
    assert.equal(f.calls.length, 0);
  }
  f.settings.serverUrl = base;
  addresses(f, ["lan", "wan", "last"]);
  f.handle(() => ({ httpStatus: 503 }));
  await assert.rejects(f.plugin.signIn(), { code: "network" });
  assert.deepEqual(f.calls.map(endpoint), ["lan", "wan", "last"]);
  assert.equal(f.plugin.account(), null);
});

// Changing addresses during IO discards the pending response rather than mixing connections.
test("address edits require login and discard a pending read", async (t) => {
  const f = await fixture(t);
  const urls = addresses(f);
  let release, arrived;
  const blocked = new Promise((resolve) => { release = resolve; });
  const seen = new Promise((resolve) => { arrived = resolve; });
  f.handle(async () => { arrived(); await blocked; return { searchResult3: { song: [song("old")] } }; });
  await f.plugin.signIn();
  const read = f.plugin.search({ query: "x", kind: "tracks" });
  await seen;
  f.settings.serverUrl = [...urls].reverse().join(",");
  f.plugin.setSetting({ key: "serverUrl", value: f.settings.serverUrl });
  assert.equal(f.plugin.account(), null);
  release();
  await assert.rejects(read, { code: "signIn" });
  await assert.rejects(f.plugin.stream({ id: "old" }), { code: "signIn" });
});

// Failed higher-priority probes stay excluded throughout the same read retry.
test("a read does not repeat failed probes during ordered failover", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f, ["lan", "wan", "last"]);
  f.handle((call) => {
    if (endpoint(call) === "lan") return { httpStatus: 503 };
    if (call.method === "search3" && endpoint(call) === "wan") return { httpStatus: 502 };
    return call.method === "search3" ? { searchResult3: { song: [song("last")] } } : {};
  });
  await f.plugin.signIn();
  assert.equal((await f.plugin.search({ query: "x", kind: "tracks" })).tracks[0].id, "last");
  assert.deepEqual(f.calls.filter((call) => call.method === "ping").map(endpoint), ["lan", "wan", "last"]);
});

// The selection cache expires so a recovered LAN address regains priority.
test("expired selection returns to the highest reachable priority", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  let lanDown = true;
  f.handle((call) => endpoint(call) === "lan" && lanDown ? { httpStatus: 503 } : call.method === "getSong" ? { song: song("track") } : {});
  await f.plugin.signIn();
  lanDown = false;
  const realNow = Date.now;
  Date.now = () => realNow() + 31000;
  try {
    assert.equal(new URL((await f.plugin.stream({ id: "track" })).url).pathname, "/music/lan/rest/stream.view");
  } finally { Date.now = realNow; }
  assert.deepEqual(f.calls.filter((call) => call.method === "ping").map(endpoint), ["lan", "wan", "lan"]);
});

// Receiving HTTP headers is not success if the response body never finishes.
test("a ping body timeout falls back as a transport error", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  f.handle((call) => endpoint(call) === "lan" ? { stallBody: true } : {});
  await f.plugin.signIn();
  assert.deepEqual(f.calls.map(endpoint), ["lan", "wan"]);
  assert.ok(f.plugin.account());
});

// Concurrent home shelves must share route discovery after a runtime restart.
test("concurrent reads share one ordered probe sequence", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  addresses(f);
  f.handle((call) => endpoint(call) === "lan" ? { httpStatus: 503 } : {});
  await f.plugin.signIn();
  const realNow = Date.now;
  Date.now = () => realNow() + 31000;
  try { await f.plugin.home(); } finally { Date.now = realNow; }
  assert.deepEqual(f.calls.filter((call) => call.method === "ping").map(endpoint), ["lan", "wan", "lan", "wan"]);
  assert.equal(f.calls.filter((call) => call.method === "getAlbumList2").length, 3);
});
