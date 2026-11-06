// Generated from src/*.ts by npm run build. Do not edit.
// SPDX-License-Identifier: AGPL-3.0-only

// src/errors.ts
var t = (text) => host.t(text);
var PluginError = class extends Error {
  constructor(code, message, subsonicCode, httpStatus) {
    super(message);
    this.code = code;
    this.subsonicCode = subsonicCode;
    this.httpStatus = httpStatus;
    this.name = "PluginError";
  }
};
var fail = (code, message) => new PluginError(code, message);
function apiFailure(error) {
  const code = Number(error?.code ?? 0);
  const messages = {
    10: "The server rejected a required request parameter.",
    20: "The server requires a newer Subsonic client API.",
    30: "The server must support Subsonic API 1.16.1 or newer.",
    40: "The server rejected the username or password.",
    41: "This account requires legacy authentication. Change the authentication mode in settings.",
    50: "This account does not have permission for this operation.",
    60: "The server requires an active Subsonic Premium subscription.",
    70: "The requested item was not found on the server."
  };
  let category = "server";
  if ([40, 41].includes(code)) category = "signIn";
  else if (code === 70) category = "unavailable";
  return new PluginError(category, t(messages[code] || "The Subsonic server could not complete the request."), code);
}

// src/addresses.ts
function baseURL(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw fail("setup", t("The server URL must be an absolute HTTP or HTTPS URL."));
  }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw fail("setup", t("Use an HTTP or HTTPS base URL without credentials, query parameters or a fragment."));
  }
  return url.href.replace(/\/+$/, "").replace(/\/rest$/i, "");
}
function serverAddresses(value) {
  if (!value.trim()) return [];
  const entries = value.split(/[,\r\n]+/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length || entries.length > 5) throw fail("setup", t("Enter one to five server addresses, separated by commas or newlines."));
  return [...new Set(entries.map(baseURL))];
}

