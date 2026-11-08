#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const isInstallerOnly = process.argv.includes("--installer-only");
const isRootOnly = process.argv.includes("--root-only");
const skipCargo = process.argv.includes("--skip-cargo");
const skipModules = process.argv.includes("--skip-modules");

function removePath(targetPath, label) {
  if (fs.existsSync(targetPath)) {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        console.log(`  🗑️  Removed directory: ${label}`);
      } else {
        fs.unlinkSync(targetPath);
        console.log(`  🗑️  Removed file:      ${label}`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Failed to remove ${label}: ${err.message}`);
    }
  }
}

function runCargoClean(cwd, label) {
  if (skipCargo) return;
  const cargoToml = path.join(cwd, "Cargo.toml");
  if (fs.existsSync(cargoToml)) {
    try {
      console.log(`  ⚙️  Running cargo clean in ${label}...`);
      execSync("cargo clean", { cwd, stdio: "inherit" });
    } catch (err) {
      console.warn(`  ⚠️  Cargo clean error in ${label}: ${err.message}`);
    }
  }
}

console.log("🧹 Starting ViveStream workspace cleanup...\n");

// 1. Clean /installer workspace
if (!isRootOnly) {
  console.log("📦 Cleaning /installer workspace...");
  const installerDir = path.join(rootDir, "installer");
  const installerTauriDir = path.join(installerDir, "src-tauri");

  runCargoClean(installerTauriDir, "installer/src-tauri");
  removePath(path.join(installerTauriDir, "target"), "installer/src-tauri/target");
  removePath(path.join(installerTauriDir, "gen"), "installer/src-tauri/gen");
  removePath(path.join(installerTauriDir, "app_payload.zip"), "installer/src-tauri/app_payload.zip");

  if (!skipModules) {
    removePath(path.join(installerDir, "node_modules"), "installer/node_modules");
  }
  removePath(path.join(installerDir, "dist"), "installer/dist");
  console.log("  ✅ /installer workspace cleaned.\n");
}

// 2. Clean main app & src-tauri workspace
if (!isInstallerOnly) {
  console.log("🚀 Cleaning root & main application workspace...");
  const mainTauriDir = path.join(rootDir, "src-tauri");

  runCargoClean(mainTauriDir, "src-tauri");
  removePath(path.join(mainTauriDir, "target"), "src-tauri/target");
  removePath(path.join(mainTauriDir, "gen"), "src-tauri/gen");

  if (!skipModules) {
    removePath(path.join(rootDir, "node_modules"), "node_modules");
  }
  removePath(path.join(rootDir, "dist"), "dist");
  removePath(path.join(rootDir, "pkg"), "pkg");
  removePath(path.join(rootDir, "PKGBUILD.1"), "PKGBUILD.1");
  console.log("  ✅ Root workspace cleaned.\n");
}

console.log("✨ Cleanup complete!");

