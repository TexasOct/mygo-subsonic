import type { Configuration, Parameters, Session } from "./types.js";
import { fail, t } from "./errors.js";
import { serverAddresses } from "./addresses.js";
import { resetCaches } from "./cache.js";

export const SESSION = "account";
export const CONNECTION_KEYS = new Set(["serverUrl", "username", "password", "authMode", "musicFolderId"]);
let epoch = 0;
export function invalidateConfiguration(): void { epoch++; resetCaches(); }

export function configuration(): Configuration {
  const urls = serverAddresses(host.setting("serverUrl"));
  const username = host.setting("username").trim();
  // Do not trim a password: leading and trailing spaces are significant.
  const password = host.setting("password");
  if (!urls.length || !username || !password) throw fail("setup", t("Server address, username or password is missing."));
  const authMode = host.setting("authMode").trim() || "token";
  if (authMode !== "token" && authMode !== "legacy") throw fail("setup", t("Sign-in method must be blank, token or legacy."));
  return {
    urls, epoch, username, password, authMode,
    folder: host.setting("musicFolderId").trim(),
    scrobble: host.setting("scrobble").trim().toLowerCase() === "true",
  };
}

export function connectionKey(config: Configuration): string {
  // A local change detector, NOT encryption or a remote authentication token.
  return host.crypto.md5(JSON.stringify([config.urls, config.username, config.password, config.authMode, config.folder]));
}

export function signedConfiguration(): Configuration {
  const config = configuration();
  if (host.storage.get<Session>(SESSION)?.key !== connectionKey(config)) throw fail("signIn", t("Sign in to Subsonic to open your music library."));
  return { ...config, requireSession: true };
}

export function assertCurrent(config: Configuration): void {
  if (config.epoch !== epoch || connectionKey(configuration()) !== connectionKey(config)) throw fail("signIn", t("Your connection settings changed. Sign in again to use them."));
  if (config.requireSession && host.storage.get<Session>(SESSION)?.key !== connectionKey(config)) throw fail("signIn", t("Sign in to Subsonic to open your music library."));
}

export function authentication(config: Configuration): Parameters {
  if (config.authMode === "legacy") {
    // Protocol escaping, NOT encryption. Preserve a literal "enc:" prefix.
    const bytes = encodeURIComponent(config.password).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return { p: `enc:${Array.from(bytes, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("")}` };
  }
  // MoeJS exposes no crypto RNG. The salt is a public nonce, not a secret.
  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return { t: host.crypto.md5(config.password + salt), s: salt };
}