// src/config.ts
var SESSION = "account";
var CONNECTION_KEYS = /* @__PURE__ */ new Set(["serverUrl", "username", "password", "authMode", "musicFolderId"]);
var epoch = 0;
function invalidateConfiguration() {
  epoch++;
}
function configuration() {
  const urls = serverAddresses(host.setting("serverUrl"));
  const username = host.setting("username").trim();
  const password = host.setting("password");
  if (!urls.length || !username || !password) throw fail("setup", t("Set the server URL, username and password in the plugin settings."));
  const authMode = host.setting("authMode").trim() || "token";
  if (authMode !== "token" && authMode !== "legacy") throw fail("setup", t("Authentication mode must be token or legacy."));
  return {
    urls,
    epoch,
    username,
    password,
    authMode,
    folder: host.setting("musicFolderId").trim(),
    scrobble: host.setting("scrobble").trim().toLowerCase() === "true"
  };
}
function connectionKey(config) {
  return host.crypto.md5(JSON.stringify([config.urls, config.username, config.password, config.authMode, config.folder]));
}
function signedConfiguration() {
  const config = configuration();
  if (host.storage.get(SESSION)?.key !== connectionKey(config)) throw fail("signIn", t("Sign in to your Subsonic server."));
  return { ...config, requireSession: true };
}
function assertCurrent(config) {
  if (config.epoch !== epoch || connectionKey(configuration()) !== connectionKey(config)) throw fail("signIn", t("Connection settings changed. Sign in again."));
  if (config.requireSession && host.storage.get(SESSION)?.key !== connectionKey(config)) throw fail("signIn", t("Sign in to your Subsonic server."));
}
function authentication(config) {
  if (config.authMode === "legacy") {
    const bytes = encodeURIComponent(config.password).replace(/%([0-9A-F]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
    return { p: `enc:${Array.from(bytes, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("")}` };
  }
  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return { t: host.crypto.md5(config.password + salt), s: salt };
}

// src/routing.ts
var active;
var pending;
var routeKey = (config) => `${config.epoch}:${connectionKey(config)}`;
var timeout = (config) => config.urls.length > 1 ? 1500 : 2e4;
var READS = /* @__PURE__ */ new Set(["ping", "getAlbumList2", "getArtists", "search3", "getPlaylists", "getPlaylist", "getAlbum", "getArtist", "getSong", "getStarred2", "getLyrics", "getLyricsBySongId"]);
var retryable = (error) => error instanceof PluginError && error.code === "network" && (error.httpStatus === void 0 || [404, 408, 429, 500, 502, 503, 504].includes(error.httpStatus));
function resetRoute() {
  active = void 0;
  pending = void 0;
}
function currentBase(config) {
  assertCurrent(config);
  const base = active?.key === routeKey(config) ? active.base : void 0;
  if (!base) throw fail("network", t("No reachable server address. Sign in again to select an address."));
  return base;
}
async function select(config, send2, excluded = /* @__PURE__ */ new Set()) {
  const key = routeKey(config);
  let last;
  const failed = [];
  for (const base of config.urls) {
    if (excluded.has(base)) continue;
    try {
      assertCurrent(config);
      await send2(config, base, "ping", {}, timeout(config));
      assertCurrent(config);
      const result = { key, base, checked: Date.now(), failed };
      active = result;
      return result;
    } catch (error) {
      if (!retryable(error)) throw error;
      failed.push(base);
      last = error;
    }
  }
  throw last ?? fail("network", t("No reachable server address. Sign in again to select an address."));
}
async function route(config, send2, excluded = /* @__PURE__ */ new Set(), refresh = false) {
  const key = routeKey(config);
  const probeKey = `${key}:${JSON.stringify(config.urls.filter((base) => excluded.has(base)))}`;
  assertCurrent(config);
  if (pending?.key === probeKey) return pending.promise;
  if (!refresh && active?.key === key && !excluded.has(active.base) && Date.now() - active.checked < 3e4) return active;
  const promise = select(config, send2, excluded);
  pending = { key: probeKey, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = void 0;
  }
}
async function routedRequest(config, method, values, send2, refresh = false) {
  let selected = await route(config, send2, /* @__PURE__ */ new Set(), refresh);
  if (method === "ping") return { status: "ok" };
  const tried = /* @__PURE__ */ new Set();
  while (true) {
    for (const base of selected.failed) tried.add(base);
    tried.add(selected.base);
    assertCurrent(config);
    try {
      const response = await send2(config, selected.base, method, values, READS.has(method) ? Math.max(2500, Math.floor(15e3 / config.urls.length)) : 2e4);
      assertCurrent(config);
      return response;
    } catch (error) {
      if (retryable(error) && active?.base === selected.base && active.key === selected.key) active = void 0;
      if (!READS.has(method) || !retryable(error) || tried.size >= config.urls.length) throw error;
      selected = await route(config, send2, tried);
    }
  }
}
async function mediaBase(config, send2) {
  await route(config, send2, /* @__PURE__ */ new Set(), true);
}

// src/client.ts
function parameters(config, values = {}) {
  const params = new URLSearchParams({ u: config.username, v: "1.16.1", c: "mygo-subsonic", f: "json" });
  for (const [key, value] of Object.entries({ ...authentication(config), ...values })) {
    if (value === void 0) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  return params;
}
function mediaURL(config, method, values) {
  return `${currentBase(config)}/rest/${method}.view?${parameters(config, values)}`;
}
function request(config, method, values = {}, options = {}) {
  const deadline = Date.now() + 25e3;
  return routedRequest(config, method, values, (current, base, operation, params, timeout2) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw fail("network", t("Cannot reach the Subsonic server. Check its URL, connection and TLS certificate."));
    return send(current, base, operation, params, Math.min(timeout2, remaining));
  }, options.refreshRoute);
}
async function prepareMedia(config) {
  await mediaBase(config, send);
}
async function send(config, base, method, values, timeout2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout2);
  try {
    const response = await fetch(`${base}/rest/${method}.view`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: parameters(config, values).toString(),
      signal: controller.signal
    });
    if (!response.ok) {
      const denied = [401, 403].includes(response.status);
      throw new PluginError(denied ? "signIn" : "network", denied ? t("The server denied access. Check your credentials and reverse proxy.") : `${t("Subsonic HTTP error")}: ${response.status}`, void 0, response.status);
    }
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw fail("server", t("The server did not return Subsonic JSON. Check the base URL and reverse proxy."));
    }
    const envelope = json?.["subsonic-response"];
    if (!envelope || !["ok", "failed"].includes(envelope.status)) throw fail("server", t("The server did not return a valid Subsonic response."));
    if (envelope.status === "failed") throw apiFailure(envelope.error);
    return envelope;
  } catch (error) {
    if (error instanceof PluginError) throw error;
    throw fail("network", t("Cannot reach the Subsonic server. Check its URL, connection and TLS certificate."));
  } finally {
    clearTimeout(timer);
  }
}

