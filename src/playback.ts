import type { Stream } from "./types.js";
import { signedConfiguration } from "./config.js";
import { mediaURL, request } from "./client.js";
import { fail, t } from "./errors.js";
import { identifier } from "./paging.js";

type SourceFormat = Stream["type"] | "transcode";
const suffixFormats = new Map<string, SourceFormat>([
  ["mp3", "mp3"], ["flac", "flac"], ["ogg", "ogg"], ["oga", "ogg"],
  ["wav", "transcode"], ["wave", "transcode"], ["aac", "transcode"],
  ["m4a", "transcode"], ["mp4", "transcode"], ["alac", "transcode"],
  ["opus", "transcode"], ["aif", "transcode"], ["aiff", "transcode"],
  ["ape", "transcode"], ["wv", "transcode"], ["wma", "transcode"],
  ["mp1", "transcode"], ["mp2", "transcode"],
]);
const mimeFormats = new Map<string, SourceFormat>([
  ["audio/mpeg", "mp3"], ["audio/mp3", "mp3"],
  ["audio/flac", "flac"], ["audio/x-flac", "flac"],
  ["audio/ogg", "ogg"], ["application/ogg", "ogg"], ["audio/vorbis", "ogg"],
  ["audio/wav", "transcode"], ["audio/wave", "transcode"], ["audio/x-wav", "transcode"],
  ["audio/vnd.wave", "transcode"], ["audio/aac", "transcode"], ["audio/x-aac", "transcode"],
  ["audio/mp4", "transcode"], ["audio/x-m4a", "transcode"], ["audio/alac", "transcode"],
  ["audio/opus", "transcode"], ["audio/aiff", "transcode"], ["audio/x-aiff", "transcode"],
  ["audio/x-ape", "transcode"], ["audio/x-wavpack", "transcode"], ["audio/x-ms-wma", "transcode"],
]);

function sourceFormat(suffix: string, contentType: string): SourceFormat {
  suffix = suffix.trim().toLowerCase();
  const extension = suffixFormats.get(suffix);
  const mime = contentType.split(";")[0]?.trim().toLowerCase() || "";
  const media = mimeFormats.get(mime);
  if (mime && mime !== "application/octet-stream" && !media) return unknownFormat();
  const codec = /\bcodecs\s*=\s*"?([^";]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  // Generic MPEG MIME includes Layer I/II, which the host's MP3 decoder cannot read.
  if ((suffix === "mp1" || suffix === "mp2") && mime === "audio/mpeg") {
    if (codec && codec !== suffix) return unknownFormat();
    return "transcode";
  }
  // Opus has both a dedicated MIME and a shared Ogg container MIME.
  if ((suffix === "opus" && media === "ogg") || (extension === "ogg" && mime === "audio/opus")) {
    if (codec && codec !== "opus") return unknownFormat();
    return "transcode";
  }
  // Ogg is a container, not a codec: MyGo only decodes Vorbis in Ogg.
  if ((media === "ogg" || extension === "ogg") && codec) {
    if (["opus", "flac", "speex"].includes(codec)) {
      if (extension && extension !== "ogg") return unknownFormat();
      if (media && media !== "ogg") return unknownFormat();
      return "transcode";
    }
    if (codec !== "vorbis") return unknownFormat();
  }
  if (codec && (extension === "flac" || media === "flac") && codec !== "flac") {
    return unknownFormat();
  }
  if (codec && (extension === "mp3" || media === "mp3") && codec !== "mp3") {
    return unknownFormat();
  }
  if (extension && media && extension !== media) return unknownFormat();
  const format = extension ?? media;
  if (!format) return unknownFormat();
  return format;
}

function unknownFormat(): never {
  throw fail("unsupported", t("The server did not identify this audio format reliably. Check the track's format metadata; it will not be transcoded automatically."));
}

export async function stream({ id, quality = "high" }: { id: string; quality?: string }): Promise<Stream> {
  const config = signedConfiguration();
  id = identifier(id);
  const response = await request(config, "getSong", { id }, { refreshRoute: true });
  const song = response.song;
  if (!song || song.isVideo) throw fail("unavailable", t("This item is missing or is a video. Only audio tracks can be played."));
  const format = sourceFormat(String(song.suffix || ""), String(song.contentType || ""));
  if (format !== "transcode") {
    const result: Stream = {
      url: mediaURL(config, "stream", { id, format: "raw" }),
      type: format,
      quality: format === "flac" ? "lossless" : "high",
    };
    if (song.size && song.size > 0) result.size = song.size;
    if (song.bitRate && song.bitRate > 0) result.bitRate = song.bitRate;
    return result;
  }
  // Only formats missing a decoder in official MyGo need compatibility transcoding.
  const bitRate = quality === "standard" ? 128 : 320;
  return {
    url: mediaURL(config, "stream", { id, format: "mp3", maxBitRate: bitRate, estimateContentLength: true }),
    type: "mp3", quality: quality === "standard" ? "standard" : "high", bitRate,
  };
}
