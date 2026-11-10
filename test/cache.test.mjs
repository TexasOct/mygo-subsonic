import test from "node:test";
import assert from "node:assert/strict";
import { fixture, md5, song } from "./helpers.mjs";

function clock(t) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  return (ms) => { now += ms; };
}
function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}
const count = (f, method) => f.calls.filter((call) => call.method === method).length;
const item = (name = "Name") => ({ id: "p/+&", name, owner: "listener", coverArt: "cover/+&", entry: [song("a"), song("b"), song("a")] });

// Identical artwork shares a short-lived URL without reusing API or audio authentication.
test("cover URLs are reused across mappings, expire, and never enter persistent storage", async (t) => {
  const advance = clock(t);
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getSong") return { song: song("a") };
    return { playlists: { playlist: [item()] }, searchResult3: { album: [{ id: "al", coverArt: "cover/+&" }] } };
  } });
  await f.plugin.signIn();
  const first = (await f.plugin.playlists())[0].imageUrl;
  assert.equal((await f.plugin.search({ query: "x", kind: "albums" })).albums[0].imageUrl, first);
  const url = new URL(first);
  assert.equal(url.searchParams.get("id"), "cover/+&");
  assert.equal(url.searchParams.get("size"), "600");
  assert.equal(url.searchParams.get("t"), md5(f.settings.password + url.searchParams.get("s")));
  const one = await f.plugin.stream({ id: "a" });
  const two = await f.plugin.stream({ id: "a" });
  assert.notEqual(one.url, two.url);
  const salts = f.calls.map(({ params }) => params.get("s"));
  assert.equal(new Set(salts).size, salts.length);
  advance(301000);
  assert.notEqual((await f.plugin.playlists())[0].imageUrl, first);
  assert.deepEqual([...f.storage.keys()], ["account"]);
  assert.equal(JSON.stringify([...f.storage]).includes("getCoverArt"), false);
});

// Lists and paged playlist search share one raw response; every caller receives fresh projections.
test("playlist list/search and details cache reads, preserve duplicates, and expire", async (t) => {
  const advance = clock(t);
  const f = await fixture(t, { handler: () => ({ playlists: { playlist: [item()] }, playlist: item() }) });
  await f.plugin.signIn();
  const list = await f.plugin.playlists();
  const detail = await f.plugin.playlist({ id: "p/+&" });
  list[0].name = "mutated";
  detail.tracks[0].artists[0].name = "mutated";
  detail.tracks.pop();
  assert.equal((await f.plugin.playlists())[0].name, "Name");
  assert.equal((await f.plugin.search({ query: "name", kind: "playlists" })).playlists[0].name, "Name");
  const again = await f.plugin.playlist({ id: "p/+&" });
  assert.deepEqual(again.tracks.map(({ id }) => id), ["a", "b", "a"]);
  assert.equal(again.tracks[0].artists[0].name, "Artist");
  assert.equal(count(f, "getPlaylists"), 1);
  assert.equal(count(f, "getPlaylist"), 1);
  advance(31000);
  await f.plugin.playlists();
  await f.plugin.playlist({ id: "p/+&" });
  assert.equal(count(f, "getPlaylists"), 2);
  assert.equal(count(f, "getPlaylist"), 2);
});

// Same-key reads share IO, but rejected/missing responses never become sticky cache entries.
test("concurrent playlist reads coalesce and failed loads can be retried", async (t) => {
  const arrived = gate(), blocked = gate();
  let missing = false;
  const f = await fixture(t, { handler: async ({ method }) => {
    if (method === "getPlaylists") { arrived.release(); await blocked.promise; return { playlists: { playlist: [item()] } }; }
    return missing ? {} : { playlist: item() };
  } });
  t.after(() => blocked.release());
  await f.plugin.signIn();
  const one = f.plugin.playlists();
  await arrived.promise;
  const two = f.plugin.search({ query: "name", kind: "playlists" });
  blocked.release();
  await Promise.all([one, two]);
  assert.equal(count(f, "getPlaylists"), 1);
  missing = true;
  await assert.rejects(f.plugin.playlist({ id: "p/+&" }), { code: "unavailable" });
  missing = false;
  await f.plugin.playlist({ id: "p/+&" });
  assert.equal(count(f, "getPlaylist"), 2);
});

