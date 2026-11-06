import type { Album, Artist, Configuration, Playlist, ReleaseDate, SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong, Track } from "./types.js";
import { mediaURL } from "./client.js";

export const array = <T>(value: T[] | undefined): T[] => Array.isArray(value) ? value : [];
const art = (config: Configuration, id?: string): string | undefined => id ? mediaURL(config, "getCoverArt", { id, size: 600 }) : undefined;

function releaseDate(date?: ReleaseDate): string | undefined {
  if (!date?.year) return undefined;
  return [String(date.year), ...(date.month ? [String(date.month).padStart(2, "0")] : []), ...(date.month && date.day ? [String(date.day).padStart(2, "0")] : [])].join("-");
}

export function toArtist(config: Configuration, item: SubsonicArtist): Artist {
  // Ignore arbitrary external artistImageUrl values: use the configured server
  // for authenticated images, not third-party tracking URLs.
  return { id: String(item.id ?? ""), name: item.name || item.artist || "", imageUrl: art(config, item.coverArt), following: Boolean(item.starred) };
}

function artistsOf(config: Configuration, item: SubsonicAlbum): Artist[] {
  if (array(item.artists).length) return array(item.artists).map((artist) => toArtist(config, artist));
  return item.artist ? [{ id: String(item.artistId ?? ""), name: item.artist }] : [];
}

export function toAlbum(config: Configuration, item: SubsonicAlbum): Album {
  return {
    id: String(item.id ?? ""), name: item.name || item.album || "", imageUrl: art(config, item.coverArt), artists: artistsOf(config, item),
    released: releaseDate(item.originalReleaseDate) || releaseDate(item.releaseDate) || (item.year ? String(item.year) : undefined), saved: Boolean(item.starred),
  };
}

export function toTrack(config: Configuration, item: SubsonicSong): Track {
  return {
    id: String(item.id), name: item.title || item.name || "", artists: artistsOf(config, item),
    album: toAlbum(config, { id: item.albumId, name: item.album, coverArt: item.coverArt, artist: item.artist, artistId: item.artistId, year: item.year }),
    duration: Math.round(Number(item.duration || 0) * 1000), unavailable: Boolean(item.isVideo),
  };
}

export function toPlaylist(config: Configuration, item: SubsonicPlaylist): Playlist {
  return {
    id: String(item.id), name: item.name || "", imageUrl: art(config, item.coverArt), description: item.comment,
    owner: item.owner, mine: item.owner === config.username, trackCount: Number(item.songCount ?? array(item.entry).length),
  };
}

export function toPlaylistDetails(config: Configuration, item: SubsonicPlaylist): Playlist {
  return { ...toPlaylist(config, item), tracks: array(item.entry).map((track) => toTrack(config, track)) };
}
