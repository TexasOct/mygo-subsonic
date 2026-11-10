import { cp, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Always test a pristine official revision, never a locally modified host.
const revision = process.env.MYGO_MUSIC_REVISION || "799ec1bac6d3006ac1aa29e06be9e6ae92cf0028";
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("MYGO_MUSIC_REVISION must be a full pinned commit hash");
if (process.argv.length > 2) throw new Error("Unknown upstream test option");
const temporary = await mkdtemp(path.join(tmpdir(), "mygo-subsonic-upstream-"));
const checkout = path.join(temporary, "mygo-music");
try {
  execFileSync("git", ["clone", "--no-checkout", process.env.MYGO_MUSIC_DIR || "https://github.com/egoist/mygo-music.git", checkout], { stdio: "inherit" });
  execFileSync("git", ["checkout", revision], { cwd: checkout, stdio: "inherit" });
  await cp("test/upstream/subsonic_test.go.txt", path.join(checkout, "internal/plugin/subsonic_external_test.go"));
  await cp("test/upstream/cache_test.go.txt", path.join(checkout, "internal/plugin/subsonic_cache_external_test.go"));
  await cp("test/upstream/audio_test.go.txt", path.join(checkout, "internal/player/subsonic_audio_external_test.go"));
  await cp("test/upstream/browse_ui_test.go.txt", path.join(checkout, "internal/app/subsonic_browse_external_test.go"));
  await cp("test/upstream/sign_in_ui_test.go.txt", path.join(checkout, "internal/app/subsonic_sign_in_external_test.go"));
  const responses = await mkdtemp(path.join(temporary, "browse-"));
  const env = { ...process.env, MYGO_SUBSONIC_DIR: process.cwd(), MYGO_SUBSONIC_BROWSE_DIR: responses };
  execFileSync("go", ["test", "./internal/plugin", "-run", "^TestSubsonic(Runtime|Addresses|Archive|Entrypoints|Browse|SignInPrompts|Cache)$", "-count=1", "-v"], {
    cwd: checkout,
    stdio: "inherit",
    env,
  });
  execFileSync("go", ["test", "./internal/player", "-run", "^TestSubsonicOriginalAudio$", "-count=1", "-v"], {
    cwd: checkout,
    stdio: "inherit",
    env,
  });
  execFileSync("go", ["test", "./internal/app", "-run", "^TestSubsonic(BrowseUI|SignInUI)$", "-count=1", "-v"], {
    cwd: checkout,
    stdio: "inherit",
    env,
  });
} finally { await rm(temporary, { recursive: true, force: true }); }