// src/auth.ts
async function signIn() {
  invalidateConfiguration();
  resetRoute();
  const config = configuration();
  const key = connectionKey(config);
  host.storage.remove(SESSION);
  await request(config, "ping");
  assertCurrent(config);
  const account2 = { id: config.username, name: config.username };
  host.storage.set(SESSION, { key, account: account2 });
  return account2;
}
function signOut() {
  invalidateConfiguration();
  resetRoute();
  host.storage.remove(SESSION);
}
function account() {
  try {
    const config = configuration();
    const session = host.storage.get(SESSION);
    return session?.key === connectionKey(config) ? session.account : null;
  } catch {
    return null;
  }
}
function setSetting({ key }) {
  if (!CONNECTION_KEYS.has(key)) return;
  if (account()) return;
  signOut();
}

// src/mappers.ts
var array = (value) => Array.isArray(value) ? value : [];
var art = (config, id) => id ? mediaURL(config, "getCoverArt", { id, size: 600 }) : void 0;
function releaseDate(date) {
  if (!date?.year) return void 0;
  return [String(date.year), ...date.month ? [String(date.month).padStart(2, "0")] : [], ...date.month && date.day ? [String(date.day).padStart(2, "0")] : []].join("-");
}
function toArtist(config, item) {
  return { id: String(item.id ?? ""), name: item.name || item.artist || "", imageUrl: art(config, item.coverArt), following: Boolean(item.starred) };
}
function artistsOf(config, item) {
  if (array(item.artists).length) return array(item.artists).map((artist2) => toArtist(config, artist2));
  return item.artist ? [{ id: String(item.artistId ?? ""), name: item.artist }] : [];
}
function toAlbum(config, item) {
  return {
    id: String(item.id ?? ""),
    name: item.name || item.album || "",
    imageUrl: art(config, item.coverArt),
    artists: artistsOf(config, item),
    released: releaseDate(item.originalReleaseDate) || releaseDate(item.releaseDate) || (item.year ? String(item.year) : void 0),
    saved: Boolean(item.starred)
  };
}
function toTrack(config, item) {
  return {
    id: String(item.id),
    name: item.title || item.name || "",
    artists: artistsOf(config, item),
    album: toAlbum(config, { id: item.albumId, name: item.album, coverArt: item.coverArt, artist: item.artist, artistId: item.artistId, year: item.year }),
    duration: Math.round(Number(item.duration || 0) * 1e3),
    unavailable: Boolean(item.isVideo)
  };
}
function toPlaylist(config, item) {
  return {
    id: String(item.id),
    name: item.name || "",
    imageUrl: art(config, item.coverArt),
    description: item.comment,
    owner: item.owner,
    mine: item.owner === config.username,
    trackCount: Number(item.songCount ?? array(item.entry).length)
  };
}
function toPlaylistDetails(config, item) {
  return { ...toPlaylist(config, item), tracks: array(item.entry).map((track) => toTrack(config, track)) };
}

// src/paging.ts
var PAGE_SIZE = 50;
var folder = (config) => config.folder ? { musicFolderId: config.folder } : {};
function offsetOf(value = 0) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("unavailable", t("Invalid page offset."));
  return value;
}
function identifier(value) {
  if (value === void 0 || value === null || String(value) === "") throw fail("unavailable", t("An item ID is required."));
  return String(value);
}
function pageOf(items, offset = 0) {
  return { items: items.slice(offset, offset + PAGE_SIZE), more: items.length > offset + PAGE_SIZE };
}

