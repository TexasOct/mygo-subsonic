# Contributing

## Run locally

Use Node.js 22+ and `zip`:

```sh
npm ci
npm run check
npm run build       # src/index.ts -> root index.js
npm run package
npm run test:upstream
```

Install the folder or ZIP from official MyGo Music's **Settings → Plugins → +**. Upstream tests clone a pristine pinned official revision and require its Go toolchain; `MYGO_MUSIC_DIR` optionally supplies a local clone source without testing its uncommitted changes. Set `MYGO_SUBSONIC_ZIP` to also exercise the official ZIP installer. `MYGO_MUSIC_REVISION` accepts a full pinned official commit hash for additional compatibility checks; release validation covers `799ec1bac6d3006ac1aa29e06be9e6ae92cf0028` and `93bf5a6202119305bc36fa7b1da71402c96e6879`.

For manual folder installs, keep `plugin.json`, `index.js` and `locales/` together. Installation needs no Node.js or build step. See [README.md](README.md) or [README.en.md](README.en.md) for the user guide.

## Code conventions

- Keep `src/index.ts` limited to supported capability exports; MyGo detects controls from those names. Do not export placeholder capabilities.
- Keep protocol, authentication, mapping and feature logic in separate modules. Use strict types, not `any` or silent type assertions.
- Use only host/sandbox APIs in plugin code. Node APIs belong in development scripts only.
- Never hand-edit root `index.js`. Rebuild and commit it alongside source so source archives work without a user build. Official MyGo runs standalone TS but does not resolve local runtime imports; neither modular TS main nor a JS import bridge works. Entrypoint regressions document this constraint.
- Keep the release manifest within the official `key`, `label`, `help`, `link` settings contract. Do not imply native switches/selectors/password masking work in the official host.
- Keep LAN HTTP support. Do not auto-upgrade transport or downgrade authentication. Preserve password whitespace and encode parameters with `URLSearchParams`.
- Keep one server/account with ordered entrances in the official text setting. Preserve input order, normalize once, and never replay writes after ambiguous network failures. Do not reintroduce profile/account management or host-only controls into this release.
- Treat settings/authenticated URLs as secrets. Never display untrusted server error text or log credentials.
- Translate visible text in `locales/zh-CN.json`. MyGo translates manifest labels/help; runtime messages use `t(...)`.
- Test meaningful behavior rather than wording/default snapshots. Begin tests with a short behavioral comment. Tests must not need real credentials or a public music server.

## Tests

Node tests use local HTTP servers and the shipped bundle. Cover failures, opaque IDs, pagination, duplicates, pending requests, connection changes, ordered address attempts and credential handling.

The `test/upstream/*.go.txt` fixtures stay outside a Go module. The upstream script copies them into official MyGo's `internal/plugin` and `internal/app` to access package-private APIs. Tests cover real MoeJS execution, entrypoint constraints, ZIP installation, and UI rendering of actual plugin responses. UI checks cover full/bounded album lists, virtual rows, sign-in guidance, narrow/desktop widths and light/dark themes. Set `MM_FRAMES` to an existing output directory to save screenshots. Only test files are added; no host implementation is modified.

Check every list entrypoint when changing browsing: all album sorts, home See All links, artists, all search kinds, liked tracks, saved albums, playlist lists and detail pages. Keep native automatic continuation where it exists. Album collection has one shared time/item budget; a concurrent route probe must not extend a caller's deadline. Do not describe all host grids as virtualized or add indefinite full-library loads.

Host feature/UI implementation work is paused and outside this release. No host patch or second protocol implementation belongs in this repository. Any future upstream submission requires separate confirmation after the usable plugin release.

## Technical notes

### Configuration and routing

The release supports one server/account with up to five ordered addresses. The parser accepts commas or newlines, trims address whitespace, normalizes trailing paths (including `/rest`) and deduplicates in first-seen order. Addresses must not contain credentials, query parameters or fragments. Password whitespace is preserved. Every address must be a trusted entrance to the same server; there is no cross-server queue isolation.

Official MyGo renders settings as text fields, without switches, dropdowns or password masking. Connection fields belong in plugin settings, not the login window. The plugin cannot open settings automatically. See [SECURITY.md](SECURITY.md) for token/legacy authentication, authenticated media URLs and credential-storage limitations.

