import type { Browse, Configuration, SearchResult, Section, SubsonicAlbum } from "./types.js";
import { signedConfiguration } from "./config.js";
import { request } from "./client.js";
import { fail, t } from "./errors.js";
import { array, toAlbum, toArtist, toPlaylist, toTrack } from "./mappers.js";
import { folder, identifier, offsetOf, pageOf, PAGE_SIZE } from "./paging.js";

const ALBUM_TYPES = new Set(["newest", "recent", "frequent", "alphabeticalByName", "alphabeticalByArtist"]);
// Browse grids are virtualized by the host, but cannot append remote pages.
// Larger bounded batches reduce navigation without loading the whole library.
const ALBUM_PAGE_SIZE = 200;
async function albumList(config: Configuration, type: string, offset = 0, size = ALBUM_PAGE_SIZE + 1): Promise<SubsonicAlbum[]> {
  const response = await request(config, "getAlbumList2", { type, size, offset, ...folder(config) });
  return array(response.albumList2?.album);
}

export async function home(): Promise<Browse> {
  const config = signedConfiguration();
  const [newest, recent, random] = await Promise.all([
    albumList(config, "newest", 0, 12), albumList(config, "recent", 0, 12), albumList(config, "random", 0, 12),
  ]);
  return {
    title: "Subsonic",
    sections: [
      { title: t("Recently added"), albums: newest.map((item) => toAlbum(config, item)), morePage: "albums:newest:0" },
      { title: t("Recently played albums"), albums: recent.map((item) => toAlbum(config, item)), morePage: "albums:recent:0" },
      { title: t("Rediscover"), albums: random.map((item) => toAlbum(config, item)) },
    ],
  };
}

export async function browse({ page }: { page: string }): Promise<Browse> {
  const config = signedConfiguration();
  const parts = String(page).split(":");
  if (parts[0] === "albums" && parts.length === 3 && parts[1] && ALBUM_TYPES.has(parts[1])) {
    const offset = offsetOf(Number(parts[2]));
    const items = await albumList(config, parts[1], offset);
    const visible = items.slice(0, ALBUM_PAGE_SIZE);
    const sections: Section[] = [{ albums: visible.map((item) => toAlbum(config, item)) }];
    // MorePage renders the host's compact section action. Links render cover
    // cards and must not be used as pagination controls.
    if (items.length > ALBUM_PAGE_SIZE) sections.push({ title: t("Next page"), morePage: `albums:${parts[1]}:${offset + visible.length}` });
    return { title: t("Albums"), subtitle: visible.length ? `${offset + 1}–${offset + visible.length}` : "", sections };
  }
  if (parts[0] === "artists" && parts.length === 2) {
    const offset = offsetOf(Number(parts[1]));
    const response = await request(config, "getArtists", folder(config));
    const items = array(response.artists?.index).flatMap((index) => array(index.artist));
    // getArtists already returns the whole index. Let the host virtualize it
    // rather than making users navigate artificial client-side pages.
    // Nonzero offsets keep previously opened continuation links usable.
    return { title: t("Artists"), sections: [{ artists: items.slice(offset).map((item) => toArtist(config, item)) }] };
  }
  throw fail("unavailable", t("This page does not exist."));
}

export async function search({ query, kind, offset = 0 }: { query: string; kind: string; offset?: number }): Promise<SearchResult> {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  if (kind === "playlists") {
    const response = await request(config, "getPlaylists");
    const needle = query.trim().toLowerCase();
    const result = pageOf(array(response.playlists?.playlist).filter((item) => item.name?.toLowerCase().includes(needle)), offset);
    return { playlists: result.items.map((item) => toPlaylist(config, item)), more: result.more };
  }
  if (!["tracks", "albums", "artists"].includes(kind)) return { more: false };
  if (!query.trim()) return { more: false };
  let field = "artist";
  if (kind === "tracks") field = "song";
  else if (kind === "albums") field = "album";
  const response = await request(config, "search3", {
    query, songCount: 0, albumCount: 0, artistCount: 0, [`${field}Count`]: PAGE_SIZE + 1, [`${field}Offset`]: offset, ...folder(config),
  });
  const result = response.searchResult3;
  if (kind === "tracks") {
    const items = array(result?.song);
    return { tracks: items.slice(0, PAGE_SIZE).map((item) => toTrack(config, item)), more: items.length > PAGE_SIZE };
  }
  if (kind === "albums") {
    const items = array(result?.album);
    return { albums: items.slice(0, PAGE_SIZE).map((item) => toAlbum(config, item)), more: items.length > PAGE_SIZE };
  }
  const items = array(result?.artist);
  return { artists: items.slice(0, PAGE_SIZE).map((item) => toArtist(config, item)), more: items.length > PAGE_SIZE };
}

export async function album({ id }: { id: string }) {
  const config = signedConfiguration();
  const response = await request(config, "getAlbum", { id: identifier(id) });
  if (!response.album) throw fail("unavailable", t("The requested item was not found on the server."));
  return { album: toAlbum(config, response.album), tracks: array(response.album.song).map((item) => toTrack(config, item)) };
}

export async function artist({ id }: { id: string }) {
  const config = signedConfiguration();
  const response = await request(config, "getArtist", { id: identifier(id) });
  if (!response.artist) throw fail("unavailable", t("The requested item was not found on the server."));
  // Do not require the optional getTopSongs endpoint to open an artist page.
  return { artist: toArtist(config, response.artist), albums: array(response.artist.album).map((item) => toAlbum(config, item)), tracks: [] };
}
