import { fail, t } from "./errors.js";

function baseURL(address: string): string {
  let url: URL;
  try { url = new URL(address); }
  catch { throw fail("setup", t("The server URL must be an absolute HTTP or HTTPS URL.")); }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw fail("setup", t("Use an HTTP or HTTPS base URL without credentials, query parameters or a fragment."));
  }
  return url.href.replace(/\/+$/, "").replace(/\/rest$/i, "");
}

// One text field on the official host: commas or newlines separate entrances
// to the SAME server. Never sort: the user's first address has priority.
export function serverAddresses(value: string): string[] {
  if (!value.trim()) return [];
  const entries = value.split(/[,\r\n]+/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length || entries.length > 5) throw fail("setup", t("Enter one to five server addresses, separated by commas or newlines."));
  return [...new Set(entries.map(baseURL))];
}
