import type { Lyrics, SubsonicResponse } from "./types.js";
import { signedConfiguration } from "./config.js";
import { request } from "./client.js";
import { fail, PluginError, t } from "./errors.js";
import { array } from "./mappers.js";
import { identifier } from "./paging.js";

export async function lyrics({ id }: { id: string }): Promise<Lyrics> {
  const config = signedConfiguration();
  id = identifier(id);
  const songResponse = await request(config, "getSong", { id });
  const song = songResponse.song;
  if (!song) throw fail("unavailable", t("This track is no longer available on the server. Reload the library."));
  if (songResponse.openSubsonic) {
    let response: SubsonicResponse | undefined;
    try { response = await request(config, "getLyricsBySongId", { id }); }
    catch (error) {
      // Only absent-method errors may fall back. Never swallow auth, permission,
      // TLS or connection failures. OpenSubsonic does not require this endpoint.
      if (!(error instanceof PluginError) || (error.subsonicCode !== 0 && error.httpStatus !== 404)) throw error;
    }
    const choices = array(response?.lyricsList?.structuredLyrics);
    const selected = choices.find((item) => item.synced && array(item.line).length) || choices.find((item) => array(item.line).length);
    if (selected?.synced) {
      const offset = Number(selected.offset || 0);
      return { lines: array(selected.line).map((line) => ({ start: Math.max(0, Number(line.start || 0) - offset), text: line.value || "" })) };
    }
    if (selected) return { lrc: array(selected.line).map((line) => line.value || "").join("\n") };
  }
  const response = await request(config, "getLyrics", { artist: song.artist || "", title: song.title || "" });
  return { lrc: response.lyrics?.value || "" };
}
