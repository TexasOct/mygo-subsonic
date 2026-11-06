import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

// Search requests one kind, overfetches for a truthful more flag, and maps units.
test("search isolates counts, encodes queries and handles opaque IDs and milliseconds", async (t) => {
  const songs = Array.from({ length: 51 }, (_, i) => song(`opaque/${i}&+`));
  const f = await fixture(t, { settings: { musicFolderId: "folder+1" }, handler: () => ({ searchResult3: { song: songs } }) });
  await f.plugin.signIn();
  const result = await f.plugin.search({ query: "日本語 & rock+roll", kind: "tracks", offset: 50 });
  assert.equal(result.tracks.length, 50);
  assert.equal(result.more, true);
  assert.equal(result.tracks[0].duration, 123456);
  assert.equal(result.tracks[0].id, "opaque/0&+");
  assert.equal(result.tracks[0].album.id, "al1");
  const params = f.calls.at(-1).params;
  assert.equal(params.get("query"), "日本語 & rock+roll");
  assert.equal(params.get("songCount"), "51");
  assert.equal(params.get("songOffset"), "50");
  assert.equal(params.get("albumCount"), "0");
  assert.equal(params.get("artistCount"), "0");
  assert.equal(params.get("musicFolderId"), "folder+1");
  f.handle(() => ({ searchResult3: {} }));
  assert.deepEqual(await f.plugin.search({ query: "missing", kind: "tracks" }), { tracks: [], more: false });
  const before = f.calls.length;
  await assert.rejects(f.plugin.search({ query: "x", kind: "tracks", offset: -1 }), { code: "unavailable" });
  assert.equal(f.calls.length, before);
});

// OpenSubsonic date objects and multiple credits must decode to MyGo strings.
test("album and artist pages map release dates, images and multi-artist credits", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => method === "getAlbum" ? {
    album: { id: "album", name: "Title", coverArt: "art &+", originalReleaseDate: { year: 2024, month: 3, day: 9 }, artists: [{ id: "a", name: "A" }, { id: "b", name: "B" }], song: [song("s")] },
  } : { artist: { id: "a", name: "A", album: [{ id: "album", name: "Title", year: 2024 }] } } });
  await f.plugin.signIn();
  const result = await f.plugin.album({ id: "album" });
  assert.equal(result.album.released, "2024-03-09");
  assert.equal(result.album.artists.length, 2);
  assert.equal(new URL(result.album.imageUrl).searchParams.get("id"), "art &+");
  assert.equal(new URL(result.album.imageUrl).protocol, "http:");
  assert.equal(result.tracks.length, 1);
  assert.equal((await f.plugin.artist({ id: "a" })).albums[0].released, "2024");
});

// Album continuation is a native section action, never an album-sized link card.
test("album browsing exposes compact continuation without losing the lookahead item", async (t) => {
  const albums = Array.from({ length: 401 }, (_, i) => ({ id: `al${i}`, name: `Album ${i}` }));
  const f = await fixture(t, { handler: ({ params }) => {
    const offset = Number(params.get("offset"));
    const size = Number(params.get("size"));
    return { albumList2: { album: albums.slice(offset, offset + size) } };
  } });
  await f.plugin.signIn();
  const first = await f.plugin.browse({ page: "albums:newest:0" });
  assert.equal(first.sections[0].albums.length, 200);
  assert.equal(first.subtitle, "1–200");
  assert.equal(first.sections[1].morePage, "albums:newest:200");
  assert.ok(first.sections[1].title);
  assert.ok(first.sections.every((section) => !section.links?.length));
  assert.equal(f.calls.at(-1).params.get("size"), "201");
  const second = await f.plugin.browse({ page: first.sections[1].morePage });
  assert.equal(second.sections[0].albums[0].id, "al200");
  assert.equal(second.sections[1].morePage, "albums:newest:400");
  const last = await f.plugin.browse({ page: second.sections[1].morePage });
  assert.deepEqual(last.sections[0].albums.map((item) => item.id), ["al400"]);
  assert.equal(last.sections.length, 1);
  assert.equal(last.subtitle, "401–401");
  // Existing saved links with the former 50-item offset remain valid.
  const legacy = await f.plugin.browse({ page: "albums:newest:50" });
  assert.equal(legacy.sections[0].albums[0].id, "al50");
  assert.equal(legacy.sections[1].morePage, "albums:newest:250");
  await assert.rejects(f.plugin.browse({ page: "albums:unknown:0" }), { code: "unavailable" });
  await assert.rejects(f.plugin.browse({ page: "artists:-1" }), { code: "unavailable" });
});

