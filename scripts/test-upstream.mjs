import { cp, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Always test a pristine official revision, never a locally modified host.
const revision = "799ec1bac6d3006ac1aa29e06be9e6ae92cf0028";
if (process.argv.length > 2) throw new Error("Unknown upstream test option");
const temporary = await mkdtemp(path.join(tmpdir(), "mygo-subsonic-upstream-"));
const checkout = path.join(temporary, "mygo-music");
try {
  execFileSync("git", ["clone", "--no-checkout", process.env.MYGO_MUSIC_DIR || "https://github.com/egoist/mygo-music.git", checkout], { stdio: "inherit" });
  execFileSync("git", ["checkout", revision], { cwd: checkout, stdio: "inherit" });
  await cp("test/upstream/subsonic_test.go.txt", path.join(checkout, "internal/plugin/subsonic_external_test.go"));
  execFileSync("go", ["test", "./internal/plugin", "-run", "^TestSubsonic(Runtime|Addresses|Archive|Entrypoints)$", "-count=1", "-v"], {
    cwd: checkout,
    stdio: "inherit",
    env: { ...process.env, MYGO_SUBSONIC_DIR: process.cwd() },
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
