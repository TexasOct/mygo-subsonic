import type { Configuration, Parameters, SubsonicResponse } from "./types.js";
import { authentication } from "./config.js";
import { apiFailure, fail, PluginError, t } from "./errors.js";
import { currentBase, mediaBase, routedRequest } from "./routing.js";

export function parameters(config: Configuration, values: Parameters = {}): URLSearchParams {
  const params = new URLSearchParams({ u: config.username, v: "1.16.1", c: "mygo-subsonic", f: "json" });
  for (const [key, value] of Object.entries({ ...authentication(config), ...values })) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  return params;
}

export function mediaURL(config: Configuration, method: "stream" | "getCoverArt", values: Parameters): string {
  return `${currentBase(config)}/rest/${method}.view?${parameters(config, values)}`;
}

export function request(config: Configuration, method: string, values: Parameters = {}, options: { refreshRoute?: boolean } = {}): Promise<SubsonicResponse> {
  // Leave headroom beneath the host's 30-second call limit, including probes
  // and retries. Each attempt also has its shorter endpoint-specific budget.
  const deadline = Date.now() + 25000;
  return routedRequest(config, method, values, (current, base, operation, params, timeout) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw fail("network", t("Cannot reach the Subsonic server. Check its URL, connection and TLS certificate."));
    return send(current, base, operation, params, Math.min(timeout, remaining));
  }, options.refreshRoute);
}

export async function prepareMedia(config: Configuration): Promise<void> { await mediaBase(config, send); }

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
      throw new PluginError(denied ? "signIn" : "network", denied ? t("The server denied access. Check your credentials and reverse proxy.") : `${t("Subsonic HTTP error")}: ${response.status}`, undefined, response.status);
    }
    // Body transport failures must remain network errors, not JSON errors:
    // a server can send headers and then stall or drop the connection.
    const text = await response.text();
    let json: { "subsonic-response"?: SubsonicResponse };
    try { json = JSON.parse(text); }
    catch { throw fail("server", t("The server did not return Subsonic JSON. Check the base URL and reverse proxy.")); }
    const envelope = json?.["subsonic-response"];
    if (!envelope || !["ok", "failed"].includes(envelope.status)) throw fail("server", t("The server did not return a valid Subsonic response."));
    if (envelope.status === "failed") throw apiFailure(envelope.error);
    return envelope;
  } catch (error) {
    if (error instanceof PluginError) throw error;
    // Network errors can echo secrets. Return our own sanitized message.
    throw fail("network", t("Cannot reach the Subsonic server. Check its URL, connection and TLS certificate."));
  } finally { clearTimeout(timer); }
}
