# MyGo Subsonic

English · [简体中文](README.md)

An open-source Subsonic source plugin for [MyGo Music](https://github.com/egoist/mygo-music). Browse, search and play an existing Subsonic / OpenSubsonic library. **This is a client plugin, not a Subsonic server.**

Targets **unmodified official MyGo Music**. Modular TypeScript is bundled into a self-contained `index.js`; installation requires no Node.js, npm or build step.

## Installation

Requires MyGo Music **0.1.13+** and Subsonic API **1.16.1** with the endpoints you use. Tested in the real official runtime at [`799ec1b`](https://github.com/egoist/mygo-music/commit/799ec1bac6d3006ac1aa29e06be9e6ae92cf0028).

- [Install plugin](mygo-music://install-plugin?repo=TexasOct/mygo-subsonic), or paste `https://github.com/TexasOct/mygo-subsonic` into **Settings → Plugins → +**.
- Or download `mygo-subsonic-0.1.0.zip` from [Releases](https://github.com/TexasOct/mygo-subsonic/releases) and install the local ZIP.
- Developers can install this project folder. Keep `plugin.json`, `index.js` and `locales/` together when copying manually.

Configure settings, switch to the Subsonic source and sign in.

## Configuration and authentication

This release supports **one server and one set of credentials**, with multiple entrances tried in order. There is no multi-server/account manager and no dependency on host modifications or a MyGo fork.

Official MyGo renders plugin settings as **text inputs**, not switches, dropdowns or masked password fields.

| Setting | Value |
| --- | --- |
| Server URLs (priority order) | 1–5 addresses for the SAME server, separated by commas; the first has highest priority. A single URL also works. HTTP/HTTPS, ports, subpaths and trailing `/rest` are accepted. No embedded credentials, query or fragment. |
| Username / Password | Server credentials or a dedicated Subsonic client password. Password whitespace is preserved. |
| Authentication mode | Empty or `token` (recommended); explicit `legacy` only if required. No automatic downgrade. |
| Music folder ID | Optional restriction for browsing/search/favorites where supported; playlists remain account-wide. |
| Scrobbling | Enter `true` to enable; empty or `false` disables. Uses MyGo's played event, not a full-duration check. |

Example with LAN first and public fallback:

```text
http://192.168.1.10:4533, https://music.example.com/navidrome
```

The parser also accepts newline separation when supplied through configuration files or multiline-capable input. It trims whitespace, normalizes trailing paths and deduplicates while preserving the first occurrence. Every URL must be a **trusted entrance to the same server**: each may receive the same credentials.

Sign in again after changing addresses or credentials. If manually replacing the server/account, clear the old playback queue and reload music first. This release preserves raw server resource IDs and does not provide cross-server queue isolation.

### Routing and failures

- Authenticated `ping` probes select the first reachable URL in order. Selection is cached for 30 seconds, then re-evaluated on the next request; there is no background polling.
- Transport failures, timeouts and HTTP `404/408/429/500/502/503/504` may try the next URL. Metadata reads may retry. Authentication, permission, invalid JSON and protocol errors stop immediately. Authentication never silently downgrades.
- Multiple-address probes have a 1.5-second per-address timeout; a single-address probe allows 20 seconds. A protocol request has a 25-second total probe/retry budget, below the host's call limit. High-latency entrances may require adjusting priority.
- Playlist/favorite/scrobble writes are **never automatically replayed** after an ambiguous failure.
- Audio/artwork URLs use the selected entrance. Each new playback URL request rechecks reachability without waiting for the metadata cache to expire. URLs handed to the host cannot be replaced mid-stream; seamless failover is not provided.

### Authentication and security

Default token authentication sends a fresh public salt and `t = MD5(password + salt)`, with `u`, `s`, `v=1.16.1` and `c=mygo-subsonic`. MD5 is the protocol requirement, not secure password storage. Explicit legacy mode sends `p=enc:<UTF-8 hex password>` to preserve literal `enc:` prefixes; hex encoding is not encryption.

Metadata and mutations use POST form bodies and reject redirects. Artwork/audio URLs contain authentication because MyGo fetches them separately. Sign-in validates with `ping` before saving a configuration-bound local marker. Logout or connection changes invalidate it; matching markers survive runtime restarts.

**LAN HTTP works; HTTPS is not mandatory.** HTTP exposes traffic, so prefer HTTPS outside trusted networks. **Official MyGo displays and stores settings, including passwords, as plain text.** Use a dedicated low-privilege account and protect settings, backups, screenshots and authenticated media URLs. See [SECURITY.md](SECURITY.md).

## Features

- Album shelves, paged album browsing and artist indices (`getAlbumList2`, `getArtists`).
- Track, album and artist search (`search3`); local filtering of account playlists.
- Album/artist details (`getAlbum`, `getArtist`).
- Liked tracks, saved albums and starred artists (`getStarred2`, `star`, `unstar`).
- Playlist listing, creation, renaming, deletion, addition/removal and reordering.
- Authenticated cover art and streaming URLs.
- Legacy lyrics and optional OpenSubsonic structured lyrics.
- Opt-in `scrobble` submissions.

Pages contain 50 items. Unpaged artist indices/favorites/playlists are fetched in full and paginated locally, with corresponding large-library cost. Durations and lyric timing use MyGo milliseconds.

### Quality and limitations

- **standard**: MP3 transcoding, maximum 128 kbps; **high**: MP3, maximum 320 kbps.
- **lossless**: raw FLAC; raw MP3/Ogg Vorbis reported as high, not lossless; AAC/ALAC/WAV/Opus and other codecs fall back to high MP3.
- The server must supply transcoding and permissions. Bitrate is an upper-bound request, not a guarantee. Opus detection relies on metadata; MyGo's Ogg decoder only supports Vorbis.
- Playlist writes require `owner` to exactly match the username. Removal deletes all occurrences of matching IDs; reorder preserves duplicates. Local edits are serialized, but external clients can still conflict because Subsonic has no conditional updates.
- Remote playback, radio and video are not exported. Lyrics fallback does not hide authentication/permission failures.
- Live Navidrome/Gonic/original Subsonic deployments and actual decoding/transcoding have not been individually certified.

## Development and verification

Requires Node.js 22+ and `zip` for packaging.

```sh
npm ci
npm run check       # strict typecheck + local HTTP integration tests
npm run build       # src/index.ts -> root index.js
npm run package     # installable ZIP with source and license
npm run test:upstream
# Optional local clone source; still tests a pristine pinned official revision:
MYGO_MUSIC_DIR=/path/to/mygo-music npm run test:upstream
# Also test the official ZIP installer:
MYGO_SUBSONIC_ZIP="$PWD/dist/mygo-subsonic-0.1.0.zip" npm run test:upstream
```

`src/index.ts` only exports capabilities. Separate modules handle address parsing, configuration, authentication, routing, HTTP, mapping and features. Do not edit generated root `index.js` manually.

**Why bundle?** Official MyGo runs standalone TS but does not currently resolve cross-file imports/re-exports. A JavaScript bridge cannot solve this. Bundling keeps modular development without requiring users to build; real-runtime tests cover these entrypoint cases.

Upstream tests need Git, upstream's Go toolchain and dependency network access. They use the unmodified official host, not a fork. Normal tests use temporary local HTTP servers. CI checks the committed bundle and packages a ZIP. See [CONTRIBUTING.md](CONTRIBUTING.md) for releases.

## License

[AGPL-3.0-only](LICENSE), matching MyGo Music. This plugin is not maintained by the MyGo Music project.