// Empty and exactly-full batches never advertise a nonexistent next page.
test("album continuation stops correctly on empty and exact batch boundaries", async (t) => {
  let albums = [];
  const f = await fixture(t, { handler: ({ params }) => ({ albumList2: { album: albums.slice(Number(params.get("offset")), Number(params.get("offset")) + Number(params.get("size"))) } }) });
  await f.plugin.signIn();
  const empty = await f.plugin.browse({ page: "albums:alphabeticalByName:0" });
  assert.deepEqual(empty.sections, [{ albums: [] }]);
  assert.equal(empty.subtitle, "");
  albums = Array.from({ length: 200 }, (_, i) => ({ id: `al${i}`, name: `Album ${i}` }));
  const exact = await f.plugin.browse({ page: "albums:alphabeticalByName:0" });
  assert.equal(exact.sections.length, 1);
  assert.equal(exact.sections[0].albums.at(-1).id, "al199");
  albums.push({ id: "al200", name: "Album 200" });
  const next = await f.plugin.browse({ page: "albums:alphabeticalByName:0" });
  assert.equal(next.sections[1].morePage, "albums:alphabeticalByName:200");
  const before = f.calls.length;
  await assert.rejects(f.plugin.browse({ page: "albums:newest:-1" }), { code: "unavailable" });
  assert.equal(f.calls.length, before);
});

// The unpaged artist index is rendered once by the host's virtualized grid.
test("artist browsing returns the complete index without artificial pagination", async (t) => {
  const artists = Array.from({ length: 551 }, (_, i) => ({ id: `ar${i}`, name: `Artist ${i}` }));
  const f = await fixture(t, { handler: () => ({ artists: { index: [{ artist: artists.slice(0, 250) }, { artist: artists.slice(250) }] } }) });
  await f.plugin.signIn();
  const result = await f.plugin.browse({ page: "artists:0" });
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].artists.length, 551);
  assert.equal(result.sections[0].artists.at(-1).id, "ar550");
  assert.equal(result.sections[0].morePage, undefined);
  assert.equal(result.sections[0].links, undefined);
  assert.equal(f.calls.at(-1).method, "getArtists");
  // Old continuation links still open the remaining index rather than breaking.
  const oldLink = await f.plugin.browse({ page: "artists:50" });
  assert.equal(oldLink.sections[0].artists[0].id, "ar50");
  assert.equal(oldLink.sections[0].artists.length, 501);
  f.handle(() => ({ artists: {} }));
  const empty = await f.plugin.browse({ page: "artists:0" });
  assert.deepEqual(empty.sections, [{ artists: [] }]);
});

// Star mutations must use different ID fields for tracks, albums and artists.
test("favorites map star parameters and locally paginate the unpaged API", async (t) => {
  const f = await fixture(t, { handler: () => ({ starred2: { song: Array.from({ length: 51 }, (_, i) => song(String(i))), album: [{ id: "al", name: "Saved" }] } }) });
  await f.plugin.signIn();
  assert.equal((await f.plugin.liked({ offset: 50 })).tracks.length, 1);
  assert.deepEqual(await f.plugin.isLiked({ ids: ["0", "100"] }), { "0": true, "100": false });
  assert.equal((await f.plugin.savedAlbums()).albums[0].id, "al");
  await f.plugin.like({ id: "s", on: true });
  assert.equal(f.calls.at(-1).method, "star");
  assert.equal(f.calls.at(-1).params.get("id"), "s");
  await f.plugin.saveAlbum({ id: "al", on: false });
  assert.equal(f.calls.at(-1).method, "unstar");
  assert.equal(f.calls.at(-1).params.get("albumId"), "al");
  await f.plugin.followArtist({ id: "ar", on: true });
  assert.equal(f.calls.at(-1).params.get("artistId"), "ar");
});

// Listening history is not silently submitted unless the listener opted in.
test("scrobbling is opt-in and sends an authenticated submission", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  const before = f.calls.length;
  await f.plugin.played({ id: "s" });
  assert.equal(f.calls.length, before);
  f.settings.scrobble = "true";
  await f.plugin.played({ id: "s" });
  assert.equal(f.calls.at(-1).method, "scrobble");
  assert.equal(f.calls.at(-1).params.get("submission"), "true");
});
