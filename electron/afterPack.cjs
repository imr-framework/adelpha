/**
 * Cross-pack from macOS: node-pty's build/Release is Darwin. Copy the
 * matching prebuild into Release so Windows loads the right native addon.
 * Linux builds on Linux (Docker) already compile Release, so this is a no-op.
 */
const fs = require("fs");
const path = require("path");

function archName(arch) {
  const map = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };
  if (typeof arch === "string") return arch;
  return map[arch] || "x64";
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  if (platform === "darwin") return;

  const arch = archName(context.arch);
  const ptyRoot = path.join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
  );
  const prebuild = path.join(ptyRoot, "prebuilds", `${platform}-${arch}`);
  const releaseDir = path.join(ptyRoot, "build", "Release");
  if (!fs.existsSync(prebuild)) return;
  copyDir(prebuild, releaseDir);
  console.log(`[adelpha] installed node-pty ${platform}-${arch} prebuild into build/Release`);
};
