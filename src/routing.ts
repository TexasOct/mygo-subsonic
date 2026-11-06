import type { Configuration, Parameters, SubsonicResponse } from "./types.js";
import { assertCurrent, connectionKey } from "./config.js";
import { fail, PluginError, t } from "./errors.js";

type Send = (config: Configuration, base: string, method: string, values: Parameters, timeout: number) => Promise<SubsonicResponse>;
interface Route { key: string; base: string; checked: number; failed: string[] }
let active: Route | undefined;
let pending: { key: string; promise: Promise<Route> } | undefined;
const routeKey = (config: Configuration) => `${config.epoch}:${connectionKey(config)}`;
const timeout = (config: Configuration) => config.urls.length > 1 ? 1500 : 20000;
const READS = new Set(["ping", "getAlbumList2", "getArtists", "search3", "getPlaylists", "getPlaylist", "getAlbum", "getArtist", "getSong", "getStarred2", "getLyrics", "getLyricsBySongId"]);
const retryable = (error: unknown): error is PluginError => error instanceof PluginError && error.code === "network" && (error.httpStatus === undefined || [404, 408, 429, 500, 502, 503, 504].includes(error.httpStatus));

export function resetRoute(): void { active = undefined; pending = undefined; }
export function currentBase(config: Configuration): string {
  assertCurrent(config);
  const base = active?.key === routeKey(config) ? active.base : undefined;
  if (!base) throw fail("network", t("No reachable server address. Sign in again to select an address."));
  return base;
}

async function select(config: Configuration, send: Send, excluded = new Set<string>()): Promise<Route> {
  const key = routeKey(config);
  let last: unknown;
  const failed: string[] = [];
  for (const base of config.urls) {
    if (excluded.has(base)) continue;
    try {
      assertCurrent(config);
      await send(config, base, "ping", {}, timeout(config));
      assertCurrent(config);
      const result = { key, base, checked: Date.now(), failed };
      active = result;
      return result;
    } catch (error) {
      if (!retryable(error)) throw error;
      failed.push(base);
      last = error;
    }
  }
  throw last ?? fail("network", t("No reachable server address. Sign in again to select an address."));
}

async function route(config: Configuration, send: Send, excluded = new Set<string>(), refresh = false): Promise<Route> {
  const key = routeKey(config);
  const probeKey = `${key}:${JSON.stringify(config.urls.filter((base) => excluded.has(base)))}`;
  assertCurrent(config);
  // Re-evaluate from highest priority after 30 seconds. Concurrent reads share
  // probing, so a home page does not probe each endpoint three times.
  if (pending?.key === probeKey) return pending.promise;
  if (!refresh && active?.key === key && !excluded.has(active.base) && Date.now() - active.checked < 30000) return active;
  const promise = select(config, send, excluded);
  pending = { key: probeKey, promise };
  try { return await promise; }
  finally { if (pending?.promise === promise) pending = undefined; }
}

export async function routedRequest(config: Configuration, method: string, values: Parameters, send: Send, refresh = false): Promise<SubsonicResponse> {
  let selected = await route(config, send, new Set(), refresh);
  // route() already performed an authenticated ping when there was no cache.
  // A sign-in resets the cache first, and does not need a duplicate request.
  if (method === "ping") return { status: "ok" };
  const tried = new Set<string>();
  while (true) {
    for (const base of selected.failed) tried.add(base);
    tried.add(selected.base);
    assertCurrent(config);
    try {
      const response = await send(config, selected.base, method, values, READS.has(method) ? Math.max(2500, Math.floor(15000 / config.urls.length)) : 20000);
      assertCurrent(config);
      return response;
    } catch (error) {
      if (retryable(error) && active?.base === selected.base && active.key === selected.key) active = undefined;
      // A mutation might have committed before a connection failure. Never
      // replay it, even on another URL for the same server.
      if (!READS.has(method) || !retryable(error) || tried.size >= config.urls.length) throw error;
      selected = await route(config, send, tried);
    }
  }
}

// The host cannot report a failed audio download to this module. Revalidate
// on each new playback URL, so retrying playback does not reuse a dead cache.
export async function mediaBase(config: Configuration, send: Send): Promise<void> { await route(config, send, new Set(), true); }
