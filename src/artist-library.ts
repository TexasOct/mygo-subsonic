import type { Album, Artist, Browse, Configuration, Section, SubsonicArtist, SubsonicResponse, SubsonicSong } from "./types.js";
import { assertCurrent } from "./config.js";
import { request } from "./client.js";
import { creditsOf, mergeCredits } from "./credits.js";
import { fail, PluginError, t } from "./errors.js";
import { array, toAlbum, toArtist, toTrack } from "./mappers.js";
import { folder } from "./paging.js";

const BATCH_SIZE = 500;
const MAX_ENTRIES = 5000;
const LOAD_BUDGET_MS = 8000;

// Older Subsonic implementations may not support an empty-query catalogue or
// search3 at all. Optional enrichment must not break their existing artist pages.
function unsupportedSearch(config: Configuration, error: unknown): boolean {
  assertCurrent(config);
  return error instanceof PluginError && (error.code === "unsupported"
    || [10, 20, 30].includes(error.subsonicCode ?? -1) || [404, 405, 501].includes(error.httpStatus ?? -1));
}

function searchResult(response: SubsonicResponse) {
  const result = response.searchResult3;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
  }
  return result;
}

export async function browseArtists(config: Configuration, offset: number, source: "index" | "catalog" = "index"): Promise<Browse> {
  const deadline = Date.now() + LOAD_BUDGET_MS;
  // Read the same legacy index on continuation pages so that an album artist
  // already shown there never reappears as a later catalogue-only participant.
  const response = await request(config, "getArtists", folder(config), { deadline });
  const indexed = array(response.artists?.index).flatMap((index) => array(index.artist)).map((item) => toArtist(config, item));
  const indexedIds = new Set(indexed.map((artist) => artist.id));
  let artists: Artist[] = source === "index" ? indexed : [];
  // Navidrome's getArtists filters albumartist, whereas search3's artist
  // catalogue includes track artists and participants of other roles as well.
  const seen = new Set<string>();
  let next = source === "catalog" ? offset : 0;
  let more = false;
  let consumed = 0;
  while (true) {
    if (Date.now() >= deadline) { more = true; break; }
    const count = consumed >= MAX_ENTRIES ? 1 : Math.min(BATCH_SIZE, MAX_ENTRIES - consumed);
    let batch: SubsonicArtist[];
    try {
      const response = await request(config, "search3", {
        query: '""', artistCount: count, artistOffset: next, albumCount: 0, songCount: 0, ...folder(config),
      }, { deadline });
      const items = searchResult(response).artist;
      if (items !== undefined && !Array.isArray(items)) throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
      batch = array(items);
    } catch (error) {
      if (unsupportedSearch(config, error)) break;
      if (!(error instanceof PluginError) || error.code !== "network") throw error;
      // A failed optional request is not evidence that there are no more artists.
      more = true;
      break;
    }
    if (batch.length > count) throw fail("server", t("The server returned more artists than requested. Check its Subsonic paging support."));
    if (consumed >= MAX_ENTRIES) { more = batch.length > 0; break; }
    if (!batch.length) break;
    if (batch.some((item) => !item?.id)) throw fail("server", t("The server returned an artist without an ID. Check its Subsonic API support."));
    const fresh = batch.filter((item) => !seen.has(String(item.id)));
    if (!fresh.length) throw fail("server", t("The server keeps returning the same artists. Check its Subsonic paging support."));
    for (const item of fresh) {
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!indexedIds.has(id)) artists.push(toArtist(config, item));
    }
    next += batch.length;
    consumed += batch.length;
    if (batch.length < count) break;
  }
  assertCurrent(config);
  artists = mergeCredits(artists);
  const sections: Section[] = [{ artists: source === "catalog" ? artists : artists.slice(offset) }];
  if (more) sections.push({ title: t("Additional artists"), morePage: `artists:catalog:${next}` });
  return { title: t("Artists"), sections };
}

function creditsArtist(config: Configuration, song: SubsonicSong, artist: Artist): boolean {
  const credits = mergeCredits(creditsOf(config, song), creditsOf(config, { artists: song.albumArtists, displayArtist: song.displayAlbumArtist }));
  // The name only selects candidates. A navigable person's server ID must
  // actually be credited: name-only homonyms and title matches are not proof.
  return Boolean(artist.id) && credits.some((credit) => credit.id === artist.id);
}

export async function artistAlbums(config: Configuration, item: SubsonicArtist, deadline: number): Promise<Album[]> {
  const albums = new Map<string, Album>();
  for (const album of array(item.album)) {
    if (album.id && !albums.has(String(album.id))) albums.set(String(album.id), toAlbum(config, album));
  }
  const artist = toArtist(config, item);
  if (!artist.name) return [...albums.values()];
  const authoritative = [...albums.values()];
  const seen = new Set<string>();
  let offset = 0;
  while (true) {
    if (Date.now() >= deadline) {
      assertCurrent(config);
      if (!offset && authoritative.length) return authoritative;
      throw fail("network", t("Artist contributions could not be fully loaded. Try again or search for a specific album."));
    }
    const count = offset >= MAX_ENTRIES ? 1 : Math.min(BATCH_SIZE, MAX_ENTRIES - offset);
    let batch: SubsonicSong[];
    try {
      const response = await request(config, "search3", {
        query: artist.name, songCount: count, songOffset: offset, artistCount: 0, albumCount: 0, ...folder(config),
      }, { deadline });
      const songs = searchResult(response).song;
      if (songs !== undefined && !Array.isArray(songs)) throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
      batch = array(songs);
    } catch (error) {
      if (unsupportedSearch(config, error)) return authoritative;
      // An existing server discography stays usable if the first optional call
      // is offline, but a failed lookup must never become a false empty page
      // or a seemingly complete collection assembled from only a few batches.
      if (!offset && authoritative.length && error instanceof PluginError && error.code === "network") return authoritative;
      throw error;
    }
    if (batch.length > count) throw fail("server", t("The server returned more songs than requested. Check its Subsonic paging support."));
    // The native artist page has no continuation interface. Never silently show
    // a truncated discography as complete when a query exceeds our call budget.
    if (offset >= MAX_ENTRIES && batch.length) throw fail("unavailable", t("There are too many artist search matches. Search for a specific album instead."));
    if (!batch.length) break;
    if (batch.some((song) => !song?.id)) throw fail("server", t("The server returned a song without an ID. Check its Subsonic API support."));
    if (!batch.some((song) => !seen.has(String(song.id)))) throw fail("server", t("The server keeps returning the same songs. Check its Subsonic paging support."));
    for (const song of batch) {
      if (seen.has(String(song.id))) continue;
      seen.add(String(song.id));
      if (!song.albumId || !creditsArtist(config, song, artist)) continue;
      const album = toTrack(config, song).album;
      if (!albums.has(album.id)) albums.set(album.id, album);
    }
    offset += batch.length;
    if (batch.length < count) break;
  }
  assertCurrent(config);
  return [...albums.values()];
}
