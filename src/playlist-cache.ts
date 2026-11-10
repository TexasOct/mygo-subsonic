import type { Configuration, SubsonicResponse } from "./types.js";
import { MemoryCache } from "./cache.js";
import { assertCurrent, connectionKey } from "./config.js";
import { request } from "./client.js";
import { fail, t } from "./errors.js";

// One short-lived, bounded cache for raw list/detail data, never mapped URLs.
const metadata = new MemoryCache(30000, 33, 4 * 1024 * 1024);
let scope = "";
export function invalidatePlaylistCache(): void { metadata.clear(); }

export async function playlistData(config: Configuration, id?: string): Promise<SubsonicResponse> {
  assertCurrent(config);
  const current = JSON.stringify([config.epoch, connectionKey(config)]);
  if (current !== scope) { metadata.clear(); scope = current; }
  const deadline = Date.now() + 25000;
  // A cache hit must still establish a route after VM restart and refresh an
  // expired selection. Share one deadline with a possible metadata request.
  await request(config, "ping", {}, { deadline });
  const key = JSON.stringify([id === undefined ? "list" : "detail", id]);
  const load = metadata.load(key, async () => {
    const response = await request(config, id === undefined ? "getPlaylists" : "getPlaylist", id === undefined ? {} : { id }, { deadline });
    if (id !== undefined && !response.playlist) throw fail("unavailable", t("This playlist is no longer available on the server. Reload your playlists."));
    if (id === undefined && response.playlists?.playlist !== undefined && !Array.isArray(response.playlists.playlist)) {
      throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
    }
    return JSON.stringify(response);
  });
  // A waiter may have spent longer probing than the owner of a shared load.
  // Bound its own wait without cancelling a request needed by other callers.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      load,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(fail("network", t("Could not connect to Subsonic. Check the server address, network and HTTPS certificate."))), Math.max(0, deadline - Date.now()));
      }),
    ]);
    assertCurrent(config); // Hits and coalesced waiters must validate, too.
    try {
      const response: SubsonicResponse = JSON.parse(raw);
      return response;
    } catch {
      metadata.clear();
      throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
    }
  } finally { clearTimeout(timer); }
}
