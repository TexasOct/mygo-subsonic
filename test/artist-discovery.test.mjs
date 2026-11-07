import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

// A track-only performer can have no getArtist albums while their indexed songs identify the actual releases.
test("artist detail recovers performer albums omitted by getArtist", async (t) => {
  const performer = { id: "custom/+&", name: "七尾百合子" };
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtist") return { artist: { ...performer, album: [] } };
    if (method === "search3") return { searchResult3: { song: [song("participation", {
      albumId: "release", album: "THE IDOLM@STER", artists: [{ id: "group", name: "765 MILLION ALLSTARS" }],
      contributors: [{ role: "custom performer", artist: performer }],
    })] } };
    return {};
  } });
  await f.plugin.signIn();
  const result = await f.plugin.artist({ id: performer.id });
  assert.deepEqual(result.albums.map(({ id }) => id), ["release"]);
});

// The legacy album-artist index must not hide track-only artists exposed by the server's searchable artist catalogue.
test("artist browsing includes searchable artists outside getArtists", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtists") return { artists: { index: [{ artist: [{ id: "group", name: "765 MILLION ALLSTARS" }] }] } };
    if (method === "search3") return { searchResult3: { artist: [{ id: "group", name: "765 MILLION ALLSTARS" }, { id: "solo", name: "七尾百合子" }] } };
    return {};
  } });
  await f.plugin.signIn();
  const result = await f.plugin.browse({ page: "artists:0" });
  assert.deepEqual(result.sections.flatMap(({ artists = [] }) => artists.map(({ id }) => id)), ["group", "solo"]);
});

// Search keywords select candidates; only an exact credited ID proves participation, including any custom role.
test("artist albums validate IDs, keep server metadata and separate same-name people", async (t) => {
  const who = { id: "person/+&", name: "Same Name" };
  const tracks = [
    song("dup", { albumId: "existing", contributors: [{ role: "performer", artist: who }] }),
    song("primary", { albumId: "main", artists: [who] }),
    song("instrument", { albumId: "custom", contributors: [{ role: "custom instrument", artist: who }] }),
    song("albumartist", { albumId: "albumartist", albumArtists: [who] }),
    song("title", { albumId: "false-title", title: "Same Name" }),
    song("homonym", { albumId: "false-homonym", artists: [{ id: "other", name: who.name }] }),
    song("nameless-id", { albumId: "false-name", contributors: [{ role: "performer", artist: { name: who.name } }] }),
    song("no-album", { albumId: undefined, artists: [who] }),
  ];
  const f = await fixture(t, { settings: { musicFolderId: "library/+" }, handler: ({ method, params }) => {
    if (method === "getArtist") return { artist: { ...who, album: [{ id: "existing", name: "Authoritative title", year: 1999, starred: "yes" }] } };
    if (method === "search3") {
      assert.equal(params.get("query"), who.name);
      assert.equal(params.get("musicFolderId"), "library/+");
      assert.equal(params.get("albumCount"), "0");
      assert.equal(params.get("artistCount"), "0");
      return { searchResult3: { song: tracks } };
    }
    return {};
  } });
  await f.plugin.signIn();
  const result = await f.plugin.artist({ id: who.id });
  assert.deepEqual(result.albums.map(({ id }) => id), ["existing", "main", "custom", "albumartist"]);
  assert.equal(result.albums[0].name, "Authoritative title");
  assert.equal(result.albums[0].released, "1999");
  assert.equal(result.albums[0].saved, true);
  assert.deepEqual(result.tracks, []);
  assert.equal(f.calls.filter(({ method }) => method === "getAlbum").length, 0);
});

