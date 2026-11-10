import { signedConfiguration } from "./config.js";
import { request } from "./client.js";
import { invalidatePlaylistCache } from "./playlist-cache.js";
import { array, toAlbum, toTrack } from "./mappers.js";
import { folder, identifier, offsetOf, pageOf } from "./paging.js";
import type { Configuration } from "./types.js";

async function starred(config: Configuration) {
  return (await request(config, "getStarred2", folder(config))).starred2 || {};
}

export async function liked({ offset = 0 }: { offset?: number } = {}) {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  const result = pageOf(array((await starred(config)).song), offset);
  return { tracks: result.items.map((item) => toTrack(config, item)), more: result.more };
}

export async function isLiked({ ids }: { ids: string[] }): Promise<Record<string, boolean>> {
  const config = signedConfiguration();
  const validated = ids.map(identifier);
  const liked = new Set(array((await starred(config)).song).map((item) => String(item.id)));
  return Object.fromEntries(ids.map((id, index) => [id, liked.has(validated[index] ?? "")]));
}

async function toggleStar(field: "id" | "albumId" | "artistId", id: string, on: boolean): Promise<void> {
  const config = signedConfiguration();
  try { await request(config, on ? "star" : "unstar", { [field]: identifier(id) }); }
  // Playlist tracks embed album/artist save/follow state, not just track IDs.
  finally { invalidatePlaylistCache(); }
}
export const like = ({ id, on }: { id: string; on: boolean }) => toggleStar("id", id, on);
export const saveAlbum = ({ id, on }: { id: string; on: boolean }) => toggleStar("albumId", id, on);
export const followArtist = ({ id, on }: { id: string; on: boolean }) => toggleStar("artistId", id, on);

export async function savedAlbums({ offset = 0 }: { offset?: number } = {}) {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  const result = pageOf(array((await starred(config)).album), offset);
  return { albums: result.items.map((item) => toAlbum(config, item)), more: result.more };
}

export async function played({ id }: { id: string }): Promise<void> {
  const config = signedConfiguration();
  if (!config.scrobble) return;
  await request(config, "scrobble", { id: identifier(id), submission: true });
}
