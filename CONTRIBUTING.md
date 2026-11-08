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

Node tests use local HTTP servers and the shipped bundle. Cover failures, opaque IDs, pagination, duplicates, pending requests, connection changes, ordered address attempts and credential handling. Credit tests cover large performer lists, arbitrary contributor roles, Unicode/name/ID deduplication, legacy list separators, incomplete credits, album display retaining artists/performers while hiding creator roles across library entrypoints, and contributor search/navigation. Runtime checks also verify separate album/track credits, opaque artist-ID navigation, contributed albums and extended artist-catalogue paging through MoeJS and the official Go models. Artist-discovery regressions cover track-only/custom-role participants, same-name identities and unrelated title hits, authoritative album metadata, folder filters, multi-batch/bounded lookups, malformed responses, ignored offsets, legacy unsupported search, and network/authentication/deadline failures.

The `test/upstream/*.go.txt` fixtures stay outside a Go module. The upstream script copies them into official MyGo's `internal/plugin`, `internal/player` and `internal/app` to access package-private APIs. Tests cover real MoeJS execution, entrypoint constraints, ZIP installation, audio decoding/seeking, and UI rendering of actual plugin responses. Audio checks serve the official host's MP3/FLAC/Vorbis test files over local HTTP through the plugin's authenticated raw URLs, then decode and seek with the unmodified host, without initializing audio hardware. UI checks cover full/bounded album lists, virtual rows, sign-in guidance, narrow/desktop widths and light/dark themes. Set `MM_FRAMES` to an existing output directory to save screenshots. Only test files are added; no host implementation is modified.

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
| Album shelves and artist index | `getAlbumList2`, `getArtists`; optional `search3` artist catalogue |
| Track, album and artist search | `search3`; account playlists are filtered locally |
| Album and artist details | `getAlbum`, `getArtist`; `search3` songs supplement artist participation albums |
| Favorites | `getStarred2`, `star`, `unstar` |
| Playlists | `getPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`, `deletePlaylist` |
| Cover art and playback | `getCoverArt`, `getSong`, `stream` |
| Lyrics | `getLyrics`; OpenSubsonic `getLyricsBySongId` is tried first when available |
| Opt-in listening history | `scrobble`, triggered by MyGo's played event, not track completion |

Remote playback, radio and video capabilities are not exported. Lyrics fallback does not hide authentication or permission failures.

### Artist and contributor credits

OpenSubsonic `artists` is authoritative when it contains named entries. `contributors[].artist` from every role joins the complete track/search credit list, including performers, instruments, writers, arrangers and custom TIPL roles; no role allowlist or artist-count cutoff is applied to that list. Structured names remain atomic. Without structured artists, `artist` or `displayArtist` is split only on semicolons (ASCII/full-width), Japanese list commas (`、`) and newlines. Commas, slashes, ampersands, middle dots and `feat.` are preserved to avoid breaking band/character names. A split legacy string's single ID is not assigned to any individual name.

Credits keep first-seen order, deduplicate exact opaque IDs and NFC/case/whitespace-normalized name-only entries, and upgrade an ID-less name when exactly one matching server ID is available in the same collection. Different server IDs sharing a name remain distinct. Name-only credits use an empty ID and cannot trigger artist navigation or follow actions. No synthetic IDs, extra per-person requests or persistent identity cache is introduced.

Album display starts with primary album artists and explicit track `albumArtists`/`displayAlbumArtist`, then includes primary track artists and visible contributors across all tracks, even when album-artist metadata exists. Only writing/production roles (`composer`, `lyricist`, `arranger`, `writer`, `producer`, plus Chinese equivalents) are hidden from that display, matching trimmed, case-insensitive role strings. Performers, instrument roles and unknown/missing roles remain visible; someone also credited as a primary artist or performer stays visible even if they have a hidden role. Each returned track references that mapped parent album while keeping its complete track credits. Search, favorites and playlists prefer `albumArtists`/`displayAlbumArtist` for the embedded album, falling back to primary track artists only when album-artist metadata is absent. Album lists use only metadata supplied in that response, without fetching every album's tracks.

Contributor extraction remains separate from album display: track credits, server-side search and artist participation lookups still include all roles. The official MyGo artist model has no contributor-role fields, so track roles are represented in one flat credit list, not a separate credits panel. This cannot recover file tags omitted by the API.

### Artist discovery and participation albums

