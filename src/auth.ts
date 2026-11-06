import type { Account, Session } from "./types.js";
import { assertCurrent, configuration, connectionKey, CONNECTION_KEYS, invalidateConfiguration, SESSION } from "./config.js";
import { resetRoute } from "./routing.js";
import { request } from "./client.js";

export async function signIn(): Promise<Account> {
  invalidateConfiguration();
  resetRoute();
  const config = configuration();
  const key = connectionKey(config);
  host.storage.remove(SESSION);
  await request(config, "ping");
  assertCurrent(config);
  const account = { id: config.username, name: config.username };
  host.storage.set(SESSION, { key, account });
  return account;
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
