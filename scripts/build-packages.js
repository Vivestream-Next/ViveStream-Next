import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const pkgDir = path.join(rootDir, "pkg");
const versionFile = path.join(rootDir, "VERSION");

if (!fs.existsSync(versionFile)) {
  console.error("❌ VERSION file not found!");
  process.exit(1);
}

const version = fs.readFileSync(versionFile, "utf-8").trim();
console.log(
  `\n🚀 Starting ViveStream Next v${version} Local Build Manager...\n`,
);

const args = process.argv.slice(2);
const flags = new Set(args.map((a) => a.toLowerCase()));

let buildDeb = flags.has("--deb") || flags.has("--linux") || flags.has("--all");
let buildAppImage =
  flags.has("--appimage") || flags.has("--linux") || flags.has("--all");
let buildArch =
  flags.has("--arch") ||
  flags.has("--pkg") ||
  flags.has("--linux") ||
  flags.has("--all");
let buildRpm = flags.has("--rpm") || flags.has("--linux") || flags.has("--all");
let buildExe =
  flags.has("--exe") ||
  flags.has("--nsis") ||
  flags.has("--win") ||
  flags.has("--windows") ||
  flags.has("--all");
let buildMsi =
  flags.has("--msi") ||
  flags.has("--win") ||
  flags.has("--windows") ||
  flags.has("--all");

// Default to platform-appropriate build if no specific flag passed
if (args.length === 0) {
  if (process.platform === "linux") {
    buildDeb = true;
    buildAppImage = true;
    buildArch = true;
  } else if (process.platform === "win32") {
    buildExe = true;
  } else {
    buildAppImage = true;
  }
}

// Ensure pkg output directory exists
if (!fs.existsSync(pkgDir)) {
  fs.mkdirSync(pkgDir, { recursive: true });
}

function runCmd(command, cwd = rootDir) {
  console.log(`⚡ Running: ${command}`);
  execSync(command, { stdio: "inherit", cwd });
}

function copyArtifact(srcPath, destName) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️ Warning: Source artifact not found at ${srcPath}`);
    return null;
  }
  const destPath = path.join(pkgDir, destName);
  fs.copyFileSync(srcPath, destPath);
  const stats = fs.statSync(destPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Artifact ready: pkg/${destName} (${sizeMb} MB)`);
  return { name: destName, path: destPath, sizeMb };
}

const results = [];

// 1. Build Debian Package (.deb)
if (buildDeb || buildArch) {
  console.log("\n📦 Building Debian (.deb) package...");
  try {
    runCmd("bun tauri build --bundles deb");
    const debBundleDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "deb",
    );
    const debFiles = fs
      .readdirSync(debBundleDir)
      .filter((f) => f.endsWith(".deb"));
    if (debFiles.length > 0) {
      const debName = `vivestream-next_${version}_amd64.deb`;
      const res = copyArtifact(path.join(debBundleDir, debFiles[0]), debName);
      if (res) results.push(res);
    }
  } catch (e) {
    console.error("❌ Error building .deb package:", e.message);
  }
}