Some servers expose fewer people and releases through Subsonic than through their own web UI. In Navidrome's published implementation, `getArtists` indexes album artists; `getArtist` lists album-artist releases, with optional track-artist participation when `Subsonic.ArtistParticipations` is enabled. That option alone does not cover every custom role. The plugin does not call private web APIs or change server settings.

Artist browsing retains the complete `getArtists` index and supplements it with `search3` artist batches using the catalogue query `\"\"` (two double quotes). This works on Navidrome's searchable artist catalogue and may not be supported by other servers. Exact IDs deduplicate the sources. Catalogue continuation rereads the legacy index and excludes its IDs, so legacy artists beyond a catalogue boundary do not appear twice. Explicit unsupported-feature responses retain the original index; network failures offer a retryable continuation, while authentication and malformed protocol data still fail.

Artist details retain authoritative `getArtist` album metadata, then search songs by the artist's name. Search hits are only candidates: an exact server ID must occur in primary artists, explicit album artists or contributors of any role before the song's album joins the discography. Title hits, homonymous IDs and name-only credits do not prove participation. Song album IDs deduplicate releases, without fetching every album or scanning the whole song library. This relies on the server indexing the relevant names and returning their IDs in song credits; no full web-UI parity is claimed.

Both catalogue batches and artist-song candidates use 500 entries per request, with a shared 8-second/5,000-entry budget and a one-item boundary probe. Artist browsing has an Additional artists continuation. The native artist-detail model has no continuation field, so excess candidate songs or incomplete enrichment produce an actionable error, never an apparently complete partial discography. Existing authoritative albums remain usable if the first optional request is offline or its budget expires; explicit unsupported search also preserves legacy results. Empty authoritative results do not turn network failures into successful empty pages. No persistent cross-account catalogue cache is used.

### List loading

Album browsing and the home page's Recently added / Recently played See All links share a loader for name, artist, newest, recent and frequent sorts. Each browse collects at most 5,000 albums or 8 seconds of results before rendering. At a limit or later network failure, completed batches remain visible with a Remaining albums section; the host's native See All action opens the remainder. Subtitles distinguish complete counts from loaded counts. Authentication, permission and protocol errors still surface.

The legacy artist index, album/playlist details and playlist lists retain their full server results without a client-side 50/200-item cutoff. Supplemental artist catalogue and participation lookups have the explicit budgets above. Playlist duplicates are preserved. Track/album/artist/playlist search, liked tracks and saved albums keep the host's automatic continuation with 50-item batches.

Official `browse()` cannot append remote results during scrolling: album browsing collects bounded results before display, rather than providing network infinite scrolling. Unpaged artist, favorite and playlist endpoints still fetch complete results; favorite and playlist-search continuation may fetch the full result again, with network and memory costs for large libraries.

The host virtualizes album browsing, artist indices and track lists. Album/artist search grids, saved albums and artist-detail layouts remain under host control; not every grid is virtualized, and the plugin does not patch host rendering.

### Playback and playlist limits

- Every quality preference reads `getSong` and requests `format=raw` for MP3, native FLAC and Ogg Vorbis, without `maxBitRate` or estimated transcode size. FLAC is reported as lossless; MP3/Vorbis as high. Original byte size and bitrate are retained when supplied.
- Official MyGo's `openStream` recognizes native FLAC and Ogg Vorbis, then otherwise tries MP3; it has no WAV/PCM, AAC, ALAC, Opus, AIFF or other decoder. Only known formats lacking a decoder request MP3: up to 128 kbps for `standard`, 320 kbps otherwise, never reported as lossless or with the original byte size. Asking for FLAC conversion is not a portable Subsonic lossless-conversion guarantee.
- Format classification uses suffix, MIME and any codec parameter, not the server's transcoded metadata. Missing, unknown or conflicting format metadata is rejected instead of silently requesting lossy conversion. Ogg without a codec parameter is treated as Vorbis; distinguishing Opus/FLAC/Speex in that container depends on accurate server metadata.
- Transcoding and permissions belong to the server. `maxBitRate` is an upper-bound request, not a guarantee; `format=raw` asks the server to disable transcoding.
- Playlist writes require `owner` to exactly match the username. Removal by track ID deletes all matching occurrences; reorder preserves duplicates. Local edits to a playlist are serialized, but external clients may still conflict because the protocol has no conditional updates.
- Mock and official-runtime tests, including local audio decoding checks, do not certify live Navidrome, Gonic or original Subsonic deployments or their transcoding configuration.

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
