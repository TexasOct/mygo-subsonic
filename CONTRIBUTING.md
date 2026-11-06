# Contributing

## Run locally

Use Node.js 22+ and `zip`:

```sh
npm ci
npm run check
npm run package
npm run test:upstream
```

Install the folder or ZIP from official MyGo Music's **Settings → Plugins → +**. Upstream tests clone a pristine pinned official revision and require its Go toolchain; `MYGO_MUSIC_DIR` optionally supplies a local clone source without testing its uncommitted changes. Set `MYGO_SUBSONIC_ZIP` to also exercise the official ZIP installer. `MYGO_MUSIC_REVISION` accepts a full pinned official commit hash for additional compatibility checks; release validation covers `799ec1bac6d3006ac1aa29e06be9e6ae92cf0028` and `93bf5a6202119305bc36fa7b1da71402c96e6879`.

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

The `test/upstream/*.go.txt` fixtures are intentionally outside a Go module. The upstream script copies them into official MyGo's `internal/plugin` and `internal/app`, where package-private APIs are available. The first fixture tests real MoeJS execution, no-build entrypoint constraints and ZIP installation; the second renders actual plugin Browse responses and checks virtualization, compact continuation, narrow/desktop widths and light/dark themes. Set `MM_FRAMES` to an existing output directory to save UI screenshots. Only tests are added to the temporary checkout; no host implementation is modified.

Host feature/UI implementation work is paused and outside this release. No host patch or second protocol implementation belongs in this repository. Any future upstream submission requires separate confirmation after the usable plugin release.

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
