import test from "node:test";
import assert from "node:assert/strict";
import { fixture, md5, song } from "./helpers.mjs";

// Quality preferences must never transcode formats the host can decode directly.
test("all quality preferences preserve supported originals and authenticate raw URLs", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const [suffix, contentType, type, actualQuality] of [
    ["flac", "audio/flac", "flac", "lossless"],
    ["mp3", "audio/mpeg", "mp3", "high"],
    ["ogg", "audio/ogg; codecs=vorbis", "ogg", "high"],
  ]) {
    f.handle(() => ({ song: song("s /&+", { suffix, contentType, size: 123456, bitRate: 900 }) }));
    for (const quality of [undefined, "standard", "high", "lossless"]) {
      const result = await f.plugin.stream({ id: "s /&+", quality });
      assert.equal(result.type, type);
      assert.equal(result.quality, actualQuality);
      assert.equal(result.size, 123456);
      assert.equal(result.bitRate, 900);
      const url = new URL(result.url);
      assert.equal(url.protocol, "http:");
      assert.equal(url.pathname, "/music/rest/stream.view");
      assert.equal(url.searchParams.get("id"), "s /&+");
      assert.equal(url.searchParams.get("format"), "raw");
      assert.equal(url.searchParams.has("maxBitRate"), false);
      assert.equal(url.searchParams.has("estimateContentLength"), false);
      assert.equal(url.searchParams.get("t"), md5(f.settings.password + url.searchParams.get("s")));
      assert.equal(url.searchParams.has("p"), false);
    }
  }
});

// Only known formats without a host decoder use compatibility transcoding.
test("unsupported codecs transcode without reporting source size or lossless quality", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const extra of [
    { suffix: "wav", contentType: "audio/wav" },
    { suffix: "m4a", contentType: "audio/mp4; codecs=alac" },
    { suffix: "aac" }, { suffix: "alac" }, { suffix: "aiff" },
    { suffix: "opus", contentType: "audio/ogg" },
    { suffix: "ogg", contentType: "audio/opus" },
    { suffix: "oga", contentType: "audio/opus; codecs=opus" },
    { suffix: "mp1", contentType: "audio/mpeg" },
    { suffix: "mp2", contentType: "audio/mpeg" },
    { suffix: "ogg", contentType: "audio/ogg; codecs=opus" },
    { suffix: "ogg", contentType: 'audio/ogg; codecs="flac"' },
    { suffix: "oga", contentType: "audio/ogg; codecs=speex" },
  ]) {
    f.handle(() => ({ song: song("s", { ...extra, size: 123456, bitRate: 900 }) }));
    for (const [quality, bitrate] of [["standard", 128], ["high", 320], ["lossless", 320]]) {
      const result = await f.plugin.stream({ id: "s", quality });
      assert.equal(result.type, "mp3");
      assert.equal(result.quality, quality === "standard" ? "standard" : "high");
      assert.equal(result.bitRate, bitrate);
      assert.equal(result.size, undefined);
      const url = new URL(result.url);
      assert.equal(url.searchParams.get("format"), "mp3");
      assert.equal(url.searchParams.get("maxBitRate"), String(bitrate));
    }
  }
});

// MIME-only metadata and aliases can identify an original without a downgrade.
test("original format metadata supports MIME-only, aliases and case normalization", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const [extra, type] of [
    [{ suffix: "", contentType: "audio/flac" }, "flac"],
    [{ suffix: undefined, contentType: "audio/mpeg" }, "mp3"],
    [{ suffix: " FLAC ", contentType: "Audio/X-FLAC" }, "flac"],
    [{ suffix: "flac", contentType: "application/octet-stream" }, "flac"],
    [{ suffix: "oga", contentType: 'audio/ogg; codecs="vorbis"' }, "ogg"],
  ]) {
    f.handle(() => ({ song: song("s", extra) }));
    const result = await f.plugin.stream({ id: "s", quality: "standard" });
    assert.equal(result.type, type);
    assert.equal(result.quality, type === "flac" ? "lossless" : "high");
    assert.equal(new URL(result.url).searchParams.get("format"), "raw");
  }
});

// Ambiguous metadata must not trigger an automatic lossy conversion or mislabel.
test("unknown and conflicting formats stop without silently transcoding", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const extra of [
    { suffix: "", contentType: "" },
    { suffix: "mystery", contentType: "application/octet-stream" },
    { suffix: "flac", contentType: "audio/wav" },
    { suffix: "wav", contentType: "audio/flac" },
    { suffix: "flac", contentType: "audio/webm" },
    { suffix: "flac", contentType: "audio/flac; codecs=opus" },
    { suffix: "ogg", contentType: "audio/ogg; codecs=unknown" },
    { suffix: "opus", contentType: "audio/ogg; codecs=vorbis" },
    { suffix: "opus", contentType: "audio/ogg; codecs=flac" },
    { suffix: "ogg", contentType: "audio/opus; codecs=vorbis" },
    { suffix: "mp2", contentType: "audio/mpeg; codecs=mp3" },
    { suffix: "wav", contentType: "audio/ogg; codecs=flac" },
  ]) {
    f.handle(() => ({ song: song("s", extra) }));
    for (const quality of ["standard", "high", "lossless"]) {
      await assert.rejects(f.plugin.stream({ id: "s", quality }), { code: "unsupported" });
    }
  }
});

// A missing song, video or denied metadata request cannot bypass validation.
test("all quality preferences validate song availability and propagate metadata failures", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const quality of ["standard", "high", "lossless"]) {
    for (const response of [{}, { song: song("s", { isVideo: true }) }]) {
      f.handle(() => response);
      await assert.rejects(f.plugin.stream({ id: "s", quality }), { code: "unavailable" });
    }
    f.handle(() => ({ status: "failed", error: { code: 50 } }));
    await assert.rejects(f.plugin.stream({ id: "s", quality }), { code: "server" });
  }
});

// Structured lyric offsets are milliseconds and positive offsets shift earlier.
test("OpenSubsonic synced lyrics choose timed lines and apply offsets", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => method === "getSong" ? { song: song("s"), openSubsonic: true } : {
    lyricsList: { structuredLyrics: [{ synced: false, line: [{ value: "plain" }] }, { synced: true, offset: 100, line: [{ start: 50, value: "first" }, { start: 2100, value: "second" }] }] },
  } });
  await f.plugin.signIn();
  assert.deepEqual(await f.plugin.lyrics({ id: "s" }), { lines: [{ start: 0, text: "first" }, { start: 2000, text: "second" }] });
});

// Legacy servers use getLyrics; absent OpenSubsonic methods may fall back too.
test("lyrics fallback works without hiding authentication errors", async (t) => {
  const f = await fixture(t, { handler: ({ method }) => method === "getSong" ? { song: song("s"), openSubsonic: true } : method === "getLyricsBySongId" ? { status: "failed", error: { code: 0 } } : { lyrics: { value: "[00:01.00]Hello" } } });
  await f.plugin.signIn();
  assert.deepEqual(await f.plugin.lyrics({ id: "s" }), { lrc: "[00:01.00]Hello" });
  assert.equal(f.calls.at(-1).params.get("artist"), "Artist");
  f.handle(({ method }) => method === "getSong" ? { song: song("s"), openSubsonic: true } : { status: "failed", error: { code: 40 } });
  await assert.rejects(f.plugin.lyrics({ id: "s" }), { code: "signIn" });
});
