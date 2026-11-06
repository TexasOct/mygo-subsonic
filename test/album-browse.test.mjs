import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";

const albums = (count) => Array.from({ length: count }, (_, i) => ({ id: `al${i}`, name: `Album ${i}` }));
const list = (items, params) => ({ albumList2: { album: items.slice(Number(params.get("offset")), Number(params.get("offset")) + Number(params.get("size"))) } });

// Large libraries have a bounded window, with no dropped or empty boundary item.
test("album grids stop at 5000 and continue from the next unread server offset", async (t) => {
  let items = albums(5001);
  const f = await fixture(t, { handler: ({ params }) => list(items, params) });
  await f.plugin.signIn();
  const first = await f.plugin.browse({ page: "albums:alphabeticalByName:0" });
  assert.equal(first.sections[0].albums.length, 5000);
  assert.equal(first.sections[1].morePage, "albums:alphabeticalByName:5000");
  assert.equal(first.sections[1].title, "Remaining albums");
  assert.ok(f.calls.filter((c) => c.method === "getAlbumList2").every((c) => Number(c.params.get("size")) <= 500));
  const last = await f.plugin.browse({ page: first.sections[1].morePage });
  assert.deepEqual(last.sections[0].albums.map((a) => a.id), ["al5000"]);
  assert.equal(last.sections.length, 1);
  items = items.slice(0, 5000);
  const exact = await f.plugin.browse({ page: "albums:alphabeticalByName:0" });
  assert.equal(exact.sections.length, 1);
});

// A slow library yields useful results without spending another host call budget.
test("album loading shares one time budget and retains completed batches", async (t) => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  const items = albums(900);
  let requests = 0;
  const f = await fixture(t, { handler: ({ params }) => { requests++; now += 8100; return list(items, params); } });
  await f.plugin.signIn();
  const result = await f.plugin.browse({ page: "albums:newest:0" });
  assert.equal(requests, 1);
  assert.equal(result.sections[0].albums.length, 500);
  assert.equal(result.sections[1].morePage, "albums:newest:500");
});

// Incomplete data must not disguise expired credentials or a broken server API.
test("album loading preserves partial network results but propagates auth and protocol errors", async (t) => {
  const items = albums(700);
  let response = { httpStatus: 503 };
  const f = await fixture(t, { handler: ({ params }) => Number(params.get("offset")) ? response : list(items, params) });
  await f.plugin.signIn();
  const partial = await f.plugin.browse({ page: "albums:newest:0" });
  assert.equal(partial.sections[0].albums.length, 500);
  assert.equal(partial.sections[1].morePage, "albums:newest:500");
  response = { status: "failed", error: { code: 40 } };
  await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "signIn" });
  response = { raw: {} };
  await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
});

// Offset progression follows server positions even when adjacent batches overlap.
test("album batches deduplicate overlaps and reject an ignored offset", async (t) => {
  const items = albums(700);
  const f = await fixture(t, { handler: ({ params }) => Number(params.get("offset")) ? { albumList2: { album: [items[499], ...items.slice(500)] } } : list(items, params) });
  await f.plugin.signIn();
  const result = await f.plugin.browse({ page: "albums:newest:0" });
  assert.equal(result.sections[0].albums.length, 700);
  assert.equal(new Set(result.sections[0].albums.map((a) => a.id)).size, 700);
  f.handle(() => ({ albumList2: { album: items.slice(0, 500) } }));
  const before = f.calls.length;
  await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
  assert.equal(f.calls.length - before, 2);
  f.handle(() => ({ albumList2: { album: [{ name: "No ID" }] } }));
  await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
  f.handle(() => ({ albumList2: { album: albums(501) } }));
  await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
  for (const malformed of [{}, { albumList2: [] }, { albumList2: { album: {} } }]) {
    f.handle(() => malformed);
    await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
    f.handle(({ params }) => Number(params.get("offset")) ? malformed : list(items, params));
    await assert.rejects(f.plugin.browse({ page: "albums:newest:0" }), { code: "server" });
  }
  f.handle(() => ({ albumList2: {} }));
  assert.deepEqual((await f.plugin.browse({ page: "albums:newest:0" })).sections, [{ albums: [] }]);
});

// The deadline also caps a response body that stops arriving mid-batch.
test("a stalled later album response uses the remaining shared deadline", async (t) => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  const items = albums(700);
  const f = await fixture(t, { handler: ({ params }) => {
    if (Number(params.get("offset"))) return { stallBody: true };
    now += 7990;
    return list(items, params);
  } });
  await f.plugin.signIn();
  const result = await f.plugin.browse({ page: "albums:newest:0" });
  assert.equal(result.sections[0].albums.length, 500);
  assert.equal(result.sections[1].morePage, "albums:newest:500");
});