// 2. Build Arch Linux Package (.pkg.tar.zst) from .deb payload
if (buildArch) {
  console.log("\n📦 Generating Arch Linux (.pkg.tar.zst) package...");
  try {
    const debBundleDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "deb",
    );
    const debFiles = fs
      .readdirSync(debBundleDir)
      .filter((f) => f.endsWith(".deb"));
    if (debFiles.length === 0) {
      throw new Error(".deb package missing for Arch generation.");
    }
    const debPath = path.join(debBundleDir, debFiles[0]);
    const archBuildDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "arch_build",
    );

    if (fs.existsSync(archBuildDir)) {
      fs.rmSync(archBuildDir, { recursive: true, force: true });
    }
    fs.mkdirSync(archBuildDir, { recursive: true });

    runCmd(`ar x "${debPath}"`, archBuildDir);
    runCmd(`tar -xf data.tar.*`, archBuildDir);

    const sizeOutput = execSync(`du -sb . | awk '{print $1}'`, {
      cwd: archBuildDir,
    })
      .toString()
      .trim();
    const pkgInfoContent = `pkgname = vivestream-next-bin
pkgbase = vivestream-next-bin
pkgver = ${version}-1
pkgdesc = A lightning-fast, natively integrated YouTube downloader and local media library.
url = https://github.com/rootlocalghost/ViveStream-Next
builddate = ${Math.floor(Date.now() / 1000)}
packager = ViveStream Local Build <noreply@github.com>
size = ${sizeOutput}
arch = x86_64
license = custom:Proprietary
depend = webkit2gtk-4.1
depend = gst-plugins-good
depend = gst-plugins-base
depend = gst-plugins-bad
depend = gst-plugins-ugly
depend = gst-libav
depend = yt-dlp
depend = ffmpeg
depend = intel-media-driver
depend = libva-utils
provides = vivestream-next
conflict = vivestream-next
`;
    fs.writeFileSync(path.join(archBuildDir, ".PKGINFO"), pkgInfoContent);

    const archPkgName = `vivestream-next_${version}_x86_64.pkg.tar.zst`;
    const archPkgPath = path.join(pkgDir, archPkgName);
    runCmd(
      `tar --owner=0 --group=0 --numeric-owner -c --zstd -f "${archPkgPath}" .PKGINFO usr`,
      archBuildDir,
    );

    const stats = fs.statSync(archPkgPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Artifact ready: pkg/${archPkgName} (${sizeMb} MB)`);
    results.push({ name: archPkgName, path: archPkgPath, sizeMb });

    fs.rmSync(archBuildDir, { recursive: true, force: true });
  } catch (e) {
    console.error("❌ Error generating Arch package:", e.message);
  }
}

// 3. Build AppImage
if (buildAppImage) {
  console.log("\n📦 Building AppImage...");
  try {
    runCmd("bun tauri build --bundles appimage");
    const appImageDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "appimage",
    );
    const appFiles = fs
      .readdirSync(appImageDir)
      .filter((f) => f.endsWith(".AppImage"));
    if (appFiles.length > 0) {
      const appName = `ViveStream-Next_${version}_amd64.AppImage`;
      const res = copyArtifact(path.join(appImageDir, appFiles[0]), appName);
      if (res) results.push(res);
    }
  } catch (e) {
    console.error("❌ Error building AppImage:", e.message);
  }
}

// 4. Build RPM (.rpm)
if (buildRpm) {
  console.log("\n📦 Building RPM (.rpm) package...");
  try {
    runCmd("bun tauri build --bundles rpm");
    const rpmDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "rpm",
    );
    const rpmFiles = fs.readdirSync(rpmDir).filter((f) => f.endsWith(".rpm"));
    if (rpmFiles.length > 0) {
      const rpmName = `vivestream-next_${version}_x86_64.rpm`;
      const res = copyArtifact(path.join(rpmDir, rpmFiles[0]), rpmName);
      if (res) results.push(res);
    }
  } catch (e) {
    console.error("❌ Error building RPM package:", e.message);
  }
}

// 5. Build Windows NSIS Setup (.exe)
if (buildExe) {
  console.log("\n📦 Building Windows NSIS Setup (.exe)...");
  try {
    runCmd("bun tauri build --bundles nsis");
    const nsisDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "nsis",
    );
    const exeFiles = fs.readdirSync(nsisDir).filter((f) => f.endsWith(".exe"));
    if (exeFiles.length > 0) {
      const exeName = `vivestream-next_${version}_x64-setup.exe`;
      const res = copyArtifact(path.join(nsisDir, exeFiles[0]), exeName);
      if (res) results.push(res);
    }
  } catch (e) {
    console.error("❌ Error building Windows NSIS installer:", e.message);
  }
}

// 6. Build Windows MSI Installer (.msi)
if (buildMsi) {
  console.log("\n📦 Building Windows MSI (.msi)...");
  try {
    runCmd("bun tauri build --bundles msi");
    const msiDir = path.join(
      rootDir,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "msi",
    );
    const msiFiles = fs.readdirSync(msiDir).filter((f) => f.endsWith(".msi"));
    if (msiFiles.length > 0) {
      const msiName = `vivestream-next_${version}_x64.msi`;
      const res = copyArtifact(path.join(msiDir, msiFiles[0]), msiName);
      if (res) results.push(res);
    }
  } catch (e) {
    console.error("❌ Error building Windows MSI installer:", e.message);
  }
}

console.log("\n==================================================");
console.log("🎉 BUILD SUMMARY");
console.log("==================================================");
if (results.length === 0) {
  console.log("No artifacts were generated.");
} else {
  results.forEach((r) => {
    console.log(`- pkg/${r.name} (${r.sizeMb} MB)`);
  });
}
console.log("==================================================\n");
