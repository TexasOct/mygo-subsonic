import type { Configuration, SubsonicPlaylist } from "./types.js";
import { assertCurrent, connectionKey, signedConfiguration } from "./config.js";
import { invalidateCoverURLs, request } from "./client.js";
import { invalidatePlaylistCache, playlistData } from "./playlist-cache.js";
import { fail, t } from "./errors.js";
import { array, toPlaylist, toPlaylistDetails } from "./mappers.js";
import { identifier } from "./paging.js";

export async function playlists() {
  const config = signedConfiguration();
  const response = await playlistData(config);
  return array(response.playlists?.playlist).map((item) => toPlaylist(config, item));
}
export async function playlist({ id }: { id: string }) {
  const config = signedConfiguration();
  const response = await playlistData(config, identifier(id));
  if (!response.playlist) throw fail("unavailable", t("This playlist is no longer available on the server. Reload your playlists."));
  return toPlaylistDetails(config, response.playlist);
}
export async function createPlaylist({ name }: { name: string }) {
  const config = signedConfiguration();
  if (!name.trim()) throw fail("unavailable", t("Enter a name for the playlist."));
  const response = await playlistWrite(() => request(config, "createPlaylist", { name }));
  if (!response.playlist) throw fail("server", t("The server did not return the new playlist. Reload your playlists before trying to create it again."));
  return toPlaylistDetails(config, response.playlist);
}

async function playlistWrite<T>(write: () => T | Promise<T>): Promise<T> {
  const invalidate = () => { invalidatePlaylistCache(); invalidateCoverURLs(); };
  invalidate();
  try { return await write(); }
  // Invalidate even on an ambiguous transport failure, and fence reads that
  // began before or during the write so they cannot refill the new cache.
  finally { invalidate(); }
}

// Serialize local read/modify/write by server, account and playlist. External
// clients can still race: Subsonic has no conditional playlist update API.
const edits = new Map<string, Promise<unknown>>();
function editPlaylist(id: string, change: (config: Configuration, item: SubsonicPlaylist) => Promise<unknown> | undefined, original = signedConfiguration()): Promise<unknown> {
  id = identifier(id);
  const key = connectionKey(original);
  const lock = `${key}:${id}`;
  const previous = edits.get(lock) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    assertCurrent(original);
    const response = await request(original, "getPlaylist", { id });
    const playlist = response.playlist;
    if (!playlist || playlist.owner !== original.username) throw fail("unavailable", t("You can only edit playlists created by your account."));
    return playlistWrite(() => change(original, playlist));
  });
  edits.set(lock, next);
  // Handle the cleanup promise too; failed edits must not leak rejections.
  void next.finally(() => { if (edits.get(lock) === next) edits.delete(lock); }).catch(() => {});
  return next;
}

export function renamePlaylist({ id, name }: { id: string; name: string }) {
  if (!name.trim()) throw fail("unavailable", t("Enter a name for the playlist."));
  return editPlaylist(id, (config, item) => request(config, "updatePlaylist", { playlistId: item.id, name }));
}
export function deletePlaylist({ id }: { id: string }) {
  return editPlaylist(id, (config, item) => request(config, "deletePlaylist", { id: item.id }));
}
export function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  const original = signedConfiguration();
  const tracks = trackIds.map(identifier);
  return editPlaylist(id, (config, item) => tracks.length ? request(config, "updatePlaylist", { playlistId: item.id, songIdToAdd: tracks }) : undefined, original);
}
export function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  const original = signedConfiguration();
  const remove = new Set(trackIds.map(identifier));
  return editPlaylist(id, (config, item) => {
    // MyGo passes IDs, not positions. Remove all matching occurrences with
    // positions from the same snapshot, descending for sequential servers.
    const entries = array(item.entry);
    const indices: number[] = [];
    for (let index = entries.length - 1; index >= 0; index--) {
      const track = entries[index];
      if (track && remove.has(String(track.id))) indices.push(index);
    }
    return indices.length ? request(config, "updatePlaylist", { playlistId: item.id, songIndexToRemove: indices }) : undefined;
  }, original);
}
export function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }) {
  return editPlaylist(id, async (config, item) => {
    const tracks = array(item.entry).map((track) => String(track.id));
    if (![from, to].every((position) => Number.isInteger(position) && position >= 0 && position < tracks.length)) throw fail("unavailable", t("This track's position changed. Reload the playlist and try again."));
    if (from === to) return;
    const [moved] = tracks.splice(from, 1);
    if (moved === undefined) return;
    tracks.splice(to, 0, moved);
    // Replace entries in-place, preserving duplicates, playlist ID and metadata.
    await request(config, "createPlaylist", { playlistId: item.id, songId: tracks });
  });
}
