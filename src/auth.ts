import type { Account, Configuration, Session } from "./types.js";
import { assertCurrent, configuration, connectionKey, CONNECTION_KEYS, invalidateConfiguration, SESSION } from "./config.js";
import { resetRoute } from "./routing.js";
import { request } from "./client.js";
import { PluginError, t } from "./errors.js";

function guidedFailure(error: unknown, text: string): PluginError {
  const guidance = t(text);
  host.signInPrompt({ text: guidance });
  // The host displays errors instead of prompt text once signIn rejects.
  // Preserve safe diagnostics/categories and keep instructions visible there.
  // Never interpolate credentials, addresses or untrusted server error text.
  if (error instanceof PluginError) return new PluginError(error.code, `${error.message}\n\n${guidance}`, error.subsonicCode, error.httpStatus);
  return new PluginError("server", guidance);
}

export async function signIn(): Promise<Account> {
  invalidateConfiguration();
  resetRoute();
  let config: Configuration;
  try { config = configuration(); } catch (error) {
    throw guidedFailure(error, "Close this window, then open Settings → Plugins → Subsonic. Enter your server address, username and password, then sign in again.");
  }
  const key = connectionKey(config);
  host.storage.remove(SESSION);
  host.signInPrompt({ text: t("Connecting to Subsonic…\nTo change your connection, close this window and open Settings → Plugins → Subsonic.") });
  try {
    await request(config, "ping");
    assertCurrent(config);
    const account = { id: config.username, name: config.username };
    host.storage.set(SESSION, { key, account });
    return account;
  } catch (error) {
    // Logout, edited settings or a newer login own the UI now.
    try { assertCurrent(config); } catch { throw error; }
    let text = "Close this window and check your connection in Settings → Plugins → Subsonic. If it is correct, ask your server administrator to check Subsonic access.";
    if (error instanceof PluginError && error.code === "signIn") text = "Close this window and check Username, Password and Sign-in method in Settings → Plugins → Subsonic. Then sign in again.";
    else if (error instanceof PluginError && error.code === "network") text = "Check your network connection. To edit Server addresses, close this window and open Settings → Plugins → Subsonic. Then sign in again.";
    throw guidedFailure(error, text);
  }
}

export function signOut(): void {
  invalidateConfiguration();
  resetRoute();
  host.storage.remove(SESSION);
}

export function account(): Account | null {
  try {
    const config = configuration();
    const session = host.storage.get<Session>(SESSION);
    return session?.key === connectionKey(config) ? session.account : null;
  } catch { return null; }
}

export function setSetting({ key }: { key: string; value: string }): void {
  if (!CONNECTION_KEYS.has(key)) return;
  // The host persists settings first. Normalization-only edits need no logout;
  // in-flight responses still compare the current connection fingerprint.
  if (account()) return;
  signOut();
}
