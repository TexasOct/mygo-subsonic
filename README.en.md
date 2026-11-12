# MyGo Subsonic

English · [简体中文](README.md)

Listen to your Subsonic library in [MyGo Music](https://github.com/egoist/mygo-music). You need an existing music server and account; this plugin does not provide music or run a server.

## Supported software and features

| Item | Support |
| --- | --- |
| Player | Official MyGo Music **0.1.13+** |
| Music server | Subsonic / OpenSubsonic-compatible servers with API 1.16.1 and the endpoints you use |
| Library | Browse and search tracks, albums, artists and playlists; cover art and lyrics |
| Favorites and playlists | Like tracks, save albums, star artists; create, edit, reorder and delete your own playlists |
| Playback | Original audio first, direct lossless FLAC, and optional listening history sent to your server |

Navidrome, Gonic and original Subsonic are examples of these servers, but have not been individually tested with this plugin. Available features depend on the server.

## Installation

[Install plugin](mygo-music://install-plugin?repo=TexasOct/mygo-subsonic)

If the link does not open, paste this URL into MyGo's **Settings → Plugins → +**:

```text
https://github.com/TexasOct/mygo-subsonic
```

You can also download the plugin ZIP from [Releases](https://github.com/TexasOct/mygo-subsonic/releases) and install it locally. No Node.js or build step is needed.

### First use

1. Open **Settings → Plugins → Subsonic**.
2. Enter your server address (for example, `http://192.168.1.10:4533`), username and password. In MyGo **0.1.24+**, click **Save changes** below the masked password field. Leave the sign-in method at **Default (token, recommended)** unless your server requires legacy authentication.
3. Switch to the Subsonic source and click **Sign In**.

Connection details go in plugin settings. If sign-in fails, close the login window before checking your address and account in settings, then sign in again after making changes.

<a id="configuration"></a>
<a id="configuration-and-authentication"></a>
## Common settings

For LAN and public addresses of the same server, separate them with commas, preferred address first, up to 5 addresses. For example:

```text
http://192.168.1.10:4533, https://music.example.com/navidrome
```

HTTP, HTTPS, ports and subpaths are supported. Only use trusted addresses for the **same server**, with no credentials or query parameters in the URL. Every address may receive the account's authentication data.

| Option | What to enter |
| --- | --- |
| Sign-in method | Keep **Default (token, recommended)** or select **Token**. Select **Legacy password** only if your server requires it. The plugin never switches methods automatically |
| Music folder ID (optional) | Leave blank for all folders. To restrict supported views, enter the server's folder ID, not its name or disk path. Playlists are not filtered |
| Save listening history | Turn on the switch to enable; off by default. Uses MyGo's played event, without checking whether you finished the track |

Native controls require MyGo **0.1.24+** ([upstream PR #152](https://github.com/egoist/mygo-music/pull/152)). Switches and selects save automatically; passwords require **Save changes**. Opening settings does not write defaults or migrate existing values. If a save fails, use **Save changes** to retry or **Discard changes** to restore the previous value.

MyGo **0.1.13–0.1.23** still uses text fields: leave Sign-in method blank or enter `token`, or enter `legacy` only if required; enter `true` for listening history, or leave blank / enter `false` to disable it. Existing settings remain compatible, including the blank token default. Older nonstandard history values (such as `TRUE`) retain a text editor on new hosts until you explicitly replace them with `true` or `false`.

## Things to know

- One server and one account at a time. Clear the old playback queue and reload music before switching servers or accounts.
- Album headers keep album artists/groups, track singers and performing artists, hiding only writing/production credits such as composer, lyricist, arranger, writer and producer. Unknown contributor roles stay visible, and someone also credited as a singer or performer remains displayed. Complete track credits, contributor search and participation links are unaffected. Credits without an artist ID are plain text. Tags not exposed by the server API cannot be recovered; MyGo displays a single track credit list rather than separate role columns.
- Artist browsing adds track artists and other participants from the server's searchable artist catalogue. Artist pages recover contributed albums by verifying actual artist IDs in matching songs, rather than relying only on the album-artist index. This requires searchable songs and real credit IDs from the API; it does not guarantee parity with private web APIs.
- MP3, FLAC and Ogg Vorbis play as original files, even with standard or high quality selected. FLAC stays lossless.
- Official MyGo has no decoder for WAV, AAC, ALAC, Opus and some other formats. Only those formats request server-side MP3 conversion (up to 128 kbps for standard, 320 kbps otherwise), requiring server configuration and permissions. Missing or conflicting format metadata causes an error, not automatic lossy conversion.
- LAN / public address fallback does not guarantee seamless switching for a track already playing.
- Large libraries may load in sections. Use **See All** under **Remaining albums** or **Additional artists** to continue. If an artist's candidate songs exceed the lookup limit or cannot be fully loaded, the page asks you to retry or search for a specific album instead of presenting a failed lookup as an empty discography.
- You can only edit your own playlists. Removing a track removes every occurrence of that track in the playlist.
- Playlist lists and details stay in plugin memory for 30 seconds; local edits invalidate them, and editing still reads fresh server data. Artwork URLs are reused for up to 5 minutes to use MyGo's image cache. Caches are not written to disk or an offline mode; signing out or changing connection settings clears them. MyGo still controls when displayed pages refresh.
- **Passwords are still stored as plain text.** MyGo 0.1.24+ masks the password field; older versions also display it as plain text. Masking is not encryption. Use a dedicated low-privilege account and HTTPS outside trusted networks. Do not share settings screenshots or authenticated audio/artwork URLs. See the [security notes](SECURITY.md).

## Feedback and development

[Open an issue](https://github.com/TexasOct/mygo-subsonic/issues) with your MyGo, plugin and server versions, plus steps to reproduce. Do not include passwords or other sensitive information.

For development, tests and technical details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0-only](LICENSE). This plugin is not maintained by the MyGo Music project.
