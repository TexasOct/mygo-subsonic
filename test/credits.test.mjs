import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

const credits = (artists) => artists.map(({ id, name }) => [id, name]);

// Every credited role and every track contributes to the album, without truncation.
test("album credits aggregate artists, writers, arrangers and performers across tracks", async (t) => {
  const performers = Array.from({ length: 28 }, (_, i) => ({ id: `performer/${i}`, name: `演奏家 ${i}` }));
  const album = {
    id: "million", name: "MILLION", artist: "CLEVER CLOVER", artistId: "group", coverArt: "cover",
    artists: [{ id: "group", name: "CLEVER CLOVER" }],
    contributors: [{ role: "arranger", artist: { id: "effy", name: "EFFY" } }],
    song: [
      song("one", {
        artists: [{ id: "group", name: "CLEVER CLOVER" }, ...performers.slice(0, 14)],
        contributors: [
          { role: "composer", artist: { id: "effy", name: "EFFY" } },
          { role: "lyricist", artist: { id: "writer", name: "作詞家" } },
          ...performers.map((artist) => ({ role: "performer", subRole: "Vocal", artist })),
        ],
      }),
      song("two", { artists: [performers.at(-1)], contributors: [{ role: "producer", artist: { name: "制作人" } }] }),
    ],
  };
  const f = await fixture(t, { handler: () => ({ album }) });
  await f.plugin.signIn();
  const result = await f.plugin.album({ id: "million" });
  assert.deepEqual(credits(result.album.artists), [
    ["group", "CLEVER CLOVER"], ["effy", "EFFY"],
    ...performers.slice(0, 14).map(({ id, name }) => [id, name]),
    ["writer", "作詞家"],
    ...performers.slice(14).map(({ id, name }) => [id, name]),
    ["", "制作人"],
  ]);
  assert.equal(result.tracks[0].artists.length, 31);
  assert.deepEqual(credits(result.tracks[1].artists), [["performer/27", "演奏家 27"], ["", "制作人"]]);
  for (const track of result.tracks) {
    assert.equal(track.album.id, "million");
    assert.equal(track.album.name, "MILLION");
    assert.equal(track.album.imageUrl, result.album.imageUrl);
    assert.deepEqual(credits(track.album.artists), credits(result.album.artists));
  }
  assert.equal(f.calls.filter(({ method }) => method !== "ping").length, 1);
});

// Structured names are atomic; text-only credits use explicit list separators, not name punctuation.
test("legacy and display credits split explicit lists without inventing artist IDs", async (t) => {
  const songs = [
    song("legacy", { artist: "CLEVER CLOVER; 望月杏奈；島原エレナ、箱崎星梨花\nロコ", artistId: "joined" }),
    song("display", { artist: "", artistId: "", displayArtist: "A / B feat. C & D, E・F", artists: [] }),
    song("atomic", { artist: "ignored; legacy", artists: [{ id: "band", name: "Earth, Wind & Fire" }, { id: "acdc", name: "AC/DC" }, { id: "unit", name: "A; B" }] }),
    song("punctuation", { artist: "Earth, Wind & Fire / AC/DC feat. A・B", artistId: "band" }),
  ];
  const f = await fixture(t, { handler: () => ({ searchResult3: { song: songs } }) });
  await f.plugin.signIn();
  const result = await f.plugin.search({ query: "credits", kind: "tracks" });
  assert.deepEqual(credits(result.tracks[0].artists), [["", "CLEVER CLOVER"], ["", "望月杏奈"], ["", "島原エレナ"], ["", "箱崎星梨花"], ["", "ロコ"]]);
  assert.deepEqual(credits(result.tracks[1].artists), [["", "A / B feat. C & D, E・F"]]);
  assert.deepEqual(credits(result.tracks[2].artists), [["band", "Earth, Wind & Fire"], ["acdc", "AC/DC"], ["unit", "A; B"]]);
  assert.deepEqual(credits(result.tracks[3].artists), [["band", "Earth, Wind & Fire / AC/DC feat. A・B"]]);
});

// A song's album credits must not be overwritten by its featured track performers.
test("search, favorites and playlists distinguish album artists from track contributors", async (t) => {
  const tracks = [
    song("one", { artists: [{ id: "solo", name: "Solo" }], albumArtists: [{ id: "group", name: "Group" }], contributors: [{ role: "conductor", artist: { id: "conductor", name: "指揮者" } }] }),
    song("two", { artists: [{ id: "solo", name: "Solo" }], displayAlbumArtist: "Album group; Guest group" }),
    song("three", { artists: [{ id: "solo", name: "Solo" }] }),
  ];
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getPlaylist") return { playlist: { id: "p", entry: tracks } };
    if (method === "getStarred2") return { starred2: { song: tracks } };
    return { searchResult3: { song: tracks } };
  } });
  await f.plugin.signIn();
  const results = [await f.plugin.search({ query: "credits", kind: "tracks" }), await f.plugin.liked(), await f.plugin.playlist({ id: "p" })];
  for (const result of results) {
    const songs = result.tracks || result.playlist.tracks;
    assert.deepEqual(credits(songs[0].artists), [["solo", "Solo"], ["conductor", "指揮者"]]);
    assert.deepEqual(credits(songs[0].album.artists), [["group", "Group"]]);
    assert.deepEqual(credits(songs[1].album.artists), [["", "Album group"], ["", "Guest group"]]);
    assert.deepEqual(credits(songs[2].album.artists), [["solo", "Solo"]]);
  }
});

