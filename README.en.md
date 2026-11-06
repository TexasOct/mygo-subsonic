# MyGo Subsonic

English · [简体中文](README.md)

An open-source Subsonic source plugin for [MyGo Music](https://github.com/egoist/mygo-music). Browse, search and play an existing Subsonic / OpenSubsonic library. **This is a client plugin, not a Subsonic server.**

Targets **unmodified official MyGo Music**. Modular TypeScript is bundled into a self-contained `index.js`; installation requires no Node.js, npm or build step.

## Installation

Requires MyGo Music **0.1.13+** and Subsonic API **1.16.1** with the endpoints you use. Runtime and browsing UI tests use unmodified official revisions [`799ec1b`](https://github.com/egoist/mygo-music/commit/799ec1bac6d3006ac1aa29e06be9e6ae92cf0028) (0.1.13) and [`93bf5a6`](https://github.com/egoist/mygo-music/commit/93bf5a6202119305bc36fa7b1da71402c96e6879) (0.1.18).

- [Install plugin](mygo-music://install-plugin?repo=TexasOct/mygo-subsonic), or paste `https://github.com/TexasOct/mygo-subsonic` into **Settings → Plugins → +**.
- Or download `mygo-subsonic-0.1.2.zip` from [Releases](https://github.com/TexasOct/mygo-subsonic/releases) and install the local ZIP.
- Developers can install this project folder. Keep `plugin.json`, `index.js` and `locales/` together when copying manually.

### First use

1. Open **Settings → Plugins → Subsonic**.
2. Enter **Server addresses, Username and Password**. Other fields can usually stay blank.
3. Switch to the Subsonic source and click **Sign In**.

The login window shows connection progress and explains what to check on failure. Close it before editing the settings above. Official MyGo does not let this plugin add connection fields to the login window or open settings automatically.

## Configuration and authentication

This release supports **one server and one set of credentials**, with multiple entrances tried in order. There is no multi-server/account manager and no dependency on host modifications or a MyGo fork.

Released official MyGo versions still render these settings as **text inputs**, so the instructions below remain valid. This branch adds optional `password`, `boolean` and `select` metadata for the [host reference implementation](https://github.com/TexasOct/mygo-music/tree/feat/plugin-setting-types). Supporting hosts can mask passwords, show a history switch and offer sign-in choices. **This is not accepted upstream and the plugin does not require the fork.**

| Setting | Value |
| --- | --- |
| Server addresses | Enter a full address, such as `http://192.168.1.10:4533`. Separate LAN/public addresses for the same server with commas, preferred address first; up to 5. HTTP/HTTPS, ports, subpaths and trailing `/rest` work. Do not include a username, password, `?query` or `#fragment`. |
| Username / Password | Your music server username and password, or a dedicated Subsonic app password. Password whitespace is preserved. |
| Sign-in method | Usually leave blank for `token`. Enter `legacy` only if your server requires it. The plugin will not switch methods automatically. |
| Music folder ID (optional) | Leave blank for all folders. To restrict supported views, enter the server's folder ID, not its name or disk path. Playlists are not filtered. |
| Save listening history | Enter `true` to enable; blank or `false` keeps this off. Sends tracks marked as played by MyGo, without checking whether you finished them. |

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

**LAN HTTP works; HTTPS is not mandatory.** HTTP exposes traffic, so prefer HTTPS outside trusted networks. **Settings, including passwords, remain plaintext at rest; official releases also display passwords as plain text. Masking in the reference implementation is not encryption.** Use a dedicated low-privilege account and protect settings, backups, screenshots and authenticated media URLs. See [SECURITY.md](SECURITY.md).

## Features

- Album shelves, continuous album browsing and artist indices (`getAlbumList2`, `getArtists`).
- Track, album and artist search (`search3`); local filtering of account playlists.
- Album/artist details (`getAlbum`, `getArtist`).
- Liked tracks, saved albums and starred artists (`getStarred2`, `star`, `unstar`).
- Playlist listing, creation, renaming, deletion, addition/removal and reordering.
- Authenticated cover art and streaming URLs.
- Legacy lyrics and optional OpenSubsonic structured lyrics.
- Opt-in `scrobble` submissions.

### How lists load

| Page | Scrolling and loading |
| --- | --- |
| Albums and the home page's Recently added / Recently played See All links | Collect album batches into one scrollable list instead of requiring a click every 200 albums. Name, artist, newest, recent and frequent sorts use the same loader. |
| Artist index | Return the complete index for scrolling on one page. |
| Search for tracks / albums / artists / playlists, liked tracks, saved albums | Keep MyGo's automatic continuation: 50 items per batch, with another batch near the bottom. |
| Artist, album and playlist details; playlist list | Return the complete server result without a client-side 50/200-item cutoff. Playlist duplicates are preserved. |

Each album browse collects at most **5,000 albums or 8 seconds of results**. A normal-sized library stays on one page. At a limit or after a later network failure, completed batches remain visible with a **Remaining albums** section; the host's native **See All** action opens the remainder. The subtitle distinguishes a complete count from a loaded count. Authentication, permission and protocol errors still surface rather than looking like a finished list.

MyGo virtualizes album browsing and the artist index, rendering only visible rows; track lists also use the host's virtualization. **Not every grid is virtualized**: layouts such as album/artist search results, saved albums and artist details remain under official MyGo's control. This plugin does not modify the host or claim to fix those layouts' rendering costs.

Official `browse()` cannot append remote results during scrolling. This approach collects a bounded list before showing it, rather than providing true network infinite scrolling. Unpaged artist, favorite and playlist APIs still fetch complete results; favorite and playlist-search continuation may fetch that full result again. Large libraries therefore retain network and memory costs. Durations and lyric timing use milliseconds.

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
MYGO_SUBSONIC_ZIP="$PWD/dist/mygo-subsonic-0.1.2.zip" npm run test:upstream
# Another pinned official revision; UI tests consume real plugin responses:
MYGO_MUSIC_REVISION=93bf5a6202119305bc36fa7b1da71402c96e6879 npm run test:upstream
```

`src/index.ts` only exports capabilities. Separate modules handle address parsing, configuration, authentication, routing, HTTP, mapping and features. Do not edit generated root `index.js` manually.

**Why bundle?** Official MyGo runs standalone TS but does not currently resolve cross-file imports/re-exports. A JavaScript bridge cannot solve this. Bundling keeps modular development without requiring users to build; real-runtime tests cover these entrypoint cases.

Upstream tests need Git, upstream's Go toolchain and dependency network access. They use the unmodified official host, not a fork. Normal tests use temporary local HTTP servers. CI checks the committed bundle and packages a ZIP. See [CONTRIBUTING.md](CONTRIBUTING.md) for releases.

## License

[AGPL-3.0-only](LICENSE), matching MyGo Music. This plugin is not maintained by the MyGo Music project.