// src/library.ts
var ALBUM_TYPES = /* @__PURE__ */ new Set(["newest", "recent", "frequent", "alphabeticalByName", "alphabeticalByArtist"]);
var ALBUM_PAGE_SIZE = 200;
async function albumList(config, type, offset = 0, size = ALBUM_PAGE_SIZE + 1) {
  const response = await request(config, "getAlbumList2", { type, size, offset, ...folder(config) });
  return array(response.albumList2?.album);
}
async function home() {
  const config = signedConfiguration();
  const [newest, recent, random] = await Promise.all([
    albumList(config, "newest", 0, 12),
    albumList(config, "recent", 0, 12),
    albumList(config, "random", 0, 12)
  ]);
  return {
    title: "Subsonic",
    sections: [
      { title: t("Recently added"), albums: newest.map((item) => toAlbum(config, item)), morePage: "albums:newest:0" },
      { title: t("Recently played albums"), albums: recent.map((item) => toAlbum(config, item)), morePage: "albums:recent:0" },
      { title: t("Rediscover"), albums: random.map((item) => toAlbum(config, item)) }
    ]
  };
}
async function browse({ page }) {
  const config = signedConfiguration();
  const parts = String(page).split(":");
  if (parts[0] === "albums" && parts.length === 3 && parts[1] && ALBUM_TYPES.has(parts[1])) {
    const offset = offsetOf(Number(parts[2]));
    const items = await albumList(config, parts[1], offset);
    const visible = items.slice(0, ALBUM_PAGE_SIZE);
    const sections = [{ albums: visible.map((item) => toAlbum(config, item)) }];
    if (items.length > ALBUM_PAGE_SIZE) sections.push({ title: t("Next page"), morePage: `albums:${parts[1]}:${offset + visible.length}` });
    return { title: t("Albums"), subtitle: visible.length ? `${offset + 1}\u2013${offset + visible.length}` : "", sections };
  }
  if (parts[0] === "artists" && parts.length === 2) {
    const offset = offsetOf(Number(parts[1]));
    const response = await request(config, "getArtists", folder(config));
    const items = array(response.artists?.index).flatMap((index) => array(index.artist));
    return { title: t("Artists"), sections: [{ artists: items.slice(offset).map((item) => toArtist(config, item)) }] };
  }
  throw fail("unavailable", t("This page does not exist."));
}
async function search({ query, kind, offset = 0 }) {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  if (kind === "playlists") {
    const response2 = await request(config, "getPlaylists");
    const needle = query.trim().toLowerCase();
    const result2 = pageOf(array(response2.playlists?.playlist).filter((item) => item.name?.toLowerCase().includes(needle)), offset);
    return { playlists: result2.items.map((item) => toPlaylist(config, item)), more: result2.more };
  }
  if (!["tracks", "albums", "artists"].includes(kind)) return { more: false };
  if (!query.trim()) return { more: false };
  let field = "artist";
  if (kind === "tracks") field = "song";
  else if (kind === "albums") field = "album";
  const response = await request(config, "search3", {
    query,
    songCount: 0,
    albumCount: 0,
    artistCount: 0,
    [`${field}Count`]: PAGE_SIZE + 1,
    [`${field}Offset`]: offset,
    ...folder(config)
  });
  const result = response.searchResult3;
  if (kind === "tracks") {
    const items2 = array(result?.song);
    return { tracks: items2.slice(0, PAGE_SIZE).map((item) => toTrack(config, item)), more: items2.length > PAGE_SIZE };
  }
  if (kind === "albums") {
    const items2 = array(result?.album);
    return { albums: items2.slice(0, PAGE_SIZE).map((item) => toAlbum(config, item)), more: items2.length > PAGE_SIZE };
  }
  const items = array(result?.artist);
  return { artists: items.slice(0, PAGE_SIZE).map((item) => toArtist(config, item)), more: items.length > PAGE_SIZE };
}
async function album({ id }) {
  const config = signedConfiguration();
  const response = await request(config, "getAlbum", { id: identifier(id) });
  if (!response.album) throw fail("unavailable", t("The requested item was not found on the server."));
  return { album: toAlbum(config, response.album), tracks: array(response.album.song).map((item) => toTrack(config, item)) };
}
async function artist({ id }) {
  const config = signedConfiguration();
  const response = await request(config, "getArtist", { id: identifier(id) });
  if (!response.artist) throw fail("unavailable", t("The requested item was not found on the server."));
  return { artist: toArtist(config, response.artist), albums: array(response.artist.album).map((item) => toAlbum(config, item)), tracks: [] };
}