// Duplicate roles share one credit, but homonymous server identities remain separate.
test("credits deduplicate IDs and normalized names while retaining distinct artist identities", async (t) => {
  const track = song("one", {
    artist: "unused legacy", artists: [{ name: " ÉFFY " }, { id: "first", name: "Same Name" }, { id: "second", name: "Same Name" }],
    contributors: [
      { role: "composer", artist: { id: "effy/+&", name: "ÉFFY", coverArt: "effy-art" } },
      { role: "arranger", artist: { id: "effy/+&", name: "ÉFFY" } },
      { role: "performer", subRole: "Piano", artist: { name: "éffy" } },
      { role: "custom TIPL role", artist: { name: " Session   Player " } },
      { role: "violin", artist: { name: "session player" } },
      { role: "producer", artist: { name: "same name" } },
    ],
  });
  const f = await fixture(t, { handler: ({ method }) => method === "getArtist" ? { artist: { id: "effy/+&", name: "ÉFFY" } } : { searchResult3: { song: [track] } } });
  await f.plugin.signIn();
  const result = await f.plugin.search({ query: "credits", kind: "tracks" });
  assert.deepEqual(credits(result.tracks[0].artists), [["effy/+&", "ÉFFY"], ["first", "Same Name"], ["second", "Same Name"], ["", "Session   Player"]]);
  assert.equal(new URL(result.tracks[0].artists[0].imageUrl).searchParams.get("id"), "effy-art");
  await f.plugin.artist({ id: result.tracks[0].artists[0].id });
  assert.equal(f.calls.findLast(({ method }) => method === "getArtist").params.get("id"), "effy/+&");
});

// Older servers omit credits and partial OpenSubsonic lists can contain empty entries.
test("empty and partial credits keep legacy fallbacks without blank artists", async (t) => {
  const tracks = [
    song("one", { artists: [null, {}, { name: "  " }], contributors: [null, {}, { artist: null }, { artist: {} }, { artist: { name: " Named performer " } }] }),
    song("two", { artist: "", artistId: "", artists: [], contributors: [] }),
    song("three", { artist: "", displayArtist: " ; Display A；Display B; ", artists: [] }),
  ];
  const f = await fixture(t, { handler: () => ({ searchResult3: { song: tracks } }) });
  await f.plugin.signIn();
  const result = await f.plugin.search({ query: "credits", kind: "tracks" });
  assert.deepEqual(credits(result.tracks[0].artists), [["ar1", "Artist"], ["", "Named performer"]]);
  assert.deepEqual(credits(result.tracks[1].artists), []);
  assert.deepEqual(credits(result.tracks[2].artists), [["", "Display A"], ["", "Display B"]]);
});

// Shared album mapping applies to shelves, browsing, search, favorites and artist pages.
test("album entrypoints preserve contributor credits without extra metadata requests", async (t) => {
  const album = { id: "album", name: "MILLION", artists: [{ id: "group", name: "CLEVER CLOVER" }], contributors: [{ role: "performer", artist: { id: "singer", name: "望月杏奈" } }] };
  const f = await fixture(t, { handler: ({ method }) => {
    if (method === "getArtist") return { artist: { id: "group", name: "CLEVER CLOVER", album: [album] } };
    if (method === "getStarred2") return { starred2: { album: [album] } };
    if (method === "search3") return { searchResult3: { album: [album] } };
    return { albumList2: { album: [album] } };
  } });
  await f.plugin.signIn();
  const albums = [
    ...(await f.plugin.home()).sections.flatMap((section) => section.albums),
    ...(await f.plugin.browse({ page: "albums:newest:0" })).sections.flatMap((section) => section.albums),
    ...(await f.plugin.search({ query: "MILLION", kind: "albums" })).albums,
    ...(await f.plugin.savedAlbums()).albums,
    ...(await f.plugin.artist({ id: "group" })).albums,
  ];
  for (const item of albums) assert.deepEqual(credits(item.artists), [["group", "CLEVER CLOVER"], ["singer", "望月杏奈"]]);
  assert.ok(f.calls.every(({ method }) => method !== "getAlbum"));
});

// Track-level albumArtist metadata can fill gaps in an incomplete album response.
test("album details aggregate explicit track album artists and omit blank fallback names", async (t) => {
  const album = { id: "album", name: "Title", song: [
    song("one", { artist: "", artistId: "", albumArtists: [{ id: "group", name: "Group" }], contributors: [{ role: "performer", artist: { id: "solo", name: "Solo" } }] }),
    song("two", { artist: "", artists: [], displayAlbumArtist: "Guest A; Guest B", contributors: [] }),
  ] };
  const f = await fixture(t, { handler: () => ({ album }) });
  await f.plugin.signIn();
  const result = await f.plugin.album({ id: "album" });
  assert.deepEqual(credits(result.album.artists), [["group", "Group"], ["solo", "Solo"], ["", "Guest A"], ["", "Guest B"]]);
  assert.deepEqual(credits(result.tracks[0].artists), [["solo", "Solo"]]);
  assert.deepEqual(credits(result.tracks[1].artists), []);
});

// An album-wide name collision must be resolved before assigning identities or order.
test("album identity resolution considers homonymous artists on later tracks", async (t) => {
  const album = { id: "album", song: [
    song("one", { artists: [{ name: "X" }, { id: "b", name: "B" }, { id: "x1", name: "X" }] }),
    song("two", { artists: [{ id: "x2", name: "X" }] }),
  ] };
  const f = await fixture(t, { handler: () => ({ album }) });
  await f.plugin.signIn();
  const result = await f.plugin.album({ id: "album" });
  assert.deepEqual(credits(result.album.artists), [["b", "B"], ["x1", "X"], ["x2", "X"]]);
  assert.deepEqual(credits(result.tracks[0].artists), [["x1", "X"], ["b", "B"]]);
});
