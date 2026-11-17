import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoSvg from "./assets/logo.svg";
import bannerPng from "./assets/Banner.png";
import pkg from "../package.json";

interface ProgressPayload {
  percent: number;
  status: string;
}

interface UninstallInfo {
  app_name: string;
  version: string;
  install_path: string;
  data_path: string;
  data_size_formatted: string;
  data_exists: boolean;
}

export default function App() {
  const [appMode, setAppMode] = createSignal<"install" | "uninstall">("install");

  // Shared / Installer state
  const [step, setStep] = createSignal<"ready" | "installing" | "completed" | "error">("ready");
  const [installPath, setInstallPath] = createSignal<string>("C:\\Users\\AppData\\Local\\Programs\\ViveStream-Next");
  const [desktopShortcut, setDesktopShortcut] = createSignal<boolean>(true);
  const [startMenuShortcut, setStartMenuShortcut] = createSignal<boolean>(true);
  const [launchOnFinish, setLaunchOnFinish] = createSignal<boolean>(true);
  const [progress, setProgress] = createSignal<number>(0);
  const [statusMessage, setStatusMessage] = createSignal<string>("Preparing setup...");
  const [detailMessage, setDetailMessage] = createSignal<string>("");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  // Uninstaller specific state
  const [uninstallInfo, setUninstallInfo] = createSignal<UninstallInfo | null>(null);
  const [deleteAppData, setDeleteAppData] = createSignal<boolean>(true);

  let unlistenProgress: (() => void) | null = null;

  onMount(async () => {
    try {
      const mode = await invoke<string>("get_app_mode");
      if (mode === "uninstall") {
        setAppMode("uninstall");
        try {
          await getCurrentWindow().setTitle("ViveStream Next Uninstaller");
        } catch {}

        try {
          const info = await invoke<UninstallInfo>("get_uninstall_info");
          setUninstallInfo(info);
          if (info.install_path) {
            setInstallPath(info.install_path);
          }
        } catch (e) {
          console.error("Failed to fetch uninstall info:", e);
        }

        try {
          const unlisten = await listen<ProgressPayload>("uninstall-progress", (event) => {
            setProgress(Math.min(100, Math.max(0, event.payload.percent)));
            if (event.payload.status) {
              setStatusMessage(event.payload.status);
              setDetailMessage(event.payload.status);
            }
          });
          unlistenProgress = unlisten;
        } catch (e) {
          console.warn("Failed to attach uninstaller progress listener:", e);
        }
        return;
      }
    } catch {
      // Default to install mode
    }

    try {
      const defaultPath = await invoke<string>("get_default_install_path");
      if (defaultPath) {
        setInstallPath(defaultPath);
      }
    } catch {
      // Fallback
    }

    try {
      const unlisten = await listen<ProgressPayload>("install-progress", (event) => {
        setProgress(Math.min(100, Math.max(0, event.payload.percent)));
        if (event.payload.status) {
          setStatusMessage(event.payload.status);
          setDetailMessage(event.payload.status);
        }
      });
      unlistenProgress = unlisten;
    } catch (e) {
      console.warn("Failed to attach install progress listener:", e);
    }
  });

  onCleanup(() => {
    if (unlistenProgress) {
      unlistenProgress();
    }
  });

  const handleMinimize = async () => {
    try {
      await invoke("minimize_installer");
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClose = async () => {
    try {
      if (appMode() === "uninstall") {
        await invoke("close_uninstaller");
      } else {
        await invoke("close_installer");
      }
    } catch {
      try {
        await getCurrentWindow().close();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await invoke<string | null>("select_folder", { currentPath: installPath() });
      if (selected) {
        setInstallPath(selected);
      }
    } catch (e) {
      console.error("Browse dialog error:", e);
    }
  };

  const startInstall = async () => {
    setStep("installing");
    setProgress(8);
    setStatusMessage("Extracting application components...");

    try {
      await invoke("start_installation", {
        path: installPath(),
        desktopShortcut: desktopShortcut(),
        startMenuShortcut: startMenuShortcut(),
      });
      setProgress(100);
      setStatusMessage("Installation complete.");
      setStep("completed");
    } catch (err: any) {
      console.error("Installation failed:", err);
      setErrorMessage(typeof err === "string" ? err : err?.message || "An unexpected error occurred during installation.");
      setStep("error");
    }
  };

  const startUninstall = async () => {
    setStep("installing");
    setProgress(8);
    setStatusMessage("Closing active processes...");

    try {
      await invoke("start_uninstallation", {
        deleteAppData: deleteAppData(),
      });
      setProgress(100);
      setStatusMessage("Uninstallation complete.");
      setStep("completed");
    } catch (err: any) {
      console.error("Uninstallation failed:", err);
      setErrorMessage(typeof err === "string" ? err : err?.message || "An unexpected error occurred during uninstallation.");
      setStep("error");
    }
  };

  const finishAndLaunch = async () => {
    if (launchOnFinish()) {
      try {
        await invoke("launch_installed_app", { installPath: installPath() });
      } catch (e) {
        console.error("Failed to launch application:", e);
      }
    }
    await handleClose();
  };

  return (
    <div class="installer-window">
      {/* 4 Sharp Corner Brackets for authentic technical aesthetic */}
      <div class="corner-bracket corner-tl"></div>
      <div class="corner-bracket corner-tr"></div>
      <div class="corner-bracket corner-bl"></div>
      <div class="corner-bracket corner-br"></div>

      {/* Subtle Ambient Glow */}
      <div class="ambient-glow"></div>

      {/* Titlebar */}
      <div class="titlebar">
        <div class="titlebar-drag" data-tauri-drag-region>
          <div class="titlebar-brand" data-tauri-drag-region>
            <img src={logoSvg} alt="Logo" class="titlebar-logo" data-tauri-drag-region />
            <span class="titlebar-title" data-tauri-drag-region>
              ViveStream Next
              <span class="titlebar-tag">
                {appMode() === "uninstall" ? "UNINSTALLER" : `SETUP // v${pkg.version}`}
              </span>
            </span>
          </div>
        </div>
        <div class="titlebar-controls">
          <button class="win-btn" onClick={handleMinimize} title="Minimize">
            <i class="ph ph-minus" style="font-size: 14px;"></i>
          </button>
          <button class="win-btn close" onClick={handleClose} title="Close">
            <i class="ph ph-x" style="font-size: 14px;"></i>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div class="installer-main">
        {/* Sharp High-Resolution Banner Showcase */}
        <div class="banner-hero-container">
          <img src={bannerPng} alt="ViveStream Next" class="banner-hero-img" />
          <div class="banner-accent-line"></div>
          <div class="banner-badge-strip">
            <span class="banner-spec-pill highlight">v{pkg.version}</span>
            <span class="banner-spec-pill">WIN64</span>
            <span class="banner-spec-pill">OFFLINE MEDIA SUITE</span>
          </div>
        </div>

        {/* ================================= UNINSTALLER FLOW ================================= */}
        <Show when={appMode() === "uninstall"}>
          <div class="sharp-deck">
            {/* STEP 1: READY / CONFIRM */}
            <Show when={step() === "ready"}>
              <div class="sharp-card">
                <div class="card-title-row">
                  <span class="card-label">
                    <i class="ph-bold ph-warning"></i> Confirm Removal
                  </span>
                  <span class="card-meta-text">TARGET: {installPath()}</span>
                </div>

                <div class="destination-row">
                  <i class="ph-bold ph-folder-open destination-icon"></i>
                  <div class="destination-path" title={installPath()}>
                    {installPath()}
                  </div>
                </div>

                <div class="options-row" style="margin-top: 2px;">
                  <label class="checkbox-label" style="align-items: flex-start; gap: 10px;">
                    <input
                      type="checkbox"
                      checked={deleteAppData()}
                      onChange={(e) => setDeleteAppData(e.currentTarget.checked)}
                      style="margin-top: 2px;"
                    />
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <span style="color: var(--text-white); font-weight: 700;">
                        Delete all application media, database & cached models
                        {uninstallInfo()?.data_size_formatted ? ` (${uninstallInfo()!.data_size_formatted})` : ""}
                      </span>
                      <span style="font-size: 11px; color: var(--text-muted); font-weight: 400;">
                        {deleteAppData()
                          ? `Location: ${uninstallInfo()?.data_path || "%USERPROFILE%\\ViveStream"}`
                          : "Your downloaded videos, audio, and databases will remain safely stored on disk."}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="cta-button-wrap">
                <div class="cta-meta-info">
                  <span>UNINSTALL TARGET: <strong>ViveStream Next v{uninstallInfo()?.version || pkg.version}</strong></span>
                  <span>ACTION CANNOT BE UNDONE</span>
                </div>
                <div class="cta-actions-group">
                  <button class="btn-secondary" onClick={handleClose}>
                    Cancel
                  </button>
                  <button class="btn-primary danger-btn" onClick={startUninstall}>
                    <span>Uninstall ViveStream</span>
                    <i class="ph-bold ph-trash"></i>
                  </button>
                </div>
              </div>
            </Show>

            {/* STEP 2: UNINSTALLING */}
            <Show when={step() === "installing"}>
              <div class="install-card">
                <div class="progress-header">
                  <div class="progress-status">
                    <i class="ph-bold ph-circle-notch animate-spin" style="color: var(--accent-coral);"></i>
                    <span>{statusMessage()}</span>
                  </div>
                  <span class="progress-number">{Math.round(progress())}%</span>
                </div>

                <div class="progress-track">
                  <div class="progress-fill" style={{ width: `${progress()}%` }}></div>
                </div>

                <div class="progress-detail">
                  {detailMessage() || "Cleaning registry entries and removing files..."}
                </div>
              </div>
            </Show>

            {/* STEP 3: UNINSTALL COMPLETED */}
            <Show when={step() === "completed"}>
              <div class="completed-hero">
                <div class="completed-badge-sharp">
                  <i class="ph-bold ph-check"></i>
                </div>
                <div class="completed-text">
                  <h2>Uninstallation Complete</h2>
                  <p>
                    {deleteAppData()
                      ? "ViveStream Next and all media library data have been completely removed from your system."
                      : "ViveStream Next has been removed. Your media files and database were safely preserved."}
                  </p>
                </div>
              </div>

              <div class="cta-button-wrap" style="justify-content: flex-end;">
                <button class="btn-primary" onClick={handleClose}>
                  <span>Finish & Close</span>
                  <i class="ph-bold ph-check"></i>
                </button>
              </div>
            </Show>

            {/* STEP 4: ERROR */}
            <Show when={step() === "error"}>
              <div class="error-hero">
                <div class="error-badge-sharp">
                  <i class="ph-bold ph-warning"></i>
                </div>
                <div class="completed-text">
                  <h2 style="color: #ef4444;">Uninstallation Failed</h2>
                  <p>An unexpected error occurred during uninstallation.</p>
                </div>
              </div>

              <div class="error-text">
                {errorMessage()}
              </div>

              <div class="cta-button-wrap" style="justify-content: flex-end;">
                <button class="btn-secondary" onClick={handleClose}>
                  Close
                </button>
                <button class="btn-primary" onClick={startUninstall}>
                  <span>Retry Removal</span>
                  <i class="ph-bold ph-arrow-clockwise"></i>
                </button>
              </div>
            </Show>
          </div>
        </Show>

        {/* ================================= INSTALLER FLOW ================================= */}
        <Show when={appMode() === "install"}>
          <div class="sharp-deck">
            {/* STEP 1: READY */}
            <Show when={step() === "ready"}>
              <div class="sharp-card">
                <div class="card-title-row">
                  <span class="card-label">
                    <i class="ph-bold ph-folder"></i> Installation Directory
                  </span>
                  <span class="card-meta-text">64-BIT BINARIES // LOCAL DEPLOYMENT</span>
                </div>

                <div class="destination-row">
                  <i class="ph-bold ph-folder-open destination-icon"></i>
                  <div class="destination-path" title={installPath()}>
                    {installPath()}
                  </div>
                  <button class="btn-browse" onClick={handleBrowse}>
                    Change...
                  </button>
                </div>

                <div class="options-row">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      checked={desktopShortcut()}
                      onChange={(e) => setDesktopShortcut(e.currentTarget.checked)}
                    />
                    <span>Create Desktop Shortcut</span>
                  </label>
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      checked={startMenuShortcut()}
                      onChange={(e) => setStartMenuShortcut(e.currentTarget.checked)}
                    />
                    <span>Create Start Menu Shortcut</span>
                  </label>
                </div>
              </div>

              <div class="cta-button-wrap">
                <div class="cta-meta-info">
                  <span>DEPLOYMENT: <strong>Windows 10/11 x64</strong></span>
                  <span>FOOTPRINT: <strong>~280 MB DISK ALLOCATION</strong></span>
                </div>
                <div class="cta-actions-group">
                  <button class="btn-primary" onClick={startInstall}>
                    <span>Install ViveStream Next</span>
                    <i class="ph-bold ph-arrow-right"></i>
                  </button>
                </div>
              </div>
            </Show>

            {/* STEP 2: INSTALLING */}
            <Show when={step() === "installing"}>
              <div class="install-card">
                <div class="progress-header">
                  <div class="progress-status">
                    <i class="ph-bold ph-circle-notch animate-spin" style="color: var(--accent-coral);"></i>
                    <span>{statusMessage()}</span>
                  </div>
                  <span class="progress-number">{Math.round(progress())}%</span>
                </div>

                <div class="progress-track">
                  <div class="progress-fill" style={{ width: `${progress()}%` }}></div>
                </div>

                <div class="progress-detail">
                  {detailMessage() || "Deploying SQLite engines, FFmpeg binaries, and UI packages..."}
                </div>
              </div>

              <div class="cta-meta-info" style="align-items: center; text-align: center;">
                <span>STATUS: <strong>INSTALLING SYSTEM ASSETS</strong> • DO NOT DISCONNECT OR CLOSE</span>
              </div>
            </Show>

            {/* STEP 3: COMPLETED */}
            <Show when={step() === "completed"}>
              <div class="completed-hero">
                <div class="completed-badge-sharp">
                  <i class="ph-bold ph-check"></i>
                </div>
                <div class="completed-text">
                  <h2>Installation Complete</h2>
                  <p>ViveStream Next v{pkg.version} is installed and ready for high-fidelity playback.</p>
                </div>
              </div>

              <div class="sharp-card" style="padding: 10px 14px;">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={launchOnFinish()}
                    onChange={(e) => setLaunchOnFinish(e.currentTarget.checked)}
                  />
                  <span>Launch ViveStream Next now</span>
                </label>
              </div>

              <div class="cta-button-wrap" style="justify-content: flex-end;">
                <button class="btn-primary" onClick={finishAndLaunch}>
                  <span>{launchOnFinish() ? "Launch Application" : "Done"}</span>
                  <i class="ph-bold ph-rocket-launch"></i>
                </button>
              </div>
            </Show>

            {/* STEP 4: ERROR */}
            <Show when={step() === "error"}>
              <div class="error-hero">
                <div class="error-badge-sharp">
                  <i class="ph-bold ph-warning"></i>
                </div>
                <div class="completed-text">
                  <h2 style="color: #ef4444;">Installation Interrupted</h2>
                  <p>Setup could not complete successfully.</p>
                </div>
              </div>

              <div class="error-text">
                {errorMessage()}
              </div>

              <div class="cta-button-wrap" style="justify-content: flex-end;">
                <button class="btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button class="btn-primary" onClick={startInstall}>
                  <span>Retry Setup</span>
                  <i class="ph-bold ph-arrow-clockwise"></i>
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Clean Technical Sharp Footer */}
      <div class="installer-footer">
        <div class="footer-left">
          <span class="footer-status-dot"></span>
          <span>INITIALIZER READY // LOCAL HARDWARE ACCELERATED</span>
        </div>
        <div class="footer-right">
          <span>VIVESTREAM NEXT</span>
          <span>•</span>
          <span>WINDOWS 64-BIT</span>
        </div>
      </div>

      <style>
        {`
          .animate-spin {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
