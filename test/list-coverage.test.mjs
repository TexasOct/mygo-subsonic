import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

const albums = Array.from({ length: 651 }, (_, i) => ({ id: `al${i}`, name: `Album ${i}` }));
const artists = Array.from({ length: 151 }, (_, i) => ({ id: `ar${i}`, name: `Artist ${i}` }));
const tracks = Array.from({ length: 151 }, (_, i) => song(`s${i}`));
const playlists = Array.from({ length: 151 }, (_, i) => ({ id: `p${i}`, name: `Mix ${i}`, owner: "listener" }));

// Home links and every supported album sort must share the continuous browse path.
test("all album entrypoints collect complete batches with the requested sort and folder", async (t) => {
  const f = await fixture(t, { settings: { musicFolderId: "folder+1" }, handler: ({ params }) => {
    const offset = Number(params.get("offset"));
    return { albumList2: { album: albums.slice(offset, offset + Number(params.get("size"))) } };
  } });
  await f.plugin.signIn();
  const home = await f.plugin.home();
  assert.ok(home.sections.every((s) => s.albums.length === 12));
  const homeLinks = home.sections.flatMap((s) => s.morePage ? [s.morePage] : []);
  assert.deepEqual(homeLinks, ["albums:newest:0", "albums:recent:0"]);
  assert.equal(home.sections[2].morePage, undefined); // Random order has no stable offset.
  const routes = new Set([...homeLinks, ...["newest", "recent", "frequent", "alphabeticalByName", "alphabeticalByArtist"].map((type) => `albums:${type}:0`)]);
  for (const page of routes) {
    const before = f.calls.length;
    const result = await f.plugin.browse({ page });
    assert.deepEqual(result.sections[0].albums.map((a) => a.id), albums.map((a) => a.id));
    assert.equal(result.sections.length, 1);
    const calls = f.calls.slice(before);
    assert.deepEqual(calls.map((c) => c.params.get("offset")), ["0", "500"]);
    assert.ok(calls.every((c) => c.params.get("type") === page.split(":")[1] && c.params.get("musicFolderId") === "folder+1"));
    assert.ok(result.sections.every((s) => !s.links?.length && !s.morePage));
  }
});

// Native automatic paging must not skip the lookahead item for any search kind.
test("all search kinds retain automatic continuation without gaps or duplicate boundary items", async (t) => {
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getPlaylists") return { playlists: { playlist: playlists } };
    const result = {};
    for (const [field, items] of [["song", tracks], ["album", albums.slice(0, 151)], ["artist", artists]]) {
      const offset = Number(params.get(`${field}Offset`));
      result[field] = items.slice(offset, offset + Number(params.get(`${field}Count`)));
    }
    return { searchResult3: result };
  } });
  await f.plugin.signIn();
  for (const [kind, items] of [["tracks", tracks], ["albums", albums.slice(0, 151)], ["artists", artists], ["playlists", playlists]]) {
    const found = [];
    let more = true;
    for (let offset = 0; more && offset < 250; offset += 50) {
      const page = await f.plugin.search({ query: kind === "playlists" ? "Mix" : "music", kind, offset });
      assert.ok(page[kind].length <= 50);
      found.push(...page[kind].map((item) => item.id));
      more = page.more;
    }
    assert.equal(more, false);
    assert.deepEqual(found, items.map((item) => item.id));
    const empty = await f.plugin.search({ query: "music", kind, offset: 200 });
    assert.deepEqual(empty[kind], []);
    assert.equal(empty.more, false);
  }
});

// Favorites already use native auto-load; changing browse must not truncate them.
test("liked tracks and saved albums continue automatically through the complete result", async (t) => {
  const f = await fixture(t, { handler: () => ({ starred2: { song: tracks, album: albums.slice(0, 151) } }) });
  await f.plugin.signIn();
  for (const [capability, field, items] of [["liked", "tracks", tracks], ["savedAlbums", "albums", albums.slice(0, 151)]]) {
    const found = [];
    for (let offset = 0; offset <= 200; offset += 50) {
      const page = await f.plugin[capability]({ offset });
      found.push(...page[field].map((item) => item.id));
      assert.equal(page.more, offset + 50 < items.length);
      if (offset >= items.length) assert.deepEqual(page[field], []);
    }
    assert.deepEqual(found, items.map((item) => item.id));
  }
});

// Detail and sidebar APIs have no paging contract: return all entries and duplicates.
test("artist, album and playlist details and the playlist list are not cut into client pages", async (t) => {
  const entries = [...tracks, tracks[0]];
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtist") return { artist: { id: "ar", name: "Artist", album: albums } };
    if (method === "getAlbum") return { album: { id: "al", name: "Album", song: tracks } };
    if (method === "getPlaylist") return { playlist: { id: "p", name: "Playlist", entry: entries, owner: "listener" } };
    if (method === "getPlaylists") return { playlists: { playlist: playlists } };
    throw new Error(`unexpected method ${method}`);
  } });
  await f.plugin.signIn();
  assert.deepEqual((await f.plugin.artist({ id: "ar" })).albums.map((a) => a.id), albums.map((a) => a.id));
  assert.deepEqual((await f.plugin.album({ id: "al" })).tracks.map((s) => s.id), tracks.map((s) => s.id));
  assert.deepEqual((await f.plugin.playlist({ id: "p" })).tracks.map((s) => s.id), entries.map((s) => s.id));
  assert.deepEqual((await f.plugin.playlists()).map((p) => p.id), playlists.map((p) => p.id));
});