// A contributor's release may appear after many unrelated song hits and after the first server batch.
test("artist participation lookup pages all candidate songs before deduplicating releases", async (t) => {
  const who = { id: "singer", name: "Singer" };
  const tracks = Array.from({ length: 503 }, (_, i) => song(`s${i}`, {
    albumId: `a${Math.floor(i / 2)}`, contributors: [{ role: "custom", artist: who }],
  }));
  const f = await fixture(t, { handler: ({ method, params }) => method === "getArtist" ? { artist: who } : {
    searchResult3: { song: tracks.slice(Number(params.get("songOffset")), Number(params.get("songOffset")) + Number(params.get("songCount"))) },
  } });
  await f.plugin.signIn();
  const result = await f.plugin.artist({ id: who.id });
  assert.equal(result.albums.length, 252);
  assert.equal(result.albums.at(-1).id, "a251");
  assert.deepEqual(f.calls.filter(({ method }) => method === "search3").map(({ params }) => params.get("songOffset")), ["0", "500"]);
});

// Older servers without optional artist search retain their original artist index and discography.
test("unsupported optional search preserves legacy artist browsing and detail", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtist") return { artist: { id: "a", name: "A", album: [{ id: "release", name: "Release" }] } };
    if (method === "getArtists") return { artists: { index: [{ artist: [{ id: "a", name: "A" }] }] } };
    return { status: "failed", error: { code: 10 } };
  } });
  await f.plugin.signIn();
  assert.deepEqual((await f.plugin.artist({ id: "a" })).albums.map(({ id }) => id), ["release"]);
  assert.deepEqual((await f.plugin.browse({ page: "artists:0" })).sections.map(({ artists }) => artists.map(({ id }) => id)), [["a"]]);
});

// Enrichment must never turn permission/auth failures or an offline empty discography into a successful empty page.
test("artist lookup surfaces denied access and network failures instead of false empty results", async (t) => {
  let failure = { status: "failed", error: { code: 40 } };
  const f = await fixture(t, { handler: ({ method }) => method === "getArtist" ? { artist: { id: "a", name: "A" } } : failure });
  await f.plugin.signIn();
  await assert.rejects(f.plugin.artist({ id: "a" }), { code: "signIn" });
  failure = { status: "failed", error: { code: 50 } };
  await assert.rejects(f.plugin.artist({ id: "a" }), { code: "server" });
  failure = { httpStatus: 503 };
  await assert.rejects(f.plugin.artist({ id: "a" }), { code: "network" });
});

// Artist catalogues larger than one call's budget have an explicit, working continuation rather than truncation.
test("artist catalogue pages, deduplicates IDs and continues after 5000 entries", async (t) => {
  const people = Array.from({ length: 5002 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` }));
  const f = await fixture(t, { settings: { musicFolderId: "folder" }, handler: ({ method, params }) => {
    if (method === "getArtists") return { artists: { index: [{ artist: [...people.slice(0, 2), people[5000]] }] } };
    assert.equal(params.get("query"), '\"\"');
    assert.equal(params.get("musicFolderId"), "folder");
    assert.equal(params.get("songCount"), "0");
    assert.equal(params.get("albumCount"), "0");
    const start = Number(params.get("artistOffset"));
    return { searchResult3: { artist: people.slice(start, start + Number(params.get("artistCount"))) } };
  } });
  await f.plugin.signIn();
  const first = await f.plugin.browse({ page: "artists:0" });
  assert.equal(first.sections[0].artists.length, 5001);
  assert.ok(first.sections[0].artists.some(({ id }) => id === "p5000"));
  assert.equal(first.sections[1].morePage, "artists:catalog:5000");
  const rest = await f.plugin.browse({ page: first.sections[1].morePage });
  assert.deepEqual(rest.sections[0].artists.map(({ id }) => id), ["p5001"]);
  assert.equal(rest.sections.length, 1);
});

// Ignored server offsets and overlarge batches must not loop forever or misrepresent results as complete.
test("artist discovery rejects broken paging and malformed search responses", async (t) => {
  const people = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` }));
  const who = { id: "p0", name: "Person 0" };
  let result = { artist: people };
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtists") return { artists: {} };
    if (method === "getArtist") return { artist: who };
    return { searchResult3: result };
  } });
  await f.plugin.signIn();
  await assert.rejects(f.plugin.browse({ page: "artists:0" }), /same artists/);
  result = { song: Array.from({ length: 500 }, (_, i) => song(`s${i}`, { artists: [who] })) };
  await assert.rejects(f.plugin.artist({ id: who.id }), /same songs/);
  result = { song: "bad" };
  await assert.rejects(f.plugin.artist({ id: who.id }), { code: "server" });
  result = { artist: [...people, who] };
  await assert.rejects(f.plugin.browse({ page: "artists:0" }), /more artists than requested/);
});