// Display caches cannot supply stale ownership or positions to any edit operation.
test("playlist edits always read fresh state and invalidate metadata and artwork", async (t) => {
  let current = item();
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getPlaylist") return { playlist: current };
    if (method === "getPlaylists") return { playlists: { playlist: [current] } };
    if (["createPlaylist", "updatePlaylist", "deletePlaylist"].includes(method)) {
      current = { ...current, name: `${current.name}!` };
      return { playlist: current };
    }
    return {};
  } });
  await f.plugin.signIn();
  const operations = [
    () => f.plugin.renamePlaylist({ id: current.id, name: "Renamed" }),
    () => f.plugin.addToPlaylist({ id: current.id, trackIds: ["a"] }),
    () => f.plugin.removeFromPlaylist({ id: current.id, trackIds: ["a"] }),
    () => f.plugin.movePlaylistTrack({ id: current.id, from: 0, to: 1 }),
    () => f.plugin.deletePlaylist({ id: current.id }),
    () => f.plugin.createPlaylist({ name: "New" }),
  ];
  for (const [i, operation] of operations.entries()) {
    const before = await f.plugin.playlists();
    await f.plugin.playlist({ id: current.id });
    const reads = count(f, "getPlaylist");
    await operation();
    assert.equal(count(f, "getPlaylist"), reads + (i === 5 ? 0 : 1));
    const after = await f.plugin.playlists();
    assert.equal(after[0].name, current.name);
    assert.notEqual(after[0].imageUrl, before[0].imageUrl);
    assert.equal((await f.plugin.playlist({ id: current.id })).name, current.name);
  }
  current = { ...current, owner: "other" };
  const writes = count(f, "updatePlaylist");
  await assert.rejects(f.plugin.renamePlaylist({ id: current.id, name: "denied" }), { code: "unavailable" });
  assert.equal(count(f, "updatePlaylist"), writes);
});

// An uncertain write may have committed; invalidate rather than returning old state or replaying it.
test("ambiguous writes evict playlist caches without retrying mutations", async (t) => {
  let changed = false;
  const f = await fixture(t, { handler: ({ method }) => {
    const playlist = item(changed ? "Changed" : "Name");
    if (method === "updatePlaylist") { changed = true; return { httpStatus: 503 }; }
    return { playlist, playlists: { playlist: [playlist] } };
  } });
  await f.plugin.signIn();
  await f.plugin.playlists();
  await f.plugin.playlist({ id: "p/+&" });
  await assert.rejects(f.plugin.renamePlaylist({ id: "p/+&", name: "Changed" }), { code: "network" });
  assert.equal((await f.plugin.playlists())[0].name, "Changed");
  assert.equal((await f.plugin.playlist({ id: "p/+&" })).name, "Changed");
  assert.equal(count(f, "updatePlaylist"), 1);
});

// Reads begun before a write may complete, but must not refill or detach the new generation's cache.
test("late playlist reads cannot refill caches invalidated by a write", async (t) => {
  const arrived = gate(), blocked = gate();
  let name = "Old", block = true;
  const f = await fixture(t, { handler: async ({ method }) => {
    if (method === "createPlaylist") { name = "New"; return { playlist: item(name) }; }
    const snapshot = item(name);
    if (method === "getPlaylists" && block) { arrived.release(); await blocked.promise; }
    return { playlists: { playlist: [snapshot] } };
  } });
  t.after(() => blocked.release());
  await f.plugin.signIn();
  const old = f.plugin.playlists();
  await arrived.promise;
  await f.plugin.createPlaylist({ name: "New" });
  block = false;
  assert.equal((await f.plugin.playlists())[0].name, "New");
  blocked.release();
  await old;
  assert.equal((await f.plugin.playlists())[0].name, "New");
  assert.equal(count(f, "getPlaylists"), 2);
});

// Cache hits still establish/refresh the current route before mapping authenticated media URLs.
test("cached playlists remap artwork after LAN/WAN failover without rereading metadata", async (t) => {
  const advance = clock(t);
  let lanDown = false;
  const f = await fixture(t, { interceptPing: true, handler: ({ method, url }) => {
    if (lanDown && url.pathname.includes("/lan/")) return { httpStatus: 503 };
    return method === "getPlaylists" ? { playlists: { playlist: [item()] } } : {};
  } });
  const base = f.settings.serverUrl;
  f.settings.serverUrl = `${base}/lan,${base}/wan`;
  await f.plugin.signIn();
  const first = (await f.plugin.playlists())[0].imageUrl;
  assert.ok(new URL(first).pathname.includes("/lan/"));
  lanDown = true;
  // Trigger route failover through an independent read while the playlist cache is fresh.
  await f.plugin.search({ query: "x", kind: "albums" });
  const second = (await f.plugin.playlists())[0].imageUrl;
  assert.ok(new URL(second).pathname.includes("/wan/"));
  assert.equal(count(f, "getPlaylists"), 1);
  advance(31000);
  lanDown = false;
  assert.ok(new URL((await f.plugin.playlists())[0].imageUrl).pathname.includes("/lan/"));
});

