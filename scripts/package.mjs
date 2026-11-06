import { readFile, mkdir, mkdtemp, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

async function readJSON(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (cause) { throw new Error(`Cannot read JSON from ${file}`, { cause }); }
}
const manifest = await readJSON("plugin.json");
const pkg = await readJSON("package.json");
if (manifest.version !== pkg.version) throw new Error("package.json and plugin.json versions must match");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid release version");
const files = ["plugin.json", manifest.main, "locales", "LICENSE", "README.md", "README.en.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "src", "scripts", "test", "package.json", "package-lock.json", "tsconfig.json"];
const stage = await mkdtemp(path.join(tmpdir(), "mygo-subsonic-"));
const output = path.resolve(`dist/mygo-subsonic-${manifest.version}.zip`);
try {
  await mkdir("dist", { recursive: true });
  for (const file of files) await cp(file, path.join(stage, file), { recursive: true });
  await rm(output, { force: true });
  // Root-level plugin.json lets the upstream installer discover this package.
  execFileSync("zip", ["-q", "-r", output, ...files], { cwd: stage });
  console.log(output);
} finally {
  await rm(stage, { recursive: true, force: true });
}
