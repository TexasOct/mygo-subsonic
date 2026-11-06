import { build } from "esbuild";

// Native plugin runtimes must not resolve npm packages or Node built-ins.
const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  legalComments: "none",
  metafile: true,
  banner: { js: "// Generated from src/*.ts by npm run build. Do not edit.\n// SPDX-License-Identifier: AGPL-3.0-only" },
});
for (const output of Object.values(result.metafile.outputs)) {
  if (output.imports.length) throw new Error("Plugin output must be self-contained");
}
console.log("Built self-contained ESM plugin: index.js");