// A VM restart retains the login marker, not the in-memory route, metadata or signed URLs.
test("a fresh runtime restores playlist reads from the persisted login marker", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlists: { playlist: [item()] } }) });
  await f.plugin.signIn();
  const before = (await f.plugin.playlists())[0].imageUrl;
  const fresh = await import(`../index.js?runtime=${Date.now()}`);
  assert.ok(fresh.account());
  const after = (await fresh.playlists())[0].imageUrl;
  assert.notEqual(after, before);
  assert.equal(count(f, "getPlaylists"), 2);
});

// Every session boundary protects cached data too, including logout/login with unchanged settings.
test("playlist and cover caches are isolated by login and configuration changes", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlists: { playlist: [item()] } }) });
  await f.plugin.signIn();
  let before = (await f.plugin.playlists())[0].imageUrl;
  f.plugin.signOut();
  await assert.rejects(f.plugin.playlists(), { code: "signIn" });
  await f.plugin.signIn();
  let after = (await f.plugin.playlists())[0].imageUrl;
  assert.notEqual(after, before);
  for (const [key, value] of [["username", "other"], ["password", "changed"], ["authMode", "legacy"], ["musicFolderId", "folder"], ["serverUrl", `${f.settings.serverUrl}/other`]]) {
    before = after;
    f.settings[key] = value;
    f.plugin.setSetting({ key, value });
    await assert.rejects(f.plugin.playlists(), { code: "signIn" });
    await f.plugin.signIn();
    after = (await f.plugin.playlists())[0].imageUrl;
    assert.notEqual(after, before);
  }
  assert.equal(count(f, "getPlaylists"), 7);
});

// Metadata limits bound retained work, not the size or completeness of a returned playlist.
test("playlist caches evict least-recently-used entries and bypass oversized responses", async (t) => {
  let large = false;
  const f = await fixture(t, { handler: ({ params }) => ({ playlist: { ...item(), id: params.get("id"), comment: large ? "x".repeat(2200000) : "small" } }) });
  await f.plugin.signIn();
  for (let i = 0; i < 34; i++) await f.plugin.playlist({ id: `p${i}` });
  await f.plugin.playlist({ id: "p1" }); // Still retained and made most recent.
  assert.equal(count(f, "getPlaylist"), 34);
  await f.plugin.playlist({ id: "p0" });
  assert.equal(count(f, "getPlaylist"), 35);
  large = true;
  const huge = await f.plugin.playlist({ id: "large" });
  assert.equal(huge.description.length, 2200000);
  await f.plugin.playlist({ id: "large" });
  assert.equal(count(f, "getPlaylist"), 37);
});

// Artwork has its own bounded LRU, independent of metadata response retention.
test("cover URL cache evicts old IDs without changing API results", async (t) => {
  const albums = Array.from({ length: 50 }, (_, i) => ({ id: String(i), coverArt: `cover-${i}` }));
  const f = await fixture(t, { handler: ({ params }) => {
    const offset = Number(params.get("albumOffset"));
    return { searchResult3: { album: albums.map((album) => ({ ...album, coverArt: `cover-${offset + Number(album.id)}` })) } };
  } });
  await f.plugin.signIn();
  const first = (await f.plugin.search({ query: "x", kind: "albums", offset: 0 })).albums[0].imageUrl;
  assert.equal((await f.plugin.search({ query: "x", kind: "albums", offset: 0 })).albums[0].imageUrl, first);
  for (let offset = 50; offset <= 2050; offset += 50) await f.plugin.search({ query: "x", kind: "albums", offset });
  assert.notEqual((await f.plugin.search({ query: "x", kind: "albums", offset: 0 })).albums[0].imageUrl, first);
});

// A rejected network or malformed response does not poison the shared list key.
test("playlist cache retries network and malformed-list failures", async (t) => {
  let response = { httpStatus: 503 };
  const f = await fixture(t, { handler: () => response });
  await f.plugin.signIn();
  await assert.rejects(f.plugin.playlists(), { code: "network" });
  response = { playlists: { playlist: {} } };
  await assert.rejects(f.plugin.playlists(), { code: "server" });
  response = { playlists: { playlist: [item()] } };
  assert.equal((await f.plugin.playlists()).length, 1);
  assert.equal(count(f, "getPlaylists"), 3);
});

