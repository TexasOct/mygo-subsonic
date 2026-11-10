import type { Configuration, Parameters, SubsonicResponse } from "./types.js";
import { authentication, connectionKey } from "./config.js";
import { MemoryCache } from "./cache.js";
import { apiFailure, fail, PluginError, t } from "./errors.js";
import { currentBase, routedRequest } from "./routing.js";

export function parameters(config: Configuration, values: Parameters = {}): URLSearchParams {
  const params = new URLSearchParams({ u: config.username, v: "1.16.1", c: "mygo-subsonic", f: "json" });
  for (const [key, value] of Object.entries({ ...authentication(config), ...values })) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  return params;
}

// Stable artwork URLs let the host's image cache work across independent maps.
// Audio and ordinary API authentication remain fresh for every request.
const covers = new MemoryCache(5 * 60000, 2048, 2 * 1024 * 1024);
let coverScope = "";
export function invalidateCoverURLs(): void { covers.clear(); }

export function mediaURL(config: Configuration, method: "stream" | "getCoverArt", values: Parameters): string {
  const base = currentBase(config); // Validates configuration/session even on hits.
  const build = () => `${base}/rest/${method}.view?${parameters(config, values)}`;
  if (method === "stream") return build();
  const scope = JSON.stringify([config.epoch, connectionKey(config), base]);
  if (scope !== coverScope) { covers.clear(); coverScope = scope; }
  const key = JSON.stringify(values);
  const cached = covers.get(key);
  if (cached !== undefined) return cached;
  // Legacy auth has no random salt to rotate the host's cache key after edits
  // or expiry. A fragment is local-only and is not sent to the Subsonic server.
  const fragment = config.authMode === "legacy" ? `#cover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` : "";
  const url = build() + fragment;
  covers.set(key, url);
  return url;
}

export async function request(config: Configuration, method: string, values: Parameters = {}, options: { refreshRoute?: boolean; deadline?: number } = {}): Promise<SubsonicResponse> {
  // Leave headroom beneath the host's 30-second call limit, including probes
  // and retries. Each attempt also has its shorter endpoint-specific budget.
  const deadline = Math.min(Date.now() + 25000, options.deadline ?? Infinity);
  const remaining = deadline - Date.now();
  const expired = () => fail("network", t("Could not connect to Subsonic. Check the server address, network and HTTPS certificate."));
  if (remaining <= 0) throw expired();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    // A concurrent caller may own the shared route probe. Bound our wait too,
    // without cancelling the probe that other callers are still using.
    return await Promise.race([
      routedRequest(config, method, values, {
        probe: send,
        send: (current, base, operation, params, timeout) => {
          const left = deadline - Date.now();
          if (timedOut || left <= 0) throw expired();
          return send(current, base, operation, params, Math.min(timeout, left));
        },
      }, options.refreshRoute),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(expired()); }, remaining); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function prepareMedia(config: Configuration): Promise<void> { await request(config, "ping", {}, { refreshRoute: true }); }

async function send(config: Configuration, base: string, method: string, values: Parameters, timeout: number): Promise<SubsonicResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // POST avoids credentials in API URLs. Media still requires GET, as the
    // app's audio and image loaders download URLs themselves.
    const response = await fetch(`${base}/rest/${method}.view`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: parameters(config, values).toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      const denied = [401, 403].includes(response.status);
      throw new PluginError(denied ? "signIn" : "network", denied ? t("The server refused access. Check your sign-in details and any reverse proxy access rules.") : `${t("The server returned HTTP status")}: ${response.status}`, undefined, response.status);
    }
    // Body transport failures must remain network errors, not JSON errors:
    // a server can send headers and then stall or drop the connection.
    const text = await response.text();
    let json: { "subsonic-response"?: SubsonicResponse };
    try { json = JSON.parse(text); }
    catch { throw fail("server", t("This address did not return Subsonic data. Check the server address and reverse proxy settings.")); }
    const envelope = json?.["subsonic-response"];
    if (!envelope || !["ok", "failed"].includes(envelope.status)) throw fail("server", t("The server returned incomplete Subsonic data. Check its API support."));
    if (envelope.status === "failed") throw apiFailure(envelope.error);
    return envelope;
  } catch (error) {
    if (error instanceof PluginError) throw error;
    // Network errors can echo secrets. Return our own sanitized message.
    throw fail("network", t("Could not connect to Subsonic. Check the server address, network and HTTPS certificate."));
  } finally { clearTimeout(timer); }
}
