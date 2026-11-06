// MyGo Music's injected API (upstream internal/plugin/host.go).
export interface Host {
  setting(key: string): string;
  t(text: string): string;
  signInPrompt(prompt: { text?: string; qr?: string }): void;
  crypto: { md5(text: string): string };
  storage: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
}
declare global { const host: Host; }

export interface Configuration {
  urls: string[];
  epoch: number;
  requireSession?: boolean;
  username: string;
  password: string;
  authMode: "token" | "legacy";
  folder: string;
  scrobble: boolean;
}
export interface Account { id: string; name: string }
export interface Session { key: string; account: Account }
export type Parameters = Record<string, string | number | boolean | readonly (string | number)[] | undefined>;

// Subsonic uses singular property names for arrays. Optional fields reflect
// actual omissions by older servers; IDs are opaque and never parsed.
export interface SubsonicArtist {
  id: string;
  name?: string;
  artist?: string;
  coverArt?: string;
  starred?: string;
  album?: SubsonicAlbum[];
}
export interface ReleaseDate { year?: number; month?: number; day?: number }
export interface SubsonicAlbum {
  id?: string;
  name?: string;
  album?: string;
  artist?: string;
  artistId?: string;
  artists?: SubsonicArtist[];
  coverArt?: string;
  starred?: string;
  year?: number;
  originalReleaseDate?: ReleaseDate;
  releaseDate?: ReleaseDate;
  song?: SubsonicSong[];
}
export interface SubsonicSong extends SubsonicAlbum {
  id: string;
  title?: string;
  albumId?: string;
  duration?: number;
  isVideo?: boolean;
  suffix?: string;
  contentType?: string;
  size?: number;
  bitRate?: number;
}
export interface SubsonicPlaylist {
  id: string;
  name?: string;
  coverArt?: string;
  comment?: string;
  owner?: string;
  songCount?: number;
  entry?: SubsonicSong[];
}
export interface StructuredLyrics {
  synced?: boolean;
  offset?: number;
  line?: { start?: number; value?: string }[];
}
export interface SubsonicResponse {
  status: "ok" | "failed";
  version?: string;
  openSubsonic?: boolean;
  error?: { code: number; message?: string };
  artists?: { index?: { artist?: SubsonicArtist[] }[] };
  artist?: SubsonicArtist;
  album?: SubsonicAlbum;
  song?: SubsonicSong;
  albumList2?: { album?: SubsonicAlbum[] };
  searchResult3?: { song?: SubsonicSong[]; album?: SubsonicAlbum[]; artist?: SubsonicArtist[] };
  starred2?: { song?: SubsonicSong[]; album?: SubsonicAlbum[]; artist?: SubsonicArtist[] };
  playlists?: { playlist?: SubsonicPlaylist[] };
  playlist?: SubsonicPlaylist;
  lyrics?: { value?: string };
  lyricsList?: { structuredLyrics?: StructuredLyrics[] };
}

// MyGo Music JSON models, with milliseconds rather than Subsonic's seconds.
export interface Artist { id: string; name: string; imageUrl?: string | undefined; following?: boolean }
export interface Album {
  id: string;
  name: string;
  imageUrl?: string | undefined;
  artists?: Artist[];
  released?: string | undefined;
  saved?: boolean;
}
export interface Track { id: string; name: string; artists: Artist[]; album: Album; duration: number; unavailable?: boolean }
export interface Playlist {
  id: string;
  name: string;
  imageUrl?: string | undefined;
  description?: string | undefined;
  owner?: string | undefined;
  trackCount: number;
  mine: boolean;
  tracks?: Track[];
}
export interface Section {
  title?: string;
  albums?: Album[];
  artists?: Artist[];
  morePage?: string;
}
export interface Browse { title: string; subtitle?: string; sections: Section[] }
export interface SearchResult { tracks?: Track[]; albums?: Album[]; artists?: Artist[]; playlists?: Playlist[]; more: boolean }
export interface Stream { url: string; type: "mp3" | "flac" | "ogg"; quality: "standard" | "high" | "lossless"; bitRate?: number; size?: number }
export interface Lyrics { lrc?: string; lines?: { start: number; text: string }[] }
