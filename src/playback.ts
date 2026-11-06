import type { Stream } from "./types.js";
import { signedConfiguration } from "./config.js";
import { mediaURL, prepareMedia, request } from "./client.js";
import { fail, t } from "./errors.js";
import { identifier } from "./paging.js";

export async function stream({ id, quality = "high" }: { id: string; quality?: string }): Promise<Stream> {
  const config = signedConfiguration();
  id = identifier(id);
  if (quality === "lossless") {
    const response = await request(config, "getSong", { id }, { refreshRoute: true });
    const song = response.song;
    if (!song || song.isVideo) throw fail("unavailable", t("This item is missing or is a video. Only audio tracks can be played."));
    const suffix = String(song.suffix || "").toLowerCase();
    // Ogg can carry Opus, which MyGo's Vorbis decoder cannot read.
    const opus = String(song.contentType || "").toLowerCase().includes("opus");
    if ((suffix === "mp3" || suffix === "flac" || suffix === "ogg") && !opus) {
      const result: Stream = { url: mediaURL(config, "stream", { id, format: "raw" }), type: suffix, quality: suffix === "flac" ? "lossless" : "high" };
      if (song.size && song.size > 0) result.size = song.size;
      if (song.bitRate && song.bitRate > 0) result.bitRate = song.bitRate;
      return result;
    }
    // AAC/ALAC/WAV/Opus need server-side transcoding for the app's decoders.
    quality = "high";
  } else {
    await prepareMedia(config);
  }
  const bitRate = quality === "standard" ? 128 : 320;
  return {
    url: mediaURL(config, "stream", { id, format: "mp3", maxBitRate: bitRate, estimateContentLength: true }),
    type: "mp3", quality: quality === "standard" ? "standard" : "high", bitRate,
  };
}