// src/favorites.ts
async function starred(config) {
  return (await request(config, "getStarred2", folder(config))).starred2 || {};
}
async function liked({ offset = 0 } = {}) {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  const result = pageOf(array((await starred(config)).song), offset);
  return { tracks: result.items.map((item) => toTrack(config, item)), more: result.more };
}
async function isLiked({ ids }) {
  const config = signedConfiguration();
  const validated = ids.map(identifier);
  const liked2 = new Set(array((await starred(config)).song).map((item) => String(item.id)));
  return Object.fromEntries(ids.map((id, index) => [id, liked2.has(validated[index] ?? "")]));
}
async function toggleStar(field, id, on) {
  const config = signedConfiguration();
  await request(config, on ? "star" : "unstar", { [field]: identifier(id) });
}
var like = ({ id, on }) => toggleStar("id", id, on);
var saveAlbum = ({ id, on }) => toggleStar("albumId", id, on);
var followArtist = ({ id, on }) => toggleStar("artistId", id, on);
async function savedAlbums({ offset = 0 } = {}) {
  const config = signedConfiguration();
  offset = offsetOf(offset);
  const result = pageOf(array((await starred(config)).album), offset);
  return { albums: result.items.map((item) => toAlbum(config, item)), more: result.more };
}
async function played({ id }) {
  const config = signedConfiguration();
  if (!config.scrobble) return;
  await request(config, "scrobble", { id: identifier(id), submission: true });
}

// src/playlists.ts
async function playlists() {
  const config = signedConfiguration();
  const response = await request(config, "getPlaylists");
  return array(response.playlists?.playlist).map((item) => toPlaylist(config, item));
}
async function playlist({ id }) {
  const config = signedConfiguration();
  const response = await request(config, "getPlaylist", { id: identifier(id) });
  if (!response.playlist) throw fail("unavailable", t("The requested item was not found on the server."));
  return toPlaylistDetails(config, response.playlist);
}
async function createPlaylist({ name }) {
  const config = signedConfiguration();
  if (!name.trim()) throw fail("unavailable", t("A playlist name is required."));
  const response = await request(config, "createPlaylist", { name });
  if (!response.playlist) throw fail("server", t("The server did not return the created playlist."));
  return toPlaylistDetails(config, response.playlist);
}
var edits = /* @__PURE__ */ new Map();
function editPlaylist(id, change, original = signedConfiguration()) {
  id = identifier(id);
  const key = connectionKey(original);
  const lock = `${key}:${id}`;
  const previous = edits.get(lock) || Promise.resolve();
  const next = previous.catch(() => {
  }).then(async () => {
    assertCurrent(original);
    const response = await request(original, "getPlaylist", { id });
    if (!response.playlist || response.playlist.owner !== original.username) throw fail("unavailable", t("Only the playlist owner can edit it."));
    return change(original, response.playlist);
  });
  edits.set(lock, next);
  void next.finally(() => {
    if (edits.get(lock) === next) edits.delete(lock);
  }).catch(() => {
  });
  return next;
}
function renamePlaylist({ id, name }) {
  if (!name.trim()) throw fail("unavailable", t("A playlist name is required."));
  return editPlaylist(id, (config, item) => request(config, "updatePlaylist", { playlistId: item.id, name }));
}
function deletePlaylist({ id }) {
  return editPlaylist(id, (config, item) => request(config, "deletePlaylist", { id: item.id }));
}
function addToPlaylist({ id, trackIds }) {
  const original = signedConfiguration();
  const tracks = trackIds.map(identifier);
  return editPlaylist(id, (config, item) => tracks.length ? request(config, "updatePlaylist", { playlistId: item.id, songIdToAdd: tracks }) : void 0, original);
}
function removeFromPlaylist({ id, trackIds }) {
  const original = signedConfiguration();
  const remove = new Set(trackIds.map(identifier));
  return editPlaylist(id, (config, item) => {
    const entries = array(item.entry);
    const indices = [];
    for (let index = entries.length - 1; index >= 0; index--) {
      const track = entries[index];
      if (track && remove.has(String(track.id))) indices.push(index);
    }
    return indices.length ? request(config, "updatePlaylist", { playlistId: item.id, songIndexToRemove: indices }) : void 0;
  }, original);
}
function movePlaylistTrack({ id, from, to }) {
  return editPlaylist(id, async (config, item) => {
    const tracks = array(item.entry).map((track) => String(track.id));
    if (![from, to].every((position) => Number.isInteger(position) && position >= 0 && position < tracks.length)) throw fail("unavailable", t("Invalid playlist position."));
    if (from === to) return;
    const [moved] = tracks.splice(from, 1);
    if (moved === void 0) return;
    tracks.splice(to, 0, moved);
    await request(config, "createPlaylist", { playlistId: item.id, songId: tracks });
  });
}

