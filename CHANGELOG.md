# Changelog

## 0.1.6

- Keep album headers and album lists focused on album artists/groups. Do not promote composers, lyricists, arrangers, performers or other contributor roles into album artists; use primary track artists only when album-artist metadata is absent.
- Retain complete track credits, server-side contributor search, artist navigation and participation-album discovery independently of the shorter album display. Search still depends on the server indexing and returning the relevant credits.
- Apply the same mapping to home shelves, all album browse sorts, search results, saved albums and artist pages. Add regressions for hidden-but-searchable composers and verify separate album/track credits through the official MyGo runtime.

## 0.1.5

- Supplement the album-artist index with the server's searchable artist catalogue, exposing track-only singers and other participants where supported. Deduplicate opaque IDs, preserve legacy offset links and provide a bounded Additional artists continuation without repeating legacy-index artists.
- Recover artist participation albums omitted by `getArtist`: search candidate songs by name, require the exact artist ID in primary/album artists or contributors of any role, and deduplicate their releases while retaining authoritative album metadata. Avoid title matches, homonymous artists, fabricated identities and per-album/full-library scans.
- Bound discovery by time and batch count; reject malformed/repeated paging and report incomplete or excessive artist lookups rather than showing false-empty or truncated discographies. Preserve compatible legacy results on explicitly unsupported search and existing releases when the first optional request is offline.
- Add HTTP/bundle and pristine official-host regressions for custom participants, extended catalogues and actual continuation UI. Document why Subsonic role scopes can differ from the server web UI and where API/search metadata still limits discovery.

## 0.1.4

- Include OpenSubsonic contributors of every role in artist credits, including performers/instruments, composers, lyricists, arrangers and custom roles. Aggregate credits across every track on album detail pages, without an artist-count cutoff.
- Deduplicate opaque server IDs and normalized name-only credits, upgrade unambiguous names to server identities, and retain distinct IDs with the same name. Name-only credits remain non-clickable rather than using fabricated IDs.
- Keep track credits separate from explicit album artists in search, favorites and playlists; album-detail tracks share the actual parent album metadata. Support legacy/display strings with explicit list separators without splitting band-name punctuation or assigning a combined ID to individuals.
- Add HTTP/bundle regressions and real MoeJS/official-host checks for credit parsing, aggregation, Unicode normalization and artist navigation. Document API metadata limits and the host's flat credit display.

## 0.1.3

- Play original MP3, native FLAC and Ogg Vorbis for every quality preference. Standard/high selections no longer trigger MP3 conversion for formats the official host can decode; FLAC remains lossless.
- Request compatibility MP3 only for known formats without an official host decoder, including WAV/PCM, AAC, ALAC and Opus. Reject missing or conflicting format metadata rather than silently converting it. Do not label lossy streams as lossless or give transcoded streams the original file size.
- Extend regressions for raw audio authentication, MIME/codec classification, all quality preferences, route recovery and metadata errors. Decode and seek real MP3/FLAC/Vorbis files through plugin URLs on pristine official hosts.
- Update the user guides to explain original-audio playback and current decoder limits.

## 0.1.2

- Collect album batches into one scrollable list across all album sorts and home-page See All links, instead of navigating every 200 albums. Bound each load to 5,000 albums and 8 seconds, retaining completed batches on later network failures with an accurately named Remaining albums continuation.
- Keep native automatic loading for every search kind, liked tracks and saved albums. Verify complete artist indices, artist/album/playlist details and playlist lists without artificial cutoffs.
- Explain where to enter connection settings before sign-in, show connection progress, and retain actionable settings guidance after network, credential or protocol failures. Do not open external pages or depend on unsupported custom forms.
- Simplify setting labels, help, errors and Chinese translations; distinguish server folder IDs from names/paths and explain text-based boolean fields.
- Enforce per-caller deadlines while sharing route discovery. Reject malformed album lists and servers that ignore batch limits instead of silently truncating or loading without bounds.
- Extend real MoeJS and unmodified-host UI checks for complete/bounded album lists and sign-in guidance in light/dark, narrow/desktop layouts.

## 0.1.1

- Replace album-sized “Next page” cover cards with the official host's compact section continuation action.
- Increase album browsing to 200 items per page with one-item lookahead and visible item ranges; preserve existing continuation links without skipping items.
- Show the complete artist index in the host's virtualized grid instead of splitting the already-fetched index into artificial pages.
- Keep automatic incremental loading for search, liked tracks and saved albums; Browse remains explicit navigation because the official host has no append interface for it.
- Add empty/exact-boundary paging regressions and real MoeJS-to-UI tests for virtualized rows, compact continuation, narrow/desktop widths and light/dark themes on pristine official hosts.

## 0.1.0

Initial standalone MyGo Music source plugin targeting Subsonic API 1.16.1.

- Modular strict TypeScript, bundled as an installable single-file ES module.
- Token/salt and explicit legacy authentication, LAN HTTP support, persistent configuration-bound login markers and logout/settings invalidation.
- One server/account with up to five comma/newline-separated addresses, tried in user-defined order; normalization and stable deduplication.
- Bounded address probing and read failover without replaying mutations; selected entrances used for authenticated media URLs.
- Library browsing, search, favorites, playlists, playback/artwork, lyrics and opt-in scrobbling.
- Duplicate-safe playlist removal/reordering and a per-playlist local mutation queue.
- Official-compatible text settings, Simplified Chinese localization, Chinese/English documentation, AGPL-3.0-only license, packaging and CI.
- No multi-server/account management, host patches or custom native-control dependency.
- Local HTTP integration tests and pristine official MoeJS/ZIP installer fixtures, including standalone-TS and unsupported import-bridge regressions.

Live-server interoperability and actual audio decoding/transcoding still require deployment testing; no individual server-product certification is claimed.
