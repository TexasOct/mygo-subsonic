import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

// Song IDs repeat, so removing by position must include every matching entry.
test("playlist removal sends original descending indices for duplicate song IDs", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlist: { id: "p", owner: "listener", entry: [song("a"), song("b"), song("a"), song("c")] } }) });
  await f.plugin.signIn();
  await f.plugin.removeFromPlaylist({ id: "p", trackIds: ["a"] });
  assert.equal(f.calls.at(-1).method, "updatePlaylist");
  assert.deepEqual(f.calls.at(-1).params.getAll("songIndexToRemove"), ["2", "0"]);
  assert.equal(f.calls.at(-1).params.get("playlistId"), "p");
});

// Reordering preserves duplicate entries and updates the original playlist ID.
test("moving a playlist track replaces the ordered IDs without recreating the playlist", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlist: { id: "p", owner: "listener", entry: [song("a"), song("b"), song("a")] } }) });
  await f.plugin.signIn();
  await f.plugin.movePlaylistTrack({ id: "p", from: 0, to: 1 });
  const call = f.calls.at(-1);
  assert.equal(call.method, "createPlaylist");
  assert.equal(call.params.get("playlistId"), "p");
  assert.deepEqual(call.params.getAll("songId"), ["b", "a", "a"]);
  await assert.rejects(f.plugin.movePlaylistTrack({ id: "p", from: 4, to: 0 }), { code: "unavailable" });
});

// Concurrent edits must read the result of the preceding edit, not stale entries.
test("local playlist edits serialize and rejected edits do not poison the queue", async (t) => {
  let entries = ["a", "b", "c"];
  const f = await fixture(t, { handler: ({ method, params }) => {
    if (method === "getPlaylist") return { playlist: { id: "p", owner: "listener", entry: entries.map((id) => song(id)) } };
    if (method === "createPlaylist") entries = params.getAll("songId");
    return {};
  } });
  await f.plugin.signIn();
  await Promise.all([
    f.plugin.movePlaylistTrack({ id: "p", from: 0, to: 2 }),
    f.plugin.movePlaylistTrack({ id: "p", from: 0, to: 1 }),
  ]);
  assert.deepEqual(entries, ["c", "b", "a"]);
  await assert.rejects(f.plugin.movePlaylistTrack({ id: "p", from: -1, to: 0 }));
  await f.plugin.renamePlaylist({ id: "p", name: "New & name" });
  assert.equal(f.calls.at(-1).params.get("name"), "New & name");
});

// Read-only public playlists must never expose successful local write actions.
test("non-owner playlist writes are blocked before any mutation", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlist: { id: "p", owner: "somebody-else", entry: [] } }) });
  await f.plugin.signIn();
  const result = await f.plugin.playlist({ id: "p" });
  assert.equal(result.mine, false);
  await assert.rejects(f.plugin.addToPlaylist({ id: "p", trackIds: ["a"] }), { code: "unavailable" });
  await assert.rejects(f.plugin.deletePlaylist({ id: "p" }), { code: "unavailable" });
  assert.equal(f.calls.some((call) => ["deletePlaylist", "updatePlaylist"].includes(call.method)), false);
});

// Creation, add and rename keep literal names and repeated IDs correctly encoded.
test("playlist CRUD maps API payloads and returned tracks", async (t) => {
  const f = await fixture(t, { handler: () => ({ playlist: { id: "p", name: "Name", owner: "listener", songCount: 1, entry: [song("s")] }, playlists: { playlist: [{ id: "p", name: "Name", owner: "listener" }] } }) });
  await f.plugin.signIn();
  assert.equal((await f.plugin.createPlaylist({ name: "Name" })).mine, true);
  assert.equal((await f.plugin.playlist({ id: "p" })).tracks[0].duration, 123456);
  assert.equal((await f.plugin.playlists()).length, 1);
  await f.plugin.addToPlaylist({ id: "p", trackIds: ["s&1", "s+2"] });
  assert.deepEqual(f.calls.at(-1).params.getAll("songIdToAdd"), ["s&1", "s+2"]);
  await f.plugin.deletePlaylist({ id: "p" });
  assert.equal(f.calls.at(-1).method, "deletePlaylist");
});
