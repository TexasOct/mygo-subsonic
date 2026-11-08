import type { Artist, Configuration, SubsonicAlbum, SubsonicArtist } from "./types.js";
import { mediaURL } from "./client.js";

export function artistCredit(config: Configuration, item?: SubsonicArtist | null): Artist {
  return {
    id: String(item?.id ?? ""), name: (item?.name?.trim() || item?.artist || "").trim(),
    imageUrl: item?.coverArt ? mediaURL(config, "getCoverArt", { id: item.coverArt, size: 600 }) : undefined,
    following: Boolean(item?.starred),
  };
}

// Names alone are display credits, never made-up server IDs. Prefer a real ID
// when the same name appears in an ID-less credit, but preserve distinct IDs
// even when two artists have exactly the same name.
export function mergeCredits(...groups: Artist[][]): Artist[] {
  const items = groups.flat().filter((item) => item.name.trim());
  const nameKey = (item: Artist) => item.name.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
  const identified = new Map<string, Map<string, Artist>>();
  for (const item of items) {
    if (!item.id) continue;
    const key = nameKey(item);
    const matches = identified.get(key) || new Map<string, Artist>();
    matches.set(item.id, item);
    identified.set(key, matches);
  }
  const result = new Map<string, Artist>();
  for (const item of items) {
    const name = nameKey(item);
    const matches = identified.get(name);
    if (!item.id && matches && matches.size > 1) continue;
    const resolved = !item.id && matches?.size === 1 ? matches.values().next().value || item : item;
    const key = resolved.id ? `id:${resolved.id}` : `name:${name}`;
    const previous = result.get(key);
    if (!previous) result.set(key, { ...resolved, name: resolved.name.trim() });
    else result.set(key, { ...previous, imageUrl: previous.imageUrl || resolved.imageUrl, following: previous.following || resolved.following });
  }
  return [...result.values()];
}

// Primary artists describe the release/track itself, not every credited role.
export function primaryCreditsOf(config: Configuration, item: SubsonicAlbum): Artist[] {
  let primary = Array.isArray(item.artists) ? item.artists.map((credit) => artistCredit(config, credit)) : [];
  // Structured names are atomic, even if they contain punctuation. Legacy
  // strings only split unambiguous tag-list separators, not &, /, commas,
  // middle dots or "feat." which may be part of a band or character name.
  if (!primary.some((credit) => credit.name)) {
    const text = item.artist?.trim() || item.displayArtist?.trim() || "";
    const names = text.split(/[;；、\r\n]+/u).map((name) => name.trim()).filter(Boolean);
    primary = names.map((name) => artistCredit(config, { id: names.length === 1 ? item.artistId : undefined, name }));
  }
  return primary;
}

export function creditsOf(config: Configuration, item: SubsonicAlbum): Artist[] {
  const contributors: Artist[] = [];
  for (const credit of Array.isArray(item.contributors) ? item.contributors : []) {
    if (credit?.artist) contributors.push(artistCredit(config, credit.artist));
  }
  // Roles are open strings in OpenSubsonic, including instruments and custom
  // TIPL credits. All roles participate; do not hard-code a performer allowlist.
  // Leave identity resolution to the caller's collection scope: resolving a
  // track first could hide a homonymous ID on a later track of the album.
  return [...primaryCreditsOf(config, item), ...contributors];
}
