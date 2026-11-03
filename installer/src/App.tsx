import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoSvg from "./assets/logo.svg";
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
  const [statusMessage, setStatusMessage] = createSignal<string>("Preparing...");
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
      {/* Ambient Backdrop Glow */}
      <div class="ambient-glow" style={appMode() === "uninstall" ? "background: radial-gradient(ellipse at center, rgba(225, 29, 72, 0.16) 0%, transparent 70%);" : ""}></div>

      {/* Titlebar */}
      <div class="titlebar">
        <div class="titlebar-drag" data-tauri-drag-region>
          <div class="titlebar-brand" data-tauri-drag-region>
            <img src={logoSvg} alt="Logo" class="titlebar-logo" data-tauri-drag-region />
            <span class="titlebar-title" data-tauri-drag-region>
              {appMode() === "uninstall" ? "ViveStream Next Uninstaller" : "ViveStream Setup"}
            </span>
          </div>
        </div>
        <div class="titlebar-controls">
          <button class="win-btn" onClick={handleMinimize} title="Minimize">
            <i class="ph ph-minus" style="font-size: 13px;"></i>
          </button>
          <button class="win-btn close" onClick={handleClose} title="Close">
            <i class="ph ph-x" style="font-size: 13px;"></i>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div class="installer-main">
        {/* ================================= UNINSTALLER FLOW ================================= */}
        <Show when={appMode() === "uninstall"}>
          {/* STEP 1: READY / CONFIRM */}
          <Show when={step() === "ready"}>
            <div class="hero-content">
              <div class="app-logo-wrap" style="box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4), 0 0 30px rgba(225, 29, 72, 0.25);">
                <img src={logoSvg} alt="ViveStream" class="app-logo-img" />
              </div>

              <div class="hero-header">
                <div class="hero-title-row">
                  <h1 class="hero-title">Uninstall ViveStream Next</h1>
                  <span class="version-badge" style="background: rgba(225, 29, 72, 0.15); border-color: rgba(225, 29, 72, 0.3); color: #fb7185;">
                    v{uninstallInfo()?.version || pkg.version}
                  </span>
                </div>
                <p class="hero-subtitle">
                  Choose whether to keep or remove your downloaded media and application library.
                </p>
              </div>

              <div class="input-card" style="text-align: left; padding: 14px 18px; width: 100%;">
                <div class="destination-row" style="margin-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 10px;">
                  <i class="ph ph-folder-open destination-icon"></i>
                  <div class="destination-path" title={installPath()}>
                    {installPath()}
                  </div>
                </div>

                <div class="uninstall-choice-box">
                  <label class="checkbox-label" style="align-items: flex-start; gap: 12px; cursor: pointer; user-select: none;">
                    <input
                      type="checkbox"
                      checked={deleteAppData()}
                      onChange={(e) => setDeleteAppData(e.currentTarget.checked)}
                      style="margin-top: 3px; accent-color: var(--accent-coral); width: 16px; height: 16px;"
                    />
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                      <span style="font-weight: 600; color: var(--text-white); font-size: 13.5px;">
                        Delete all application data & media library
                      </span>
                      <span style="font-size: 12px; color: var(--text-muted); line-height: 1.45;">
                        Permanently deletes all downloaded videos, audio, thumbnails, playlists, AI models, database, and settings
                        {uninstallInfo()?.data_size_formatted ? ` (${uninstallInfo()!.data_size_formatted})` : ""}.
                      </span>
                      <span style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
                        {deleteAppData()
                          ? `Location: ${uninstallInfo()?.data_path || "%USERPROFILE%\\ViveStream"}`
                          : "Your downloaded media files and database will be safely preserved on disk."}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="cta-button-wrap" style="display: flex; gap: 12px; justify-content: center; width: 100%; margin-top: 6px;">
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
            <div class="hero-content">
              <div class="app-logo-wrap" style="box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4), 0 0 36px rgba(225, 29, 72, 0.3);">
                <img src={logoSvg} alt="ViveStream" class="app-logo-img" />
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Uninstalling ViveStream Next</h1>
                <p class="hero-subtitle">
                  Removing files, shortcuts, and components from your system...
                </p>
              </div>

              <div class="install-card">
                <div class="progress-header">
                  <div class="progress-status">
                    <i class="ph-bold ph-circle-notch" style="animation: spin 1s linear infinite; color: var(--accent-coral);"></i>
                    <span>{statusMessage()}</span>
                  </div>
                  <span class="progress-number">{Math.round(progress())}%</span>
                </div>

                <div class="progress-track">
                  <div class="progress-fill" style={{ width: `${progress()}%` }}></div>
                </div>

                <div class="progress-detail">
                  {detailMessage()}
                </div>
              </div>

              <style>
                {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
              </style>
            </div>
          </Show>

          {/* STEP 3: UNINSTALL COMPLETED */}
          <Show when={step() === "completed"}>
            <div class="hero-content">
              <div class="completed-badge">
                <i class="ph-bold ph-check"></i>
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Uninstallation Complete</h1>
                <p class="hero-subtitle">
                  {deleteAppData()
                    ? "ViveStream Next and all application media data have been cleanly removed."
                    : "ViveStream Next has been removed. Your downloaded media library was kept intact."}
                </p>
              </div>

              <div class="cta-button-wrap" style="margin-top: 10px;">
                <button class="btn-primary" onClick={handleClose}>
                  <span>Finish</span>
                  <i class="ph-bold ph-check"></i>
                </button>
              </div>
            </div>
          </Show>

          {/* STEP 4: ERROR */}
          <Show when={step() === "error"}>
            <div class="hero-content">
              <div class="error-badge">
                <i class="ph-bold ph-warning"></i>
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Uninstallation Failed</h1>
              </div>

              <div class="error-text">
                {errorMessage()}
              </div>

              <div class="cta-button-wrap" style="display: flex; gap: 12px; justify-content: center;">
                <button class="btn-secondary" onClick={handleClose}>
                  Close
                </button>
                <button class="btn-primary" onClick={startUninstall}>
                  <span>Retry</span>
                  <i class="ph-bold ph-arrow-clockwise"></i>
                </button>
              </div>
            </div>
          </Show>
        </Show>

        {/* ================================= INSTALLER FLOW ================================= */}
        <Show when={appMode() === "install"}>
          {/* STEP 1: READY */}
          <Show when={step() === "ready"}>
            <div class="hero-content">
              <div class="app-logo-wrap">
                <img src={logoSvg} alt="ViveStream" class="app-logo-img" />
              </div>

              <div class="hero-header">
                <div class="hero-title-row">
                  <h1 class="hero-title">ViveStream Next</h1>
                  <span class="version-badge">v{pkg.version}</span>
                </div>
                <p class="hero-subtitle">
                  High-fidelity video streaming and local playback for Windows.
                </p>
              </div>

              <div class="input-card">
                <div class="destination-row">
                  <i class="ph ph-folder-open destination-icon"></i>
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
                    <span>Desktop shortcut</span>
                  </label>
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      checked={startMenuShortcut()}
                      onChange={(e) => setStartMenuShortcut(e.currentTarget.checked)}
                    />
                    <span>Start Menu shortcut</span>
                  </label>
                </div>
              </div>

              <div class="cta-button-wrap">
                <button class="btn-primary" onClick={startInstall}>
                  <span>Install ViveStream</span>
                  <i class="ph-bold ph-arrow-right"></i>
                </button>
              </div>
            </div>
          </Show>

          {/* STEP 2: INSTALLING */}
          <Show when={step() === "installing"}>
            <div class="hero-content">
              <div class="app-logo-wrap" style="box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4), 0 0 36px var(--accent-glow);">
                <img src={logoSvg} alt="ViveStream" class="app-logo-img" />
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Installing ViveStream Next</h1>
                <p class="hero-subtitle">
                  Setting up files and system components...
                </p>
              </div>

              <div class="install-card">
                <div class="progress-header">
                  <div class="progress-status">
                    <i class="ph-bold ph-circle-notch" style="animation: spin 1s linear infinite; color: var(--accent-coral);"></i>
                    <span>{statusMessage()}</span>
                  </div>
                  <span class="progress-number">{Math.round(progress())}%</span>
                </div>

                <div class="progress-track">
                  <div class="progress-fill" style={{ width: `${progress()}%` }}></div>
                </div>

                <div class="progress-detail">
                  {detailMessage()}
                </div>
              </div>

              <style>
                {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
              </style>
            </div>
          </Show>

          {/* STEP 3: COMPLETED */}
          <Show when={step() === "completed"}>
            <div class="hero-content">
              <div class="completed-badge">
                <i class="ph-bold ph-check"></i>
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Installation Complete</h1>
                <p class="hero-subtitle">
                  ViveStream Next is ready to use on your computer.
                </p>
              </div>

              <div style="margin-top: 4px;">
                <label class="checkbox-label" style="font-size: 13px; color: var(--text-body);">
                  <input
                    type="checkbox"
                    checked={launchOnFinish()}
                    onChange={(e) => setLaunchOnFinish(e.currentTarget.checked)}
                  />
                  <span>Launch ViveStream Next now</span>
                </label>
              </div>

              <div class="cta-button-wrap" style="margin-top: 8px;">
                <button class="btn-primary" onClick={finishAndLaunch}>
                  <span>{launchOnFinish() ? "Open ViveStream" : "Done"}</span>
                  <i class="ph-bold ph-rocket-launch"></i>
                </button>
              </div>
            </div>
          </Show>

          {/* STEP 4: ERROR */}
          <Show when={step() === "error"}>
            <div class="hero-content">
              <div class="error-badge">
                <i class="ph-bold ph-warning"></i>
              </div>

              <div class="hero-header">
                <h1 class="hero-title">Installation Interrupted</h1>
              </div>

              <div class="error-text">
                {errorMessage()}
              </div>

              <div class="cta-button-wrap">
                <button class="btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button class="btn-primary" onClick={startInstall}>
                  <span>Retry</span>
                  <i class="ph-bold ph-arrow-clockwise"></i>
                </button>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* Clean Footer */}
      <div class="installer-footer">
        ViveStream Next • Windows 64-bit Edition
      </div>
    </div>
  );
}