// Waiting on IO cannot return or refill another login's cache even with identical credentials.
test("logout discards pending playlist reads and preserves the newer login cache", async (t) => {
  const arrived = gate(), blocked = gate();
  let old = true;
  const f = await fixture(t, { handler: async () => {
    const playlist = item(old ? "Old" : "New");
    if (old) { arrived.release(); await blocked.promise; }
    return { playlists: { playlist: [playlist] } };
  } });
  t.after(() => blocked.release());
  await f.plugin.signIn();
  const pending = f.plugin.playlists();
  const rejected = assert.rejects(pending, { code: "signIn" });
  await arrived.promise;
  f.plugin.signOut();
  await f.plugin.signIn();
  old = false;
  assert.equal((await f.plugin.playlists())[0].name, "New");
  blocked.release();
  await rejected;
  assert.equal((await f.plugin.playlists())[0].name, "New");
  assert.equal(count(f, "getPlaylists"), 2);
});

// Finishing an old generation must not remove the new generation's in-flight coalescing entry.
test("old playlist loads cannot detach a newer pending read", async (t) => {
  const oldArrived = gate(), oldBlocked = gate(), newArrived = gate(), newBlocked = gate();
  let reads = 0;
  const f = await fixture(t, { handler: async ({ method }) => {
    if (method === "createPlaylist") return { playlist: item("New") };
    const read = ++reads;
    if (read === 1) { oldArrived.release(); await oldBlocked.promise; }
    if (read === 2) { newArrived.release(); await newBlocked.promise; }
    return { playlists: { playlist: [item(read === 1 ? "Old" : "New")] } };
  } });
  t.after(() => { oldBlocked.release(); newBlocked.release(); });
  await f.plugin.signIn();
  const old = f.plugin.playlists();
  await oldArrived.promise;
  await f.plugin.createPlaylist({ name: "New" });
  const fresh = f.plugin.playlists();
  await newArrived.promise;
  oldBlocked.release();
  await old;
  const joined = f.plugin.playlists();
  newBlocked.release();
  assert.equal((await fresh)[0].name, "New");
  assert.equal((await joined)[0].name, "New");
  assert.equal(count(f, "getPlaylists"), 2);
});

// A load started while a write is outstanding is also fenced by the final invalidation.
test("reads during a pending playlist write cannot remain cached after it commits", async (t) => {
  const arrived = gate(), blocked = gate();
  let name = "Old";
  const f = await fixture(t, { handler: async ({ method }) => {
    if (method === "updatePlaylist") { arrived.release(); await blocked.promise; name = "New"; return {}; }
    return { playlist: item(name), playlists: { playlist: [item(name)] } };
  } });
  t.after(() => blocked.release());
  await f.plugin.signIn();
  await f.plugin.playlists();
  const write = f.plugin.renamePlaylist({ id: "p/+&", name: "New" });
  await arrived.promise;
  assert.equal((await f.plugin.playlists())[0].name, "Old");
  blocked.release();
  await write;
  assert.equal((await f.plugin.playlists())[0].name, "New");
  assert.equal(count(f, "getPlaylists"), 3);
});

// Route discovery and metadata share one deadline; a slow probe must not grant a new budget.
test("playlist metadata waits use only the budget left after probing", async (t) => {
  const advance = clock(t);
  let delayed = false;
  const f = await fixture(t, { interceptPing: true, handler: ({ method }) => {
    if (method === "ping" && delayed) advance(24990);
    if (method === "getPlaylists" && delayed) return { stallBody: true };
    return { playlists: { playlist: [item()] } };
  } });
  await f.plugin.signIn();
  advance(31000);
  delayed = true;
  await assert.rejects(f.plugin.playlists(), { code: "network" });
  delayed = false;
  assert.equal((await f.plugin.playlists()).length, 1);
});

// Textual normalization-only edits preserve the same session and hot caches.
test("equivalent address formatting does not unnecessarily evict playlist or cover caches", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlists: { playlist: [item()] } }) });
  await f.plugin.signIn();
  const cover = (await f.plugin.playlists())[0].imageUrl;
  f.settings.serverUrl += "/rest///";
  f.plugin.setSetting({ key: "serverUrl", value: f.settings.serverUrl });
  assert.equal((await f.plugin.playlists())[0].imageUrl, cover);
  assert.equal(count(f, "getPlaylists"), 1);
});

// Embedded album/artist state in cached playlist tracks follows local favorite changes.
test("save/follow mutations invalidate cached playlist track metadata", async (t) => {
  let saved = false;
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "star") { saved = true; return {}; }
    return { playlist: { ...item(), entry: [song("a", { artists: [{ id: "ar1", name: "Artist", starred: saved ? "now" : undefined }] })] } };
  } });
  await f.plugin.signIn();
  assert.equal((await f.plugin.playlist({ id: "p/+&" })).tracks[0].artists[0].following, false);
  await f.plugin.followArtist({ id: "ar1", on: true });
  assert.equal((await f.plugin.playlist({ id: "p/+&" })).tracks[0].artists[0].following, true);
  assert.equal(count(f, "getPlaylist"), 2);
});
