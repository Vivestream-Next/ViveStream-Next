#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
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

function readVersion() {
  if (!fs.existsSync(files.versionFile)) {
    throw new Error(`VERSION file missing at: ${files.versionFile}`);
  }
  return fs.readFileSync(files.versionFile, "utf-8").trim();
}

function readPackageJsonVersion(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return data.version;
}

function readCargoTomlVersion(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not find version in ${filePath}`);
  }
  return match[1];
}

function readTauriConfVersion(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return data.version;
}

function verifyVersions() {
  const v_version = readVersion();
  const v_pkg = readPackageJsonVersion(files.packageJson);
  const v_cargo = readCargoTomlVersion(files.cargoToml);
  const v_tauri = readTauriConfVersion(files.tauriConf);
  const v_inst_pkg = readPackageJsonVersion(files.installerPackageJson);
  const v_inst_cargo = readCargoTomlVersion(files.installerCargoToml);
  const v_inst_tauri = readTauriConfVersion(files.installerTauriConf);

  console.log("🔍 Checking ViveStream project version synchronization...");
  console.log(`  - VERSION:                      ${v_version}`);
  console.log(`  - package.json:                 ${v_pkg}`);
  console.log(`  - src-tauri/Cargo.toml:         ${v_cargo}`);
  console.log(`  - src-tauri/tauri.conf:         ${v_tauri}`);
  console.log(`  - installer/package.json:        ${v_inst_pkg}`);
  console.log(`  - installer/src-tauri/Cargo:    ${v_inst_cargo}`);
  console.log(`  - installer/src-tauri/tauri:    ${v_inst_tauri}`);

  const versions = [
    { name: "VERSION", ver: v_version },
    { name: "package.json", ver: v_pkg },
    { name: "src-tauri/Cargo.toml", ver: v_cargo },
    { name: "src-tauri/tauri.conf.json", ver: v_tauri },
    { name: "installer/package.json", ver: v_inst_pkg },
    { name: "installer/src-tauri/Cargo.toml", ver: v_inst_cargo },
    { name: "installer/src-tauri/tauri.conf.json", ver: v_inst_tauri },
  ];

  const mismatches = versions.filter((f) => f.ver !== v_version);

  if (mismatches.length > 0) {
    console.error("\n❌ Version mismatch detected!");
    mismatches.forEach((m) => {
      console.error(
        `   ${m.name} has version "${m.ver}", expected "${v_version}"`,
      );
    });
    console.error(
      "\n💡 Run 'bun run bump' to synchronize all files to a new version.",
    );
    process.exit(1);
  }

  console.log(`\n✅ All versions synchronized: v${v_version}`);
}

try {
  verifyVersions();
} catch (err) {
  console.error("❌ Failed to verify versions:", err.message);
  process.exit(1);
}
