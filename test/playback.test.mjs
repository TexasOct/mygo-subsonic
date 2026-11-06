import test from "node:test";
import assert from "node:assert/strict";
import { fixture, md5, song } from "./helpers.mjs";

// Streaming URLs authenticate every fetch and request a format MyGo can decode.
test("stream URLs authenticate on HTTP and map standard/high quality to MP3", async (t) => {
  const f = await fixture(t);
  await f.plugin.signIn();
  for (const [quality, bitrate] of [["standard", "128"], ["high", "320"]]) {
    const result = await f.plugin.stream({ id: "s /&+", quality });
    assert.equal(result.type, "mp3");
    const url = new URL(result.url);
    assert.equal(url.protocol, "http:");
    assert.equal(url.pathname, "/music/rest/stream.view");
    assert.equal(url.searchParams.get("id"), "s /&+");
    assert.equal(url.searchParams.get("format"), "mp3");
    assert.equal(url.searchParams.get("maxBitRate"), bitrate);
    assert.equal(url.searchParams.get("t"), md5(f.settings.password + url.searchParams.get("s")));
    assert.equal(url.searchParams.has("p"), false);
  }
});

// Raw FLAC preserves source bytes, while unsupported codecs fall back honestly.
test("lossless uses raw FLAC with source size, unsupported sources fall back to high MP3", async (t) => {
  const f = await fixture(t, { handler: () => ({ song: song("s", { size: 123456, bitRate: 900 }) }) });
  await f.plugin.signIn();
  const raw = await f.plugin.stream({ id: "s", quality: "lossless" });
  assert.equal(raw.type, "flac");
  assert.equal(raw.quality, "lossless");
  assert.equal(raw.size, 123456);
  assert.equal(new URL(raw.url).searchParams.get("format"), "raw");
  for (const extra of [{ suffix: "m4a" }, { suffix: "ogg", contentType: "audio/ogg; codecs=opus" }]) {
    f.handle(() => ({ song: song("s", extra) }));
    const result = await f.plugin.stream({ id: "s", quality: "lossless" });
    assert.equal(result.type, "mp3");
    assert.equal(result.quality, "high");
    assert.equal(result.size, undefined);
  }
  f.handle(() => ({ song: song("s", { isVideo: true }) }));
  await assert.rejects(f.plugin.stream({ id: "s", quality: "lossless" }), { code: "unavailable" });
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