// src/playback.ts
async function stream({ id, quality = "high" }) {
  const config = signedConfiguration();
  id = identifier(id);
  if (quality === "lossless") {
    const response = await request(config, "getSong", { id }, { refreshRoute: true });
    const song = response.song;
    if (!song || song.isVideo) throw fail("unavailable", t("This item is not a playable audio track."));
    const suffix = String(song.suffix || "").toLowerCase();
    const opus = String(song.contentType || "").toLowerCase().includes("opus");
    if ((suffix === "mp3" || suffix === "flac" || suffix === "ogg") && !opus) {
      const result = { url: mediaURL(config, "stream", { id, format: "raw" }), type: suffix, quality: suffix === "flac" ? "lossless" : "high" };
      if (song.size && song.size > 0) result.size = song.size;
      if (song.bitRate && song.bitRate > 0) result.bitRate = song.bitRate;
      return result;
    }
    quality = "high";
  } else {
    await prepareMedia(config);
  }
  const bitRate = quality === "standard" ? 128 : 320;
  return {
    url: mediaURL(config, "stream", { id, format: "mp3", maxBitRate: bitRate, estimateContentLength: true }),
    type: "mp3",
    quality: quality === "standard" ? "standard" : "high",
    bitRate
  };
}

// src/lyrics.ts
async function lyrics({ id }) {
  const config = signedConfiguration();
  id = identifier(id);
  const songResponse = await request(config, "getSong", { id });
  const song = songResponse.song;
  if (!song) throw fail("unavailable", t("The requested item was not found on the server."));
  if (songResponse.openSubsonic) {
    let response2;
    try {
      response2 = await request(config, "getLyricsBySongId", { id });
    } catch (error) {
      if (!(error instanceof PluginError) || error.subsonicCode !== 0 && error.httpStatus !== 404) throw error;
    }
    const choices = array(response2?.lyricsList?.structuredLyrics);
    const selected = choices.find((item) => item.synced && array(item.line).length) || choices.find((item) => array(item.line).length);
    if (selected?.synced) {
      const offset = Number(selected.offset || 0);
      return { lines: array(selected.line).map((line) => ({ start: Math.max(0, Number(line.start || 0) - offset), text: line.value || "" })) };
    }
    if (selected) return { lrc: array(selected.line).map((line) => line.value || "").join("\n") };
  }
  const response = await request(config, "getLyrics", { artist: song.artist || "", title: song.title || "" });
  return { lrc: response.lyrics?.value || "" };
}
export {
  account,
  addToPlaylist,
  album,
  artist,
  browse,
  createPlaylist,
  deletePlaylist,
  followArtist,
  home,
  isLiked,
  like,
  liked,
  lyrics,
  movePlaylistTrack,
  played,
  playlist,
  playlists,
  removeFromPlaylist,
  renamePlaylist,
  saveAlbum,
  savedAlbums,
  search,
  setSetting,
  signIn,
  signOut,
  stream
};
