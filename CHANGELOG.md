# Changelog

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
