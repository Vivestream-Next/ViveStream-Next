import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoSvg from "./assets/logo.svg";

interface ProgressPayload {
  percent: number;
  status: string;
}

export default function App() {
  const [step, setStep] = createSignal<"ready" | "installing" | "completed" | "error">("ready");
  const [installPath, setInstallPath] = createSignal<string>("Loading path...");
  const [desktopShortcut, setDesktopShortcut] = createSignal<boolean>(true);
  const [startMenuShortcut, setStartMenuShortcut] = createSignal<boolean>(true);
  const [launchOnFinish, setLaunchOnFinish] = createSignal<boolean>(true);
  const [showAdvanced, setShowAdvanced] = createSignal<boolean>(false);
  const [progress, setProgress] = createSignal<number>(0);
  const [statusMessage, setStatusMessage] = createSignal<string>("Preparing installation...");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  let unlistenProgress: (() => void) | null = null;

  onMount(async () => {
    try {
      const defaultPath = await invoke<string>("get_default_install_path");
      setInstallPath(defaultPath);
    } catch (e) {
      setInstallPath("C:\\Users\\AppData\\Local\\Programs\\ViveStream-Next");
    }

    try {
      const unlisten = await listen<ProgressPayload>("install-progress", (event) => {
        setProgress(Math.min(100, Math.max(0, event.payload.percent)));
        if (event.payload.status) {
          setStatusMessage(event.payload.status);
        }
      });
      unlistenProgress = unlisten;
    } catch (e) {
      console.warn("Failed to attach progress listener:", e);
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
      await invoke("close_installer");
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
      console.error("Browse failed:", e);
    }
  };

  const startInstall = async () => {
    setStep("installing");
    setProgress(5);
    setStatusMessage("Extracting application package...");

    try {
      await invoke("start_installation", {
        path: installPath(),
        desktopShortcut: desktopShortcut(),
        startMenuShortcut: startMenuShortcut(),
      });
      setProgress(100);
      setStatusMessage("Installation complete!");
      setStep("completed");
    } catch (err: any) {
      console.error("Installation error:", err);
      setErrorMessage(typeof err === "string" ? err : err?.message || "An unexpected error occurred.");
      setStep("error");
    }
  };

  const finishAndLaunch = async () => {
    if (launchOnFinish()) {
      try {
        await invoke("launch_installed_app", { installPath: installPath() });
      } catch (e) {
        console.error("Failed to launch app:", e);
      }
    }
    await handleClose();
  };

  return (
    <div class="installer-window">
      {/* Ambient background glows */}
      <div class="ambient-glow-1"></div>
      <div class="ambient-glow-2"></div>

      {/* Frameless Titlebar */}
      <div class="titlebar">
        <div class="titlebar-drag" data-tauri-drag-region>
          <div class="titlebar-brand" data-tauri-drag-region>
            <img src={logoSvg} alt="Logo" class="titlebar-logo" data-tauri-drag-region />
            <span class="titlebar-title" data-tauri-drag-region>ViveStream Next Setup</span>
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

      {/* Main Content Area */}
      <div class="installer-body">
        {/* Left Showcase Side */}
        <div class="showcase-panel">
          <div class="showcase-header">
            <div class="big-logo-wrap">
              <img src={logoSvg} alt="ViveStream" class="big-logo" />
            </div>
            <div>
              <div class="app-name">ViveStream Next</div>
              <div style="margin-top: 4px;">
                <span class="version-tag">v3.7.0</span>
              </div>
            </div>
          </div>

          <div class="features-ticker">
            <div class="feature-pill">
              <i class="ph-fill ph-lightning"></i>
              <span>Ultra-fast video & audio</span>
            </div>
            <div class="feature-pill">
              <i class="ph-fill ph-shield-check"></i>
              <span>Zero terminal popups</span>
            </div>
            <div class="feature-pill">
              <i class="ph-fill ph-download-simple"></i>
              <span>Built-in local media vault</span>
            </div>
          </div>

          <div class="showcase-footer">
            LocalGhost • Proprietary Build
          </div>
        </div>

        {/* Right Action Side */}
        <div class="action-panel">
          {/* STEP 1: READY */}
          <Show when={step() === "ready"}>
            <div class="action-content">
              <div>
                <h2 class="section-title">
                  <i class="ph-bold ph-sparkle" style="color: var(--accent-cyan);"></i>
                  Install ViveStream Next
                </h2>
                <p class="section-desc" style="margin-top: 4px;">
                  Experience smooth, high-fidelity media streaming directly on your Windows desktop.
                </p>
              </div>

              {/* Install Path */}
              <div>
                <div style="font-size: 11px; font-weight: 600; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Installation Directory
                </div>
                <div class="path-box">
                  <span class="path-text" title={installPath()}>{installPath()}</span>
                  <button class="browse-btn" onClick={handleBrowse}>
                    <i class="ph ph-folder-open" style="margin-right: 4px;"></i>Browse
                  </button>
                </div>
              </div>

              {/* Options */}
              <div class="options-group">
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

            <div class="action-footer">
              <span style="font-size: 11px; color: var(--text-dim);">No admin rights required</span>
              <button class="primary-btn" onClick={startInstall}>
                <span>Install Now</span>
                <i class="ph-bold ph-arrow-right"></i>
              </button>
            </div>
          </Show>

          {/* STEP 2: INSTALLING */}
          <Show when={step() === "installing"}>
            <div class="progress-container">
              <div style="text-align: center; margin-bottom: 8px;">
                <h3 style="font-size: 16px; font-weight: 600; color: #fff;">Installing ViveStream Next</h3>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                  Setting up files and configuring Windows integration...
                </p>
              </div>

              <div class="progress-header">
                <span class="progress-status">
                  <i class="ph-bold ph-circle-notch" style="animation: spin 1s linear infinite; color: var(--accent-cyan);"></i>
                  {statusMessage()}
                </span>
                <span class="progress-percent">{Math.round(progress())}%</span>
              </div>

              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style={{ width: `${progress()}%` }}></div>
              </div>
            </div>

            <style>
              {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
            </style>
          </Show>

          {/* STEP 3: COMPLETED */}
          <Show when={step() === "completed"}>
            <div class="complete-box">
              <div class="success-badge">
                <i class="ph-bold ph-check"></i>
              </div>
              <h3 style="font-size: 18px; font-weight: 700; color: #fff;">Ready to Stream!</h3>
              <p style="font-size: 12px; color: var(--text-muted); max-width: 280px; line-height: 1.5;">
                ViveStream Next was successfully installed on your computer.
              </p>

              <div style="margin-top: 8px;">
                <label class="checkbox-label" style="justify-content: center;">
                  <input
                    type="checkbox"
                    checked={launchOnFinish()}
                    onChange={(e) => setLaunchOnFinish(e.currentTarget.checked)}
                  />
                  <span>Launch ViveStream Next now</span>
                </label>
              </div>
            </div>

            <div class="action-footer" style="justify-content: flex-end;">
              <button class="primary-btn" onClick={finishAndLaunch}>
                <span>{launchOnFinish() ? "Launch Now" : "Finish"}</span>
                <i class="ph-bold ph-rocket-launch"></i>
              </button>
            </div>
          </Show>

          {/* STEP 4: ERROR */}
          <Show when={step() === "error"}>
            <div class="complete-box">
              <div class="success-badge" style="border-color: #f87171; color: #f87171; box-shadow: 0 0 24px rgba(248, 113, 113, 0.4);">
                <i class="ph-bold ph-warning"></i>
              </div>
              <h3 style="font-size: 16px; font-weight: 600; color: #fff;">Installation Interrupted</h3>
              <p class="error-text">{errorMessage()}</p>
            </div>

            <div class="action-footer">
              <button class="secondary-btn" onClick={handleClose}>Cancel</button>
              <button class="primary-btn" onClick={startInstall}>
                <span>Retry</span>
                <i class="ph-bold ph-arrow-clockwise"></i>
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
