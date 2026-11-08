import type { Album, Artist, Configuration, Playlist, ReleaseDate, SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong, Track } from "./types.js";
import { mediaURL } from "./client.js";
import { artistCredit, creditsOf, mergeCredits, primaryCreditsOf } from "./credits.js";

export const array = <T>(value: T[] | undefined): T[] => Array.isArray(value) ? value : [];
const art = (config: Configuration, id?: string): string | undefined => id ? mediaURL(config, "getCoverArt", { id, size: 600 }) : undefined;

function releaseDate(date?: ReleaseDate): string | undefined {
  if (!date?.year) return undefined;
  return [String(date.year), ...(date.month ? [String(date.month).padStart(2, "0")] : []), ...(date.month && date.day ? [String(date.day).padStart(2, "0")] : [])].join("-");
}

export function toArtist(config: Configuration, item: SubsonicArtist): Artist {
  // Ignore arbitrary external artistImageUrl values: use the configured server
  // for authenticated images, not third-party tracking URLs.
  return artistCredit(config, item);
}

export function toAlbum(config: Configuration, item: SubsonicAlbum): Album {
  const tracks = array(item.song);
  const albumArtists = mergeCredits(primaryCreditsOf(config, item), ...tracks.map((track) =>
    primaryCreditsOf(config, { artists: track.albumArtists, displayArtist: track.displayAlbumArtist })));
  // Keep the album header focused on album artists. Older responses without
  // album-artist metadata may use primary track artists, but never contributors.
  const artists = albumArtists.length ? albumArtists : mergeCredits(...tracks.map((track) => primaryCreditsOf(config, track)));
  return {
    id: String(item.id ?? ""), name: item.name || item.album || "", imageUrl: art(config, item.coverArt),
    artists,
    released: releaseDate(item.originalReleaseDate) || releaseDate(item.releaseDate) || (item.year ? String(item.year) : undefined), saved: Boolean(item.starred),
  };
}

export function toTrack(config: Configuration, item: SubsonicSong, parent?: Album): Track {
  const artists = mergeCredits(creditsOf(config, item));
  const hasAlbumArtists = array(item.albumArtists).some((artist) => artist?.name?.trim() || artist?.artist?.trim());
  const hasDisplayAlbumArtist = Boolean(item.displayAlbumArtist?.trim());
  let albumArtists = item.artists;
  if (hasAlbumArtists) albumArtists = item.albumArtists;
  else if (hasDisplayAlbumArtist) albumArtists = [];
  const album = parent || toAlbum(config, {
    id: item.albumId, name: item.album, coverArt: item.coverArt, year: item.year,
    artists: albumArtists,
    artist: hasAlbumArtists || hasDisplayAlbumArtist ? item.displayAlbumArtist : item.artist,
    artistId: hasAlbumArtists || hasDisplayAlbumArtist ? undefined : item.artistId,
    displayArtist: item.displayAlbumArtist || item.displayArtist,
  });
  return {
    id: String(item.id), name: item.title || item.name || "", artists,
    album,
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