- Authenticated `ping` selects the first reachable address. Selection is cached for 30 seconds, then checked on the next request, with no background polling.
- Transport failures, timeouts and HTTP `404/408/429/500/502/503/504` may try the next address; metadata reads may retry. Authentication, permission, invalid JSON and protocol errors stop immediately. Authentication never silently downgrades.
- Multiple-address probes allow 1.5 seconds per address; a single-address probe allows 20 seconds. A protocol request has a shared 25-second probe/retry budget. High-latency addresses may require adjusting priority.
- Playlist, favorite and scrobble writes are never automatically replayed after an ambiguous failure.
- Artwork and audio URLs use the selected address. Each new playback URL request rechecks reachability without waiting for the metadata cache. The plugin cannot replace a URL after handing it to the host, so mid-stream failover is not seamless.
- Sign-in saves a configuration-bound local marker only after a successful `ping`. Logout or connection changes invalidate it; matching markers survive runtime restarts.

### Protocol coverage

The plugin uses Subsonic API 1.16.1 and optional OpenSubsonic lyrics. Durations and lyric timing use milliseconds.

| Feature | Endpoints |
| --- | --- |
| Album shelves and artist index | `getAlbumList2`, `getArtists` |
| Track, album and artist search | `search3`; account playlists are filtered locally |
| Album and artist details | `getAlbum`, `getArtist` |
| Favorites | `getStarred2`, `star`, `unstar` |
| Playlists | `getPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`, `deletePlaylist` |
| Cover art and playback | `getCoverArt`, `stream` |
| Lyrics | `getLyrics`; OpenSubsonic `getLyricsBySongId` is tried first when available |
| Opt-in listening history | `scrobble`, triggered by MyGo's played event, not track completion |

Remote playback, radio and video capabilities are not exported. Lyrics fallback does not hide authentication or permission failures.

### List loading

Album browsing and the home page's Recently added / Recently played See All links share a loader for name, artist, newest, recent and frequent sorts. Each browse collects at most 5,000 albums or 8 seconds of results before rendering. At a limit or later network failure, completed batches remain visible with a Remaining albums section; the host's native See All action opens the remainder. Subtitles distinguish complete counts from loaded counts. Authentication, permission and protocol errors still surface.

Artist indices, artist/album/playlist details and playlist lists return complete server results without a client-side 50/200-item cutoff. Playlist duplicates are preserved. Track/album/artist/playlist search, liked tracks and saved albums keep the host's automatic continuation with 50-item batches.

Official `browse()` cannot append remote results during scrolling: album browsing collects bounded results before display, rather than providing network infinite scrolling. Unpaged artist, favorite and playlist endpoints still fetch complete results; favorite and playlist-search continuation may fetch the full result again, with network and memory costs for large libraries.

The host virtualizes album browsing, artist indices and track lists. Album/artist search grids, saved albums and artist-detail layouts remain under host control; not every grid is virtualized, and the plugin does not patch host rendering.

### Playback and playlist limits

- `standard` requests MP3 up to 128 kbps; `high` requests MP3 up to 320 kbps.
- `lossless` streams raw FLAC. Raw MP3 and Ogg Vorbis are reported as high, not lossless. AAC, ALAC, WAV, Opus and other codecs fall back to high MP3. Opus detection depends on server metadata; MyGo's Ogg decoder only supports Vorbis.
- Transcoding and permissions belong to the server. `maxBitRate` is an upper-bound request, not a guarantee.
- Playlist writes require `owner` to exactly match the username. Removal by track ID deletes all matching occurrences; reorder preserves duplicates. Local edits to a playlist are serialized, but external clients may still conflict because the protocol has no conditional updates.
- Mock and official-runtime tests do not certify live Navidrome, Gonic or original Subsonic deployments, or actual audio decoding/transcoding.

## Release checklist

1. Match versions in `plugin.json`, `package.json` and the lockfile; update changelog and versioned ZIP examples.
2. Run `npm run check`, `npm run package`, then `MYGO_SUBSONIC_ZIP="$PWD/dist/mygo-subsonic-X.Y.Z.zip" npm run test:upstream`.
3. Test a real server and actual playback/transcoding before claiming support for that deployment. Mock/sandbox tests alone are not interoperability certification.
4. Commit source, tests, docs, locales and generated `index.js`, never credentials, settings, `node_modules` or `dist/`.
5. Push the public repository with root `plugin.json`. Add the `mygo-music-plugin` topic for official discovery.
6. Create tag `vX.Y.Z` and a GitHub release with the platform-neutral asset `mygo-subsonic-X.Y.Z.zip`. The official installer can also fall back to the repository source archive.
7. Provide `mygo-music://install-plugin?repo=TexasOct/mygo-subsonic` and the repository URL. Verify the published archive matches the tested artifact.

CI checks and packages an artifact; it does not automatically publish releases.

## License

Contributions are AGPL-3.0-only. Preserve third-party attribution and license obligations.
