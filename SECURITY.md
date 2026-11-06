# Security / 安全说明

## Credentials and transport / 凭据与传输

- Official MyGo Music displays plugin settings as text and saves them as plain JSON, including passwords. This release does not provide password masking. This plugin cannot provide encrypted credential storage through the current host API. Protect the application data directory and device backups; use a dedicated low-privilege server account.
- Token authentication is Subsonic's `MD5(password + salt)` protocol, not password encryption. MoeJS exposes no cryptographic random source; the public salt combines time with random values. No cryptographic randomness is claimed.
- `legacy` is explicit opt-in and sends the UTF-8 password as `p=enc:<hex>`; this is reversible encoding, not encryption. Metadata requests send authentication in POST form bodies. Audio and artwork must use authenticated GET URLs, so media URLs are secrets: do not paste them into issues or retain them in public logs. A token URL can be replayed until credentials change or the server rejects it.
- HTTP is intentionally allowed for LAN deployments. It exposes credentials/tokens and music traffic to network observers. HTTPS is recommended outside trusted local networks. TLS certificate validation is not bypassed.
- Metadata requests reject redirects to avoid forwarding credentials. Configure the final server URL. MyGo's separate audio/image downloaders control media redirects; the plugin cannot enforce the same policy for those requests.
- Every configured address may receive the same authentication data during probes or requests. Only configure trusted entrances to the SAME server; the client cannot prove they share a database or operator. Read failover does not replay writes. Resource IDs remain server-native: clear old queues and reload music before manually replacing the server/account; cross-server queue isolation is not provided.
- Network permission is `*` because users choose arbitrary public or private servers. A private deployment may narrow `plugin.json` to its server hostname using MyGo's permission rules. The plugin requests no process-execution permission and intentionally ignores arbitrary external artist image URLs.
- Server error text is not displayed verbatim, since it may echo sensitive URLs. Do not add request/response logging that exposes authentication.
- The local connection fingerprint only detects setting changes. It is not encryption, a remote session token, or a substitute for OS file protection. Signing out removes the plugin's local marker; it cannot revoke media URLs that have already been issued or cached by the host.

官方 MyGo 会明文显示和保存设置（包括密码），本插件不提供密码遮罩。同一配置的每个地址都可能收到该账号的鉴权信息，只能填写可信的同一服务器入口。请保护设备、应用数据和备份，使用专用低权限账号。局域网 HTTP 有意保留，但流量不加密；token 鉴权不能代替 TLS。封面与音频 URL 含可重放的鉴权信息，不要把它们贴到 Issue、日志或截图中。插件退出登录仅清除本地标记，不会使已经生成的 URL 在服务器端失效。

## Reporting / 漏洞报告

Do not publish credentials, tokens, authenticated URLs, application settings, or a live vulnerable server in an issue. Use a private repository security advisory if the hosting repository enables it; otherwise contact the repository maintainer privately before disclosure. Repository: https://github.com/TexasOct/mygo-subsonic. Redacted reproductions against a disposable local server are preferred.

请勿在公开 Issue 中提交真实凭据或服务器地址。若仓库启用了私人安全报告，请优先使用；否则先私下联系维护者，并用可丢弃的本地服务器制作脱敏复现。

## Scope / 范围

The adapter implements a client-side subset of Subsonic API 1.16.1 plus optional OpenSubsonic lyrics. Server authorization, account privileges, transcoding and MyGo's storage/download security remain the responsibility of those components. This project has not undergone an independent security audit.