// Missing search envelopes are protocol failures, not proof that an artist has no works or the catalogue ended.
test("artist discovery rejects absent or malformed search envelopes at any batch", async (t) => {
  const who = { id: "a", name: "A" };
  let envelope = {};
  let fullFirstBatch = false;
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getArtists") return { artists: {} };
    if (method === "getArtist") return { artist: who };
    if (fullFirstBatch && !Number(params.get("songOffset") || params.get("artistOffset"))) {
      const people = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
      return Number(params.get("songCount")) ? { searchResult3: { song: people.map(({ id }) => song(id, { artists: [who] })) } }
        : { searchResult3: { artist: people } };
    }
    return envelope;
  } });
  await f.plugin.signIn();
  for (fullFirstBatch of [false, true]) {
    for (envelope of [{}, { searchResult3: null }, { searchResult3: "bad" }, { searchResult3: [] }]) {
      await assert.rejects(f.plugin.artist({ id: who.id }), { code: "server" });
      await assert.rejects(f.plugin.browse({ page: "artists:0" }), { code: "server" });
    }
  }
});

// The initial optional lookup may expire without losing existing albums, but cannot invent an empty discography.
test("artist deadline preserves authoritative releases but never an unverified empty result", async (t) => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  let albums = [{ id: "existing", name: "Existing" }];
  const f = await fixture(t, { handler: ({ method }) => {
    assert.equal(method, "getArtist");
    now += 8001;
    return { artist: { id: "a", name: "A", album: albums } };
  } });
  await f.plugin.signIn();
  assert.deepEqual((await f.plugin.artist({ id: "a" })).albums.map(({ id }) => id), ["existing"]);
  albums = [];
  await assert.rejects(f.plugin.artist({ id: "a" }), { code: "network" });
  assert.equal(f.calls.filter(({ method }) => method === "search3").length, 0);
});

// A failed second batch is incomplete, even if getArtist or the first search supplied some albums.
test("artist enrichment never silently returns incomplete albums after a later timeout", async (t) => {
  const who = { id: "a", name: "A", album: [{ id: "original", name: "Original" }] };
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getArtist") return { artist: who };
    if (Number(params.get("songOffset"))) return { httpStatus: 503 };
    return { searchResult3: { song: Array.from({ length: 500 }, (_, i) => song(`s${i}`, { artists: [who] })) } };
  } });
  await f.plugin.signIn();
  await assert.rejects(f.plugin.artist({ id: who.id }), { code: "network" });
});

// Slow catalogue requests preserve a useful index and a retryable continuation instead of declaring the end.
test("artist catalogue network failures retain a truthful continuation", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => method === "getArtists"
    ? { artists: { index: [{ artist: [{ id: "indexed", name: "Indexed" }] }] } } : { httpStatus: 503 } });
  await f.plugin.signIn();
  const first = await f.plugin.browse({ page: "artists:0" });
  assert.deepEqual(first.sections[0].artists.map(({ id }) => id), ["indexed"]);
  assert.equal(first.sections[1].morePage, "artists:catalog:0");
});

// The native artist page has no continuation, so a bounded lookup cannot silently claim a truncated discography.
test("artist detail reports excessive candidate sets instead of truncating", async (t) => {
  const who = { id: "a", name: "A" };
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getArtist") return { artist: who };
    const offset = Number(params.get("songOffset"));
    return { searchResult3: { song: Array.from({ length: Number(params.get("songCount")) }, (_, i) => song(`s${offset + i}`, { artists: [who] })) } };
  } });
  await f.plugin.signIn();
  await assert.rejects(f.plugin.artist({ id: who.id }), /too many artist search matches/);
});
