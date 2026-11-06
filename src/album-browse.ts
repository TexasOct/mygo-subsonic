import type { Album, Browse, Configuration, Section, SubsonicAlbum } from "./types.js";
import { assertCurrent } from "./config.js";
import { request } from "./client.js";
import { fail, PluginError, t } from "./errors.js";
import { array, toAlbum } from "./mappers.js";
import { folder } from "./paging.js";

// The host virtualizes a returned grid, but cannot append to it while scrolling.
// Collect metadata only; leave artwork downloads to visible host rows.
const BATCH_SIZE = 500;
const MAX_ALBUMS = 5000;
const LOAD_BUDGET_MS = 8000;

export async function browseAlbums(config: Configuration, type: string, offset: number): Promise<Browse> {
  const deadline = Date.now() + LOAD_BUDGET_MS;
  const albums: Album[] = [];
  const seen = new Set<string>();
  let next = offset;
  let more = false;
  while (true) {
    if (Date.now() >= deadline) { more = true; break; }
    // A one-item probe avoids an empty continuation at an exact 5,000 boundary.
    const size = albums.length >= MAX_ALBUMS ? 1 : Math.min(BATCH_SIZE, MAX_ALBUMS - albums.length);
    let batch: SubsonicAlbum[];
    try {
      const response = await request(config, "getAlbumList2", { type, size, offset: next, ...folder(config) }, { deadline });
      const list = response.albumList2;
      if (!list || typeof list !== "object" || Array.isArray(list) || (list.album !== undefined && !Array.isArray(list.album))) {
        throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
      }
      batch = array(list.album);
      if (batch.length > size) throw fail("server", t("The server returned more albums than requested. Check its Subsonic paging support."));
    } catch (error) {
      // Keep useful results on a slow connection, but never hide auth, protocol
      // or changed-account errors behind a partially loaded library.
      assertCurrent(config);
      if (!albums.length || !(error instanceof PluginError) || error.code !== "network") throw error;
      more = true;
      break;
    }
    if (albums.length >= MAX_ALBUMS) { more = batch.length > 0; break; }
    if (!batch.length) break;
    if (batch.some((item) => !item.id)) throw fail("server", t("The server returned an album without an ID. Check its Subsonic API support."));
    const unseen = batch.filter((item) => !seen.has(String(item.id)));
    if (!unseen.length) throw fail("server", t("The server keeps returning the same albums. Check its Subsonic paging support."));
    for (const item of unseen) {
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      albums.push(toAlbum(config, item));
    }
    // Advance by consumed server entries, not deduplicated visible entries.
    next += batch.length;
    if (batch.length < size) break;
  }
  assertCurrent(config);
  const sections: Section[] = [{ albums }];
  // Usually absent. "Remaining albums / See All" uses the host action's real
  // meaning instead of pairing "Next page" with an unrelated "See All" label.
  if (more) sections.push({ title: t("Remaining albums"), morePage: `albums:${type}:${next}` });
  let subtitle = t("{count} albums").replace("{count}", String(albums.length));
  if (more) subtitle = t("{count} albums loaded").replace("{count}", String(albums.length));
  else if (offset && albums.length) subtitle = t("Albums {start}–{end}").replace("{start}", String(offset + 1)).replace("{end}", String(next));
  return { title: t("Albums"), subtitle, sections };
}
