import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import * as plugin from "../index.js";

export const md5 = (text) => createHash("md5").update(text).digest("hex");
export const song = (id, extra = {}) => ({ id, title: `Song ${id}`, album: "Album", albumId: "al1", artist: "Artist", artistId: "ar1", duration: 123.456, suffix: "flac", ...extra });

export async function fixture(test, options = {}) {
  const settings = { username: "listener", password: " 密码 +&= ", authMode: "", musicFolderId: "", scrobble: "", ...options.settings };
  const storage = new Map();
  const calls = [];
  const prompts = [];
  let handler = options.handler || (() => ({}));
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const url = new URL(req.url, "http://localhost");
      const params = new URLSearchParams(Buffer.concat(chunks).toString());
      const method = url.pathname.split("/").at(-1).replace(/\.view$/, "");
      const call = { method, params, url, headers: req.headers, verb: req.method };
      calls.push(call);
      const value = method === "ping" && !options.interceptPing ? {} : await handler(call);
      if (res.writableEnded) return;
      if (value?.stallBody) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write('{"subsonic-response":');
        return; // Deliberately leave the body incomplete until the client aborts.
      }
      if (value?.httpStatus) {
        res.writeHead(value.httpStatus, value.headers || {});
        res.end(value.text || "");
      } else {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(value?.raw ?? { "subsonic-response": { status: "ok", version: "1.16.1", ...value } }));
      }
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  settings.serverUrl = `http://127.0.0.1:${server.address().port}/music`;
  const previousHost = globalThis.host;
  globalThis.host = {
    setting: (key) => settings[key] || "", t: (text) => text, crypto: { md5 },
    signInPrompt: (prompt) => prompts.push(structuredClone(prompt)),
    storage: { get: (key) => storage.get(key), set: (key, value) => storage.set(key, structuredClone(value)), remove: (key) => storage.delete(key) },
  };
  test.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    globalThis.host = previousHost;
  });
  return { plugin, settings, storage, calls, prompts, server, handle: (next) => { handler = next; } };
}
