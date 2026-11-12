import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Always test a pristine official revision, never a locally modified host.
const revision = process.env.MYGO_MUSIC_REVISION || "552e25c04023aa00c551d77db69aaab16f60bf2d";
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
  // PR #152 controls only exist on 0.1.24+; retain legacy-host coverage.
  const typedSettings = existsSync(path.join(checkout, "internal/app/ui_source_settings.go"));
  if (typedSettings) {
    await cp("test/upstream/settings_ui_test.go.txt", path.join(checkout, "internal/app/subsonic_settings_external_test.go"));
  }
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
  execFileSync("go", ["test", "./internal/app", "-run", "^TestSubsonic(BrowseUI|SignInUI|SettingsUI)$", "-count=1", "-v"], {
    cwd: checkout,
    stdio: "inherit",
    env,
  });
  if (typedSettings) {
    execFileSync("go", ["test", "-race", "./internal/app", "-run", "^Test(SubsonicSettingsUI|TypedSetting)", "-count=5"], {
      cwd: checkout,
      stdio: "inherit",
      env,
    });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
