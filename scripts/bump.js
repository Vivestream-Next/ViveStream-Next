#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const files = {
  versionFile: path.join(rootDir, "VERSION"),
  packageJson: path.join(rootDir, "package.json"),
  cargoToml: path.join(rootDir, "src-tauri", "Cargo.toml"),
  tauriConf: path.join(rootDir, "src-tauri", "tauri.conf.json"),
  installerPackageJson: path.join(rootDir, "installer", "package.json"),
  installerCargoToml: path.join(rootDir, "installer", "src-tauri", "Cargo.toml"),
  installerTauriConf: path.join(rootDir, "installer", "src-tauri", "tauri.conf.json"),
};

function getCurrentVersion() {
  if (fs.existsSync(files.versionFile)) {
    return fs.readFileSync(files.versionFile, "utf-8").trim();
  }
  const pkg = JSON.parse(fs.readFileSync(files.packageJson, "utf-8"));
  return pkg.version;
}

function parseSemver(ver) {
  const clean = ver.replace(/^v/, "").trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Invalid semver format: "${ver}"`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function computeNextVersion(currentVersion, bumpType) {
  const parsed = parseSemver(currentVersion);

  switch (bumpType.toLowerCase()) {
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "major":
      return `${parsed.major + 1}.0.0`;
    default:
      // If user passed a literal version string
      parseSemver(bumpType); // validate
      return bumpType.replace(/^v/, "").trim();
  }
}

function updateFiles(newVersion) {
  // 1. VERSION
  fs.writeFileSync(files.versionFile, `${newVersion}\n`, "utf-8");

  // 2. Main package.json
  const pkg = JSON.parse(fs.readFileSync(files.packageJson, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(
    files.packageJson,
    JSON.stringify(pkg, null, 2) + "\n",
    "utf-8",
  );

  // 3. Main Cargo.toml
  let cargo = fs.readFileSync(files.cargoToml, "utf-8");
  cargo = cargo.replace(
    /(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/,
    `$1"${newVersion}"`,
  );
  fs.writeFileSync(files.cargoToml, cargo, "utf-8");

  // 4. Main tauri.conf.json
  const tauri = JSON.parse(fs.readFileSync(files.tauriConf, "utf-8"));
  tauri.version = newVersion;
  fs.writeFileSync(
    files.tauriConf,
    JSON.stringify(tauri, null, 2) + "\n",
    "utf-8",
  );

  // 5. Installer package.json
  if (fs.existsSync(files.installerPackageJson)) {
    const instPkg = JSON.parse(fs.readFileSync(files.installerPackageJson, "utf-8"));
    instPkg.version = newVersion;
    fs.writeFileSync(
      files.installerPackageJson,
      JSON.stringify(instPkg, null, 2) + "\n",
      "utf-8",
    );
  }

  // 6. Installer Cargo.toml
  if (fs.existsSync(files.installerCargoToml)) {
    let instCargo = fs.readFileSync(files.installerCargoToml, "utf-8");
    instCargo = instCargo.replace(
      /(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/,
      `$1"${newVersion}"`,
    );
    fs.writeFileSync(files.installerCargoToml, instCargo, "utf-8");
  }

  // 7. Installer tauri.conf.json
  if (fs.existsSync(files.installerTauriConf)) {
    const instTauri = JSON.parse(fs.readFileSync(files.installerTauriConf, "utf-8"));
    instTauri.version = newVersion;
    fs.writeFileSync(
      files.installerTauriConf,
      JSON.stringify(instTauri, null, 2) + "\n",
      "utf-8",
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("-"));
  const nonFlags = args.filter((a) => !a.startsWith("-"));

  const shouldGitTag = flags.includes("--tag") || flags.includes("-t");
  const shouldGitCommit =
    shouldGitTag || flags.includes("--commit") || flags.includes("-c");

  const currentVersion = getCurrentVersion();
  const bumpType = nonFlags[0] || "patch";

  console.log(`Current version: v${currentVersion}`);
  const nextVersion = computeNextVersion(currentVersion, bumpType);

  console.log(`Bumping version: v${currentVersion} ➔ v${nextVersion}...`);
  updateFiles(nextVersion);
  console.log("✔ Updated VERSION");
  console.log("✔ Updated package.json");
  console.log("✔ Updated src-tauri/Cargo.toml");
  console.log("✔ Updated src-tauri/tauri.conf.json");
  console.log("✔ Updated installer/package.json");
  console.log("✔ Updated installer/src-tauri/Cargo.toml");
  console.log("✔ Updated installer/src-tauri/tauri.conf.json");

  // Synchronize Cargo.locks
  try {
    execSync("cargo check", {
      cwd: path.join(rootDir, "src-tauri"),
      stdio: "ignore",
    });
    console.log("✔ Updated src-tauri/Cargo.lock");
  } catch {
    // If cargo is unavailable, continue
  }

  try {
    execSync("cargo check", {
      cwd: path.join(rootDir, "installer", "src-tauri"),
      stdio: "ignore",
    });
    console.log("✔ Updated installer/src-tauri/Cargo.lock");
  } catch {
    // If cargo is unavailable, continue
  }

  if (shouldGitCommit) {
    try {
      console.log("\n📦 Creating Git commit...");
      execSync(
        `git add VERSION package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json installer/package.json installer/src-tauri/Cargo.toml installer/src-tauri/Cargo.lock installer/src-tauri/tauri.conf.json`,
        {
          cwd: rootDir,
          stdio: "inherit",
        },
      );
      execSync(`git commit -m "chore(release): v${nextVersion}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });

      if (shouldGitTag) {
        console.log(`🏷️ Creating Git tag v${nextVersion}...`);
        execSync(`git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`, {
          cwd: rootDir,
          stdio: "inherit",
        });
        console.log(`\n🎉 Tag created: v${nextVersion}`);
        console.log(
          `👉 Run 'git push origin main --tags' to push and trigger the release pipeline!`,
        );
      }
    } catch (err) {
      console.error("Failed to commit or tag:", err.message);
    }
  } else {
    console.log(`\n🎉 Version bumped to v${nextVersion}`);
    console.log(
      `👉 Tip: You can run 'bun run bump --tag' to automatically commit and tag.`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error("❌ Error bumping version:", err.message);
  process.exit(1);
}
