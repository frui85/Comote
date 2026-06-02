import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const releaseDir = join(process.cwd(), "release");
const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));

// Map the requested arch to its Rust target triple. Defaults to arm64 so the
// existing `dist:mac` invocation (no arg) keeps producing the Apple Silicon DMG.
const arch = process.argv[2] ?? "arm64";
const targetByArch = {
  arm64: "aarch64-apple-darwin",
  x64: "x86_64-apple-darwin",
};
const target = targetByArch[arch];
if (!target) {
  throw new Error(`Unknown macOS arch: ${arch} (expected arm64 or x64)`);
}

const appPath = join(
  process.cwd(),
  "src-tauri",
  "target",
  target,
  "release",
  "bundle",
  "macos",
  "Comote.app",
);
const dmgPath = join(releaseDir, `Comote-${pkg.version}-${arch}.dmg`);

await mkdir(releaseDir, { recursive: true });

// Stage the app alongside an "Applications" symlink so the mounted DMG shows
// the drag-to-Applications affordance. Finder renders the symlink as the
// /Applications folder icon, giving the standard installer experience.
const stagingDir = await mkdtemp(join(tmpdir(), "comote-dmg-"));
try {
  await cp(appPath, join(stagingDir, "Comote.app"), { recursive: true });
  await symlink("/Applications", join(stagingDir, "Applications"));
  await execFileAsync("hdiutil", [
    "create",
    "-volname",
    "Comote",
    "-srcfolder",
    stagingDir,
    "-ov",
    "-format",
    "UDZO",
    dmgPath,
  ]);
} finally {
  await rm(stagingDir, { recursive: true, force: true });
}

console.log(`Created ${dmgPath}`);
