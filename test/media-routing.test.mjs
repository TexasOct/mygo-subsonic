import test from "node:test";
import assert from "node:assert/strict";
import { fixture, song } from "./helpers.mjs";

// A new playback attempt re-probes even before the metadata route cache expires.
test("playback retries immediately switch from a disconnected LAN to public entrance", async (t) => {
  const f = await fixture(t, { interceptPing: true });
  const base = f.settings.serverUrl;
  f.settings.serverUrl = `${base}/lan, ${base}/wan`;
  let disconnected = false;
  f.handle((call) => disconnected && call.url.pathname.includes("/lan/") ? { httpStatus: 503 } : call.method === "getSong" ? { song: song("track") } : {});
  await f.plugin.signIn();
  assert.equal(f.calls.length, 1);
  disconnected = true;
  const stream = await f.plugin.stream({ id: "track" });
  assert.equal(new URL(stream.url).pathname, "/music/wan/rest/stream.view");
  assert.deepEqual(f.calls.map((call) => call.url.pathname), ["/music/lan/rest/ping.view", "/music/lan/rest/ping.view", "/music/wan/rest/ping.view", "/music/wan/rest/getSong.view"]);
});

// Raw and transcoded lossless requests both reconsider preferred entrances immediately.
for (const [suffix, format] of [["flac", "raw"], ["m4a", "mp3"]]) {
  test(`lossless ${format} playback returns to recovered LAN before metadata cache expiry`, async (t) => {
    const f = await fixture(t, { interceptPing: true });
    const base = f.settings.serverUrl;
    f.settings.serverUrl = `${base}/lan, ${base}/wan`;
    let recovered = false;
    f.handle((call) => {
      if (!recovered && call.url.pathname.includes("/lan/")) return { httpStatus: 503 };
      return call.method === "getSong" ? { song: song("track", { suffix }) } : {};
    });
    await f.plugin.signIn();
    recovered = true;
    const stream = await f.plugin.stream({ id: "track", quality: "lossless" });
    const url = new URL(stream.url);
    assert.equal(url.pathname, "/music/lan/rest/stream.view");
    assert.equal(url.searchParams.get("format"), format);
    assert.deepEqual(f.calls.map((call) => call.url.pathname), [
      "/music/lan/rest/ping.view", "/music/wan/rest/ping.view",
      "/music/lan/rest/ping.view", "/music/lan/rest/getSong.view",
    ]);
  });
}
