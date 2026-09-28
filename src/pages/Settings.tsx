import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  appTheme,
  toggleAppTheme,
  appPalette,
  toggleAppPalette,
  designStyle,
  toggleDesignStyle,
  playerAmbientMode,
  togglePlayerAmbientMode,
  playerAmbientType,
  togglePlayerAmbientType,
  playerAmbientColor,
  updatePlayerAmbientColor,
  playerAmbientIntensity,
  updatePlayerAmbientIntensity,
  playerAmbientBlur,
  updatePlayerAmbientBlur,
  playerAmbientAudioReactive,
  togglePlayerAmbientAudioReactive,
  playerAmbientAudioSensitivity,
  updatePlayerAmbientAudioSensitivity,
  sidebarHoverMode,
  toggleSidebarHoverMode,
  alwaysShowSearchBar,
  toggleAlwaysShowSearchBar,
  showFpsCounter,
  toggleShowFpsCounter,
  thumbnailQuality,
  updateThumbnailQuality,
  concurrentDownloads,
  updateConcurrentDownloads,
  concurrentFragments,
  updateConcurrentFragments,
  speedLimit,
  updateSpeedLimit,
  browserCookies,
  updateBrowserCookies,
  playerClient,
  updatePlayerClient,
  autoSubtitles,
  toggleAutoSubtitles,
  removeSponsorBlock,
  toggleRemoveSponsorBlock,
  setForceSetup,
  showConfirmDialog,
  addToast,
  setShowShortcutsModal,
  defaultSortBy,
  updateDefaultSortBy,
  defaultSortDirection,
  updateDefaultSortDirection,
  randomizeOnLaunch,
  toggleRandomizeOnLaunch,
  alwaysShowSortBar,
  toggleAlwaysShowSortBar,
  closeGlobalMiniplayer,
  isAiUnlocked,
  setIsAiUnlocked,
  whisperDefaultModel,
  updateWhisperDefaultModel,
  whisperDefaultTask,
  updateWhisperDefaultTask,
  whisperAutoLinkLyrics,
  toggleWhisperAutoLinkLyrics,
  whisperComputeDevice,
  updateWhisperComputeDevice,
} from "../store";
import BenchmarkModal from "../components/BenchmarkModal";
import { APP_VERSION } from "../version";
import "./Settings.css";

export interface EncoderTestResult {
  id: string;
  name: string;
  vendor: string;
  supported: boolean;
  speed_fps?: number;
  note: string;
}

export interface HardwareAccelerationReport {
  os: string;
  ffmpeg_installed: boolean;
  encoders: EncoderTestResult[];
  recommended_encoder: string;
  direct_copy_supported: boolean;
  advice: string;
}

export interface PoTokenStatus {
  active: boolean;
  token: string;
  age_seconds: number;
  ttl_seconds: number;
}

export default function Settings() {
  const [loadingDep, setLoadingDep] = createSignal(false);
  const [loadingClean, setLoadingClean] = createSignal(false);
  const [loadingNuclear, setLoadingNuclear] = createSignal(false);
  const [loadingUpdate, setLoadingUpdate] = createSignal(false);
  const [loadingReindex, setLoadingReindex] = createSignal(false);
  const [showBenchmark, setShowBenchmark] = createSignal(false);
  const [loadingHwTest, setLoadingHwTest] = createSignal(false);
  const [hwReport, setHwReport] =
    createSignal<HardwareAccelerationReport | null>(null);
  const [poStatus, setPoStatus] = createSignal<PoTokenStatus | null>(null);
  const [manualPoToken, setManualPoToken] = createSignal("");
  const [loadingPoToken, setLoadingPoToken] = createSignal(false);
  const [cookiesDropdownOpen, setCookiesDropdownOpen] = createSignal(false);
  const [clientDropdownOpen, setClientDropdownOpen] = createSignal(false);
  const [whisperStatus, setWhisperStatus] = createSignal<any | null>(null);
  const [loadingWhisperStatus, setLoadingWhisperStatus] = createSignal(false);
  const [isDeployingWhisper, setIsDeployingWhisper] = createSignal(false);
  const [whisperDeployMsg, setWhisperDeployMsg] = createSignal("");

  let cookiesRef: HTMLDivElement | undefined;
  let clientRef: HTMLDivElement | undefined;

  const cookieOptions = [
    "None",
    "Chrome",
    "Firefox",
    "Edge",
    "Brave",
    "Safari",
  ];

  const clientOptions = [
    "tv_embedded,web_embedded",
    "android_vr,tv,mweb",
    "mweb,tv,web_safari",
    "ios,android",
    "default",
  ];

  const loadPoTokenStatus = async () => {
    try {
      const status = await invoke<PoTokenStatus>("get_po_token_status");
      setPoStatus(status);
    } catch (e) {
      console.error("Failed to load PO token status:", e);
    }
  };

  const handleSaveManualToken = async () => {
    const t = manualPoToken().trim();
    if (!t) return;
    try {
      await invoke("set_manual_po_token", { token: t });
      addToast("PO Token saved and cached for 12 hours", "success");
      setManualPoToken("");
      loadPoTokenStatus();
    } catch (err) {
      addToast(`Failed to save PO token: ${err}`, "error");
    }
  };

  const handleRefreshToken = async () => {
    setLoadingPoToken(true);
    try {
      const token = await invoke<string>("refresh_po_token", {});
      addToast(`PO Token successfully acquired (${token.length} chars)`, "success");
      loadPoTokenStatus();
    } catch (err) {
      addToast(`PO Token extraction timed out or failed: ${err}`, "error");
      loadPoTokenStatus();
    } finally {
      setLoadingPoToken(false);
    }
  };

  const handleClearToken = async () => {
    try {
      await invoke("clear_po_token");
      addToast("PO Token cleared from cache", "info");
      loadPoTokenStatus();
    } catch (err) {
      addToast(`Failed to clear PO token: ${err}`, "error");
    }
  };

  const formatPoTtl = (ttlSec: number) => {
    const hours = Math.floor(ttlSec / 3600);
    const mins = Math.floor((ttlSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const fetchWhisperStatus = async () => {
    try {
      setLoadingWhisperStatus(true);
      const res = await invoke("check_whisper_status");
      setWhisperStatus(res);
    } catch (e) {
      console.error("Failed to load whisper status in settings:", e);
    } finally {
      setLoadingWhisperStatus(false);
    }
  };

  const handleDeployWhisperEngine = async () => {
    try {
      setIsDeployingWhisper(true);
      setWhisperDeployMsg("Deploying Whisper engine...");
      await invoke("install_whisper_binary");
      addToast("Whisper engine deployed successfully!", "success");
      await fetchWhisperStatus();
    } catch (e: any) {
      addToast(`Engine deployment failed: ${e}`, "error");
    } finally {
      setIsDeployingWhisper(false);
      setWhisperDeployMsg("");
    }
  };

  const handleOpenFolder = async (target: "models" | "lyrics") => {
    try {
      await invoke("open_whisper_folder", { target });
    } catch (e: any) {
      addToast(`Could not open folder: ${e}`, "error");
    }
  };

  onMount(() => {
    loadPoTokenStatus();
    fetchWhisperStatus();
    const handleClickOutside = (e: MouseEvent) => {
      if (cookiesRef && !cookiesRef.contains(e.target as Node)) {
        setCookiesDropdownOpen(false);
      }
      if (clientRef && !clientRef.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() =>
      document.removeEventListener("mousedown", handleClickOutside),
    );
  });

  const handleUpdateBinaries = async () => {
    setLoadingUpdate(true);
    try {
      try {
        await invoke("update_binaries");
      } catch {
        await invoke("download_binaries");
      }
      addToast(
        "Core engines (yt-dlp, Deno, and FFmpeg) have been successfully updated to the latest versions.",
        "success",
      );
    } catch (e) {
      addToast(`Update failed: ${e}`, "error");
    } finally {
      setLoadingUpdate(false);
    }
  };

  const handleReindexLibrary = async () => {
    setLoadingReindex(true);
    try {
      const result = await invoke<string>("reindex_library", {
        playerClient: playerClient(),
      });
      addToast(result, "success");
    } catch (e) {
      addToast(`Re-indexing task failed: ${e}`, "error");
    } finally {
      setLoadingReindex(false);
    }
  };

  const handleWipeDependencies = async () => {
    const yes = await showConfirmDialog(
      "Are you sure you want to delete yt-dlp and FFmpeg? This will break downloads until you restart the app and run the setup again.\n\nYour downloaded videos will NOT be deleted.",
      "Wipe Core Dependencies",
      "warning",
    );
    if (yes) {
      setLoadingDep(true);
      try {
        await invoke("wipe_dependencies");
        addToast(
          "Dependencies wiped successfully. Restart ViveStream to trigger setup.",
          "info",
        );
      } catch (e) {
        addToast(`Failed to wipe dependencies: ${e}`, "error");
      } finally {
        setLoadingDep(false);
      }
    }
  };

  const [activeSection, setActiveSection] = createSignal("sec-appearance");

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleCleanDatabase = async () => {
    const step1 = await showConfirmDialog(
      "WARNING: This will permanently delete your SQLite database and all downloaded videos/media.\n\nYour core engines (yt-dlp/ffmpeg) will be kept. Are you sure you want to proceed?",
      "Step 1 of 2: Clean Database",
      "warning",
    );
    if (!step1) return;

    const step2 = await showConfirmDialog(
      "FINAL CONFIRMATION: You are about to permanently wipe all downloaded media from disk. This cannot be undone.",
      "Step 2 of 2: Confirm Destruction",
      "error",
    );
    if (step2) {
      setLoadingClean(true);
      try {
        closeGlobalMiniplayer();
        await invoke("clean_database_and_media");
        addToast("Database and media have been successfully cleaned.", "info");
      } catch (e) {
        addToast(`Clean failed: ${e}`, "error");
      } finally {
        setLoadingClean(false);
      }
    }
  };

  const handleNuclearWipe = async () => {
    const step1 = await showConfirmDialog(
      "WARNING: Nuclear wipe will delete all core engines (yt-dlp, FFmpeg), SQLite database, and all downloaded videos.\n\nContinue?",
      "Step 1 of 2: Nuclear Wipe",
      "warning",
    );
    if (!step1) return;

    const step2 = await showConfirmDialog(
      "FINAL WARNING: EVERYTHING will be destroyed permanently. Proceed with Nuclear Wipe?",
      "Step 2 of 2: Execute Nuclear Wipe",
      "error",
    );
    if (step2) {
      setLoadingNuclear(true);
      try {
        closeGlobalMiniplayer();
        await invoke("nuclear_wipe");
        addToast(
          "Nuclear wipe complete. All app data and videos have been destroyed. You can now safely uninstall the application from your OS.",
          "info",
        );
      } catch (e) {
        addToast(`Nuclear wipe failed or was partially blocked: ${e}`, "error");
      } finally {
        setLoadingNuclear(false);
      }
    }
  };

  const handleRunHardwareTest = async () => {
    setLoadingHwTest(true);
    try {
      const res = await invoke<HardwareAccelerationReport>(
        "test_hardware_transcoding",
      );
      setHwReport(res);
      addToast(
        "Hardware transcoding diagnostics completed successfully.",
        "info",
      );
    } catch (e) {
      addToast(`Hardware probe failed: ${e}`, "error");
    } finally {
      setLoadingHwTest(false);
    }
  };

  const openExternalLink = async (url: string) => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div class="page-wrapper settings-page">
      {/* Sticky Quick-Jump Navigation Pill Bar */}
      <div
        class="settings-nav-sticky"
        role="navigation"
        aria-label="Settings Categories"
      >
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-appearance" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-appearance")}
        >
          <i class="ph-fill ph-paint-brush"></i> Appearance
        </button>
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-library" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-library")}
        >
          <i class="ph-fill ph-sort-ascending"></i> Library
        </button>
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-engine" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-engine")}
        >
          <i class="ph-fill ph-sliders"></i> Engine
        </button>
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-ai" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-ai")}
        >
          <i class="ph-fill ph-brain"></i> AI Studio
        </button>
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-diagnostics" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-diagnostics")}
        >
          <i class="ph-fill ph-gauge"></i> Diagnostics
        </button>
        <button
          type="button"
          class={`settings-nav-pill danger-pill ${activeSection() === "sec-danger" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-danger")}
        >
          <i class="ph-fill ph-warning-circle"></i> Danger Zone
        </button>
        <button
          type="button"
          class={`settings-nav-pill ${activeSection() === "sec-about" ? "active" : ""}`}
          onClick={() => scrollToSection("sec-about")}
        >
          <i class="ph-fill ph-info"></i> About
        </button>
      </div>

      <h2 class="page-title" id="sec-appearance">
        <i class="ph-fill ph-gear"></i> Appearance & UI
      </h2>

      <div class="settings-card">
        {/* App Theme (Light vs Dark) - Large Cards Only */}
        <div class="theme-setting-container" id="setting-appearance-theme">
          <div class="flex-row-between theme-setting-header">
            <div>
              <h3 class="settings-title">App Theme</h3>
              <p class="settings-desc">
                Choose between Light and Dark interface modes.
              </p>
            </div>
          </div>

          <div class="theme-side-by-side-grid">
            {/* Light Mode Card */}
            <div
              class={`theme-preview-card light-theme-preview ${appTheme() === "light" ? "selected" : ""}`}
              onClick={() => toggleAppTheme("light")}
            >
              <div class="theme-preview-mockup">
                <div class="mockup-sidebar">
                  <div class="mockup-bar mockup-logo"></div>
                  <div class="mockup-bar"></div>
                  <div class="mockup-bar"></div>
                  <div class="mockup-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar">
                    <div class="mockup-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card">
                      <div class="mockup-card-thumb"></div>
                      <div class="mockup-card-line"></div>
                      <div class="mockup-card-line short"></div>
                    </div>
                    <div class="mockup-card">
                      <div class="mockup-card-thumb"></div>
                      <div class="mockup-card-line"></div>
                      <div class="mockup-card-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-fill ph-sun"></i>
                    <span class="theme-card-name">Light Theme</span>
                  </div>
                  <span class="theme-card-desc">
                    Warm & crisp daylight aesthetic
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={appTheme() === "light" ? "ph-bold ph-check" : ""}
                  ></i>
                </div>
              </div>
            </div>

            {/* Dark Mode Card */}
            <div
              class={`theme-preview-card dark-theme-preview ${appTheme() === "dark" ? "selected" : ""}`}
              onClick={() => toggleAppTheme("dark")}
            >
              <div class="theme-preview-mockup">
                <div class="mockup-sidebar">
                  <div class="mockup-bar mockup-logo"></div>
                  <div class="mockup-bar"></div>
                  <div class="mockup-bar"></div>
                  <div class="mockup-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar">
                    <div class="mockup-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card">
                      <div class="mockup-card-thumb"></div>
                      <div class="mockup-card-line"></div>
                      <div class="mockup-card-line short"></div>
                    </div>
                    <div class="mockup-card">
                      <div class="mockup-card-thumb"></div>
                      <div class="mockup-card-line"></div>
                      <div class="mockup-card-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-fill ph-moon"></i>
                    <span class="theme-card-name">Dark Theme</span>
                  </div>
                  <span class="theme-card-desc">
                    Deep obsidian nighttime aesthetic
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={appTheme() === "dark" ? "ph-bold ph-check" : ""}
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Design Style (Neo-Brutalism vs Claymorphism) */}
        <div class="theme-setting-container" id="setting-appearance-style">
          <div class="flex-row-between theme-setting-header">
            <div>
              <h3 class="settings-title">Design Style</h3>
              <p class="settings-desc">
                Select your preferred interface style: Neo-Brutalism or
                Claymorphism.
              </p>
            </div>
          </div>

          <div class="theme-side-by-side-grid">
            {/* Neo-Brutalism Card */}
            <div
              class={`theme-preview-card style-neo-preview ${designStyle() === "neo-brutalism" ? "selected" : ""}`}
              onClick={() => toggleDesignStyle("neo-brutalism")}
            >
              <div class="theme-preview-mockup style-neo-mockup">
                <div class="mockup-sidebar neo-mock-side">
                  <div class="mockup-bar mockup-logo neo-mock-logo"></div>
                  <div class="mockup-bar neo-mock-bar"></div>
                  <div class="mockup-bar neo-mock-bar"></div>
                  <div class="mockup-bar neo-mock-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar neo-mock-topbar">
                    <div class="mockup-search neo-mock-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card neo-mock-card">
                      <div class="mockup-card-thumb neo-mock-thumb"></div>
                      <div class="mockup-card-line neo-mock-line"></div>
                      <div class="mockup-card-line neo-mock-line short"></div>
                    </div>
                    <div class="mockup-card neo-mock-card">
                      <div class="mockup-card-thumb neo-mock-thumb"></div>
                      <div class="mockup-card-line neo-mock-line"></div>
                      <div class="mockup-card-line neo-mock-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-bold ph-square-half"></i>
                    <span class="theme-card-name">Neo-Brutalism</span>
                  </div>
                  <span class="theme-card-desc">
                    High-contrast solid borders & crisp hard shadows
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={
                      designStyle() === "neo-brutalism"
                        ? "ph-bold ph-check"
                        : ""
                    }
                  ></i>
                </div>
              </div>
            </div>

            {/* Claymorphism Card */}
            <div
              class={`theme-preview-card style-clay-preview ${designStyle() === "claymorphism" ? "selected" : ""}`}
              onClick={() => toggleDesignStyle("claymorphism")}
            >
              <div class="theme-preview-mockup style-clay-mockup">
                <div class="mockup-sidebar clay-mock-side">
                  <div class="mockup-bar mockup-logo clay-mock-logo"></div>
                  <div class="mockup-bar clay-mock-bar"></div>
                  <div class="mockup-bar clay-mock-bar"></div>
                  <div class="mockup-bar clay-mock-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar clay-mock-topbar">
                    <div class="mockup-search clay-mock-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card clay-mock-card">
                      <div class="mockup-card-thumb clay-mock-thumb"></div>
                      <div class="mockup-card-line clay-mock-line"></div>
                      <div class="mockup-card-line clay-mock-line short"></div>
                    </div>
                    <div class="mockup-card clay-mock-card">
                      <div class="mockup-card-thumb clay-mock-thumb"></div>
                      <div class="mockup-card-line clay-mock-line"></div>
                      <div class="mockup-card-line clay-mock-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-bold ph-circles-three-plus"></i>
                    <span class="theme-card-name">Claymorphism</span>
                  </div>
                  <span class="theme-card-desc">
                    Soft floating 3D volume, diffuse Gaussian blurs & glows
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={
                      designStyle() === "claymorphism" ? "ph-bold ph-check" : ""
                    }
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Color Palette (Sunset vs Crimson) */}
        <div class="theme-setting-container" id="setting-appearance-palette">
          <div class="flex-row-between theme-setting-header">
            <div>
              <h3 class="settings-title">Color Palette</h3>
              <p class="settings-desc">
                Select a primary color scheme and vibrant brand accents.
              </p>
            </div>
          </div>

          <div class="theme-side-by-side-grid">
            {/* Sunset Palette Card */}
            <div
              class={`theme-preview-card palette-sunset-preview ${appPalette() === "sunset" ? "selected" : ""}`}
              onClick={() => toggleAppPalette("sunset")}
            >
              <div class="theme-preview-mockup palette-sunset-mockup">
                <div class="mockup-sidebar sunset-mock-side">
                  <div class="mockup-bar mockup-logo sunset-mock-logo"></div>
                  <div class="mockup-bar sunset-mock-bar"></div>
                  <div class="mockup-bar sunset-mock-bar"></div>
                  <div class="mockup-bar sunset-mock-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar sunset-mock-topbar">
                    <div class="mockup-search sunset-mock-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card sunset-mock-card">
                      <div class="mockup-card-thumb sunset-mock-thumb"></div>
                      <div class="mockup-card-line sunset-mock-line"></div>
                      <div class="mockup-card-line sunset-mock-line short"></div>
                    </div>
                    <div class="mockup-card sunset-mock-card">
                      <div class="mockup-card-thumb sunset-mock-thumb"></div>
                      <div class="mockup-card-line sunset-mock-line"></div>
                      <div class="mockup-card-line sunset-mock-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-fill ph-sun-horizon"></i>
                    <span class="theme-card-name">Sunset</span>
                  </div>
                  <span class="theme-card-desc">
                    Warm Tangerine & Coral energized highlights
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={appPalette() === "sunset" ? "ph-bold ph-check" : ""}
                  ></i>
                </div>
              </div>
            </div>

            {/* Crimson Palette Card */}
            <div
              class={`theme-preview-card palette-crimson-preview ${appPalette() === "crimson" ? "selected" : ""}`}
              onClick={() => toggleAppPalette("crimson")}
            >
              <div class="theme-preview-mockup palette-crimson-mockup">
                <div class="mockup-sidebar crimson-mock-side">
                  <div class="mockup-bar mockup-logo crimson-mock-logo"></div>
                  <div class="mockup-bar crimson-mock-bar"></div>
                  <div class="mockup-bar crimson-mock-bar"></div>
                  <div class="mockup-bar crimson-mock-bar"></div>
                </div>
                <div class="mockup-main">
                  <div class="mockup-topbar crimson-mock-topbar">
                    <div class="mockup-search crimson-mock-search"></div>
                  </div>
                  <div class="mockup-grid">
                    <div class="mockup-card crimson-mock-card">
                      <div class="mockup-card-thumb crimson-mock-thumb"></div>
                      <div class="mockup-card-line crimson-mock-line"></div>
                      <div class="mockup-card-line crimson-mock-line short"></div>
                    </div>
                    <div class="mockup-card crimson-mock-card">
                      <div class="mockup-card-thumb crimson-mock-thumb"></div>
                      <div class="mockup-card-line crimson-mock-line"></div>
                      <div class="mockup-card-line crimson-mock-line short"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="theme-card-footer">
                <div class="theme-card-info">
                  <div class="theme-card-title-row">
                    <i class="ph-fill ph-fire"></i>
                    <span class="theme-card-name">Crimson</span>
                  </div>
                  <span class="theme-card-desc">
                    Bold Scarlet & Ruby intense high-contrast tones
                  </span>
                </div>
                <div class="theme-radio-indicator">
                  <i
                    class={appPalette() === "crimson" ? "ph-bold ph-check" : ""}
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Ambient Lighting Studio */}
        <div class="ambient-studio-container" id="setting-appearance-ambient">
          <div class="flex-row-between theme-setting-header">
            <div>
              <h3 class="settings-title">Ambient Lighting (Cinematic Glow)</h3>
              <p class="settings-desc">
                Cast an immersive diffuse glow around the video player onto the
                background canvas.
              </p>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                checked={playerAmbientMode()}
                onChange={(e) => togglePlayerAmbientMode(e.target.checked)}
              />
              <span class="slider"></span>
            </label>
          </div>

          <Show when={playerAmbientMode()}>
            <div class="ambient-studio-body">
              {/* Mode Selection Cards */}
              <div class="ambient-mode-grid">
                <div
                  class={`ambient-mode-card ${playerAmbientType() === "dynamic" ? "selected" : ""}`}
                  onClick={() => togglePlayerAmbientType("dynamic")}
                >
                  <div class="ambient-mode-card-header">
                    <div class="ambient-mode-icon dynamic">
                      <i class="ph-fill ph-video-camera"></i>
                    </div>
                    <div class="ambient-mode-title-col">
                      <span class="ambient-mode-name">Dynamic Mode</span>
                      <span class="ambient-mode-desc">
                        Extracts dominant colors dynamically from active video
                        playback in real time
                      </span>
                    </div>
                  </div>
                  <div class="theme-radio-indicator">
                    <i
                      class={
                        playerAmbientType() === "dynamic"
                          ? "ph-bold ph-check"
                          : ""
                      }
                    ></i>
                  </div>
                </div>

                <div
                  class={`ambient-mode-card ${playerAmbientType() === "static" ? "selected" : ""}`}
                  onClick={() => togglePlayerAmbientType("static")}
                >
                  <div class="ambient-mode-card-header">
                    <div class="ambient-mode-icon static">
                      <i class="ph-fill ph-palette"></i>
                    </div>
                    <div class="ambient-mode-title-col">
                      <span class="ambient-mode-name">Static Mode</span>
                      <span class="ambient-mode-desc">
                        Custom color aura with zero CPU overhead and fixed
                        ambient radiance
                      </span>
                    </div>
                  </div>
                  <div class="theme-radio-indicator">
                    <i
                      class={
                        playerAmbientType() === "static"
                          ? "ph-bold ph-check"
                          : ""
                      }
                    ></i>
                  </div>
                </div>
              </div>

              {/* Static Color Customizer (Shown when Static mode is selected) */}
              <Show when={playerAmbientType() === "static"}>
                <div class="ambient-color-section">
                  <div class="ambient-section-subtitle">
                    <i class="ph-bold ph-paint-brush-broad"></i>
                    <span>Aura Color Palette</span>
                  </div>

                  <div class="ambient-swatches-grid">
                    {[
                      { name: "Sunset Coral", color: "#f25c54" },
                      { name: "Crimson Red", color: "#ef233c" },
                      { name: "Cyber Cyan", color: "#00f0ff" },
                      { name: "Electric Purple", color: "#a855f7" },
                      { name: "Emerald", color: "#10b981" },
                      { name: "Golden Amber", color: "#f59e0b" },
                      { name: "Cobalt Blue", color: "#3b82f6" },
                      { name: "Hot Pink", color: "#ec4899" },
                      { name: "Studio White", color: "#f8fafc" },
                    ].map((preset) => (
                      <button
                        type="button"
                        class={`ambient-swatch-chip ${playerAmbientColor().toLowerCase() === preset.color.toLowerCase() ? "selected" : ""}`}
                        style={{ "--swatch-color": preset.color } as any}
                        onClick={() => {
                          updatePlayerAmbientColor(preset.color);
                          togglePlayerAmbientType("static");
                        }}
                        title={preset.name}
                      >
                        <span
                          class="swatch-circle"
                          style={{ background: preset.color }}
                        ></span>
                        <span class="swatch-label">{preset.name}</span>
                        <Show
                          when={
                            playerAmbientColor().toLowerCase() ===
                            preset.color.toLowerCase()
                          }
                        >
                          <i class="ph-bold ph-check swatch-check"></i>
                        </Show>
                      </button>
                    ))}
                  </div>

                  <div class="ambient-custom-picker-row">
                    <div class="ambient-color-picker-wrapper">
                      <input
                        type="color"
                        class="ambient-native-picker"
                        value={playerAmbientColor()}
                        onInput={(e) => {
                          updatePlayerAmbientColor(e.currentTarget.value);
                          togglePlayerAmbientType("static");
                        }}
                        aria-label="Custom Ambient Color Picker"
                      />
                      <span
                        class="ambient-picker-preview"
                        style={{ background: playerAmbientColor() }}
                      ></span>
                      <span class="ambient-picker-label">
                        Custom Palette Color
                      </span>
                    </div>

                    <div class="ambient-hex-input-group">
                      <span class="hex-hash">#</span>
                      <input
                        type="text"
                        class="setting-input ambient-hex-input"
                        value={playerAmbientColor().replace("#", "")}
                        onInput={(e) => {
                          const val = e.currentTarget.value
                            .trim()
                            .replace("#", "");
                          if (/^[0-9A-Fa-f]{6}$/.test(val)) {
                            updatePlayerAmbientColor("#" + val);
                            togglePlayerAmbientType("static");
                          }
                        }}
                        placeholder="f25c54"
                        maxLength="6"
                      />
                    </div>
                  </div>
                </div>
              </Show>

              {/* Sliders: Intensity & Blur Radius */}
              <div class="ambient-sliders-grid">
                <div class="ambient-slider-card">
                  <div class="flex-row-between">
                    <span class="ambient-slider-label">
                      <i class="ph-bold ph-sun"></i> Glow Intensity
                    </span>
                    <span class="ambient-slider-badge">
                      {playerAmbientIntensity()}%
                    </span>
                  </div>
                  <input
                    type="range"
                    class="setting-slider ambient-full-slider"
                    min="20"
                    max="150"
                    step="5"
                    value={playerAmbientIntensity()}
                    onInput={(e) =>
                      updatePlayerAmbientIntensity(
                        parseInt(e.currentTarget.value, 10),
                      )
                    }
                    style={
                      {
                        "--progress": `${((playerAmbientIntensity() - 20) / (150 - 20)) * 100}%`,
                      } as any
                    }
                  />
                </div>

                <div class="ambient-slider-card">
                  <div class="flex-row-between">
                    <span class="ambient-slider-label">
                      <i class="ph-bold ph-faders"></i> Diffusion Blur Radius
                    </span>
                    <span class="ambient-slider-badge">
                      {playerAmbientBlur()}px
                    </span>
                  </div>
                  <input
                    type="range"
                    class="setting-slider ambient-full-slider"
                    min="20"
                    max="100"
                    step="2"
                    value={playerAmbientBlur()}
                    onInput={(e) =>
                      updatePlayerAmbientBlur(
                        parseInt(e.currentTarget.value, 10),
                      )
                    }
                    style={
                      {
                        "--progress": `${((playerAmbientBlur() - 20) / (100 - 20)) * 100}%`,
                      } as any
                    }
                  />
                </div>

                {/* Audio-Reactive Dynamic Glow */}
                <div class="ambient-slider-card">
                  <div class="flex-row-between">
                    <span class="ambient-slider-label">
                      <i class="ph-bold ph-waveform"></i> Audio-Reactive Pulse
                    </span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        checked={playerAmbientAudioReactive()}
                        onChange={(e) =>
                          togglePlayerAmbientAudioReactive(e.target.checked)
                        }
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                  <Show when={playerAmbientAudioReactive()}>
                    <div style="margin-top: 10px;">
                      <div class="flex-row-between" style="margin-bottom: 4px;">
                        <span
                          class="ambient-slider-label"
                          style="font-size: 11px; text-transform: uppercase;"
                        >
                          Bass Reactivity
                        </span>
                        <span class="ambient-slider-badge">
                          {playerAmbientAudioSensitivity()}%
                        </span>
                      </div>
                      <input
                        type="range"
                        class="setting-slider ambient-full-slider"
                        min="30"
                        max="200"
                        step="5"
                        value={playerAmbientAudioSensitivity()}
                        onInput={(e) =>
                          updatePlayerAmbientAudioSensitivity(
                            parseInt(e.currentTarget.value, 10),
                          )
                        }
                        style={
                          {
                            "--progress": `${((playerAmbientAudioSensitivity() - 30) / (200 - 30)) * 100}%`,
                          } as any
                        }
                      />
                    </div>
                  </Show>
                </div>
              </div>

              {/* Live Mockup Preview */}
              <div class="ambient-preview-stage">
                <div class="ambient-stage-header">
                  <i class="ph-bold ph-eye"></i>
                  <span>Live Ambient Studio Preview</span>
                </div>
                <div class="ambient-stage-canvas">
                  <div
                    class="ambient-mock-glow"
                    style={{
                      background:
                        playerAmbientType() === "dynamic"
                          ? "linear-gradient(135deg, #f25c54, #ff9e00, #a855f7)"
                          : playerAmbientColor(),
                      filter: `blur(${playerAmbientBlur() * 0.55}px)`,
                      opacity: `${playerAmbientIntensity() / 100}`,
                    }}
                  ></div>
                  <div class="ambient-mock-screen">
                    <div class="ambient-mock-header-bar">
                      <div class="ambient-mock-dot"></div>
                      <div class="ambient-mock-dot"></div>
                      <div class="ambient-mock-dot"></div>
                    </div>
                    <div class="ambient-mock-video-area">
                      <i class="ph-fill ph-play-circle ambient-mock-play"></i>
                      <div class="ambient-mock-title-strip">
                        <span>ViveStream Cinema</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-appearance-sidebar">
          <div>
            <h3 class="settings-title">Auto-Expand Sidebar</h3>
            <p class="settings-desc">
              Automatically open the side navigation menu when hovering over it.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={sidebarHoverMode()}
              onChange={(e) => toggleSidebarHoverMode(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-appearance-searchbar">
          <div>
            <h3 class="settings-title">Always Show Search Bar</h3>
            <p class="settings-desc">
              Keep the global search bar visible in the top header instead of
              auto-hiding.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={alwaysShowSearchBar()}
              onChange={(e) => toggleAlwaysShowSearchBar(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-appearance-fps">
          <div>
            <h3 class="settings-title">Show FPS Counter</h3>
            <p class="settings-desc">
              Display an in-app real-time frame rate monitor in the corner.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={showFpsCounter()}
              onChange={(e) => toggleShowFpsCounter(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-appearance-thumb-quality">
          <div>
            <h3 class="settings-title">
              Thumbnail Quality (FPS & VRAM Optimization)
            </h3>
            <p class="settings-desc">
              Adjust thumbnail texture size. Lower settings deliver ultra-high
              frame rates (60–144 FPS) on dense fullscreen grids.
            </p>
          </div>
          <div class="quality-slider-wrapper">
            <div class="quality-step-labels">
              <span
                class={`step-label ${thumbnailQuality() === "low" ? "active" : ""}`}
                onClick={() => updateThumbnailQuality("low")}
              >
                360p (Ultra FPS)
              </span>
              <span
                class={`step-label ${thumbnailQuality() === "medium" ? "active" : ""}`}
                onClick={() => updateThumbnailQuality("medium")}
              >
                480p (Balanced)
              </span>
              <span
                class={`step-label ${thumbnailQuality() === "high" ? "active" : ""}`}
                onClick={() => updateThumbnailQuality("high")}
              >
                Original (High)
              </span>
            </div>
            <input
              type="range"
              class="setting-slider quality-range-slider"
              min="1"
              max="3"
              step="1"
              value={
                thumbnailQuality() === "low"
                  ? 1
                  : thumbnailQuality() === "high"
                    ? 3
                    : 2
              }
              onInput={(e) => {
                const val = parseInt(e.target.value);
                const q = val === 1 ? "low" : val === 3 ? "high" : "medium";
                updateThumbnailQuality(q);
              }}
              style={
                {
                  "--progress": `${
                    (((thumbnailQuality() === "low"
                      ? 1
                      : thumbnailQuality() === "high"
                        ? 3
                        : 2) -
                      1) /
                      2) *
                    100
                  }%`,
                } as any
              }
            />
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-appearance-shortcuts">
          <div>
            <h3 class="settings-title">Keyboard Shortcuts</h3>
            <p class="settings-desc">
              View all playback, media seeking, and app navigation keybindings.
            </p>
          </div>
          <button
            onClick={() => setShowShortcutsModal(true)}
            class="command-btn secondary"
            style="min-width: 140px;"
          >
            <i class="ph-fill ph-keyboard"></i> View Cheat Sheet
          </button>
        </div>
      </div>

      <h2 class="page-title page-title-spaced" id="sec-library">
        <i class="ph-fill ph-sort-ascending"></i> Library Sorting & Presentation
      </h2>

      <div class="settings-card">
        <div class="flex-row-between" id="setting-sort-default-by">
          <div>
            <h3 class="settings-title">Default Sort Criterion</h3>
            <p class="settings-desc">
              Initial sorting order used when opening the video library.
            </p>
          </div>
          <div class="toggle-group">
            <button
              onClick={() => updateDefaultSortBy("date")}
              class={`toggle-btn ${defaultSortBy() === "date" ? "active" : ""}`}
            >
              <i class="ph ph-calendar-blank"></i> Date
            </button>
            <button
              onClick={() => updateDefaultSortBy("name")}
              class={`toggle-btn ${defaultSortBy() === "name" ? "active" : ""}`}
            >
              <i class="ph ph-text-aa"></i> Name
            </button>
            <button
              onClick={() => updateDefaultSortBy("channel")}
              class={`toggle-btn ${defaultSortBy() === "channel" ? "active" : ""}`}
            >
              <i class="ph ph-user"></i> Channel
            </button>
            <button
              onClick={() => updateDefaultSortBy("random")}
              class={`toggle-btn ${defaultSortBy() === "random" ? "active" : ""}`}
            >
              <i class="ph ph-shuffle"></i> Random
            </button>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-sort-default-direction">
          <div>
            <h3 class="settings-title">Default Sort Direction</h3>
            <p class="settings-desc">
              Preferred ordering sequence for chronological and alphabetical
              lists.
            </p>
          </div>
          <div class="toggle-group">
            <button
              onClick={() => updateDefaultSortDirection("desc")}
              class={`toggle-btn ${defaultSortDirection() === "desc" ? "active" : ""}`}
            >
              <i class="ph ph-sort-descending"></i> Descending
            </button>
            <button
              onClick={() => updateDefaultSortDirection("asc")}
              class={`toggle-btn ${defaultSortDirection() === "asc" ? "active" : ""}`}
            >
              <i class="ph ph-sort-ascending"></i> Ascending
            </button>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-sort-randomize-launch">
          <div>
            <h3 class="settings-title">Randomize Library on Startup</h3>
            <p class="settings-desc">
              Shuffle media order automatically on every launch to discover
              fresh content.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={randomizeOnLaunch()}
              onChange={(e) => toggleRandomizeOnLaunch(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-sort-always-show">
          <div>
            <h3 class="settings-title">Always Show Sort Bar</h3>
            <p class="settings-desc">
              Keep the floating sort controls visible at the top of library
              pages instead of auto-hiding. (Shortcut:{" "}
              <kbd style="background: var(--primary-background); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.8rem;">
                Ctrl+S
              </kbd>
              )
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={alwaysShowSortBar()}
              onChange={(e) => toggleAlwaysShowSortBar(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <h2 class="page-title page-title-spaced" id="sec-engine">
        <i class="ph-fill ph-sliders"></i> Engine Preferences
      </h2>

      <div class="settings-card">
        <div class="flex-row-between" id="setting-engine-concurrent-dl">
          <div>
            <h3 class="settings-title">Concurrent Downloads</h3>
            <p class="settings-desc">
              Maximum number of videos to download at the same time.
            </p>
          </div>
          <div class="flex-row-gap">
            <input
              type="range"
              class="setting-slider"
              min="1"
              max="5"
              step="1"
              value={concurrentDownloads()}
              onInput={(e) =>
                updateConcurrentDownloads(parseInt(e.target.value))
              }
              style={
                {
                  "--progress": `${
                    ((concurrentDownloads() - 1) / (5 - 1)) * 100
                  }%`,
                } as any
              }
            />
            <span class="slider-val">{concurrentDownloads()}</span>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-concurrent-frag">
          <div>
            <h3 class="settings-title">Concurrent Fragments (HLS/DASH)</h3>
            <p class="settings-desc">
              Speeds up live streams and chunked videos by downloading multiple
              fragments concurrently.
            </p>
          </div>
          <div class="flex-row-gap">
            <input
              type="range"
              class="setting-slider"
              min="1"
              max="16"
              step="1"
              value={concurrentFragments()}
              onInput={(e) =>
                updateConcurrentFragments(parseInt(e.target.value))
              }
              style={
                {
                  "--progress": `${
                    ((concurrentFragments() - 1) / (16 - 1)) * 100
                  }%`,
                } as any
              }
            />
            <span class="slider-val">{concurrentFragments()}</span>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-speed-limit">
          <div>
            <h3 class="settings-title">Download Speed Limit</h3>
            <p class="settings-desc">
              Throttle download bandwidth to preserve network balance (e.g.,
              500K, 2.5M, 10M).
            </p>
          </div>
          <div class="speed-limit-control-box">
            <div class="speed-limit-input-wrapper">
              <i class="ph ph-gauge speed-input-icon"></i>
              <input
                type="text"
                class="speed-limit-input"
                placeholder="No limit"
                value={speedLimit()}
                onInput={(e) => updateSpeedLimit(e.currentTarget.value)}
                aria-label="Download Speed Limit"
              />
              <Show when={speedLimit().trim()}>
                <button
                  type="button"
                  class="speed-limit-clear-btn"
                  onClick={() => updateSpeedLimit("")}
                  title="Clear limit (No limit)"
                  aria-label="Clear speed limit"
                >
                  <i class="ph ph-x"></i>
                </button>
              </Show>
            </div>
            <div
              class="speed-limit-presets"
              role="toolbar"
              aria-label="Speed limit presets"
            >
              <button
                type="button"
                class={`speed-preset-btn ${!speedLimit().trim() ? "active" : ""}`}
                onClick={() => updateSpeedLimit("")}
              >
                Max
              </button>
              <button
                type="button"
                class={`speed-preset-btn ${speedLimit().trim().toUpperCase() === "2M" ? "active" : ""}`}
                onClick={() => updateSpeedLimit("2M")}
              >
                2M
              </button>
              <button
                type="button"
                class={`speed-preset-btn ${speedLimit().trim().toUpperCase() === "5M" ? "active" : ""}`}
                onClick={() => updateSpeedLimit("5M")}
              >
                5M
              </button>
              <button
                type="button"
                class={`speed-preset-btn ${speedLimit().trim().toUpperCase() === "10M" ? "active" : ""}`}
                onClick={() => updateSpeedLimit("10M")}
              >
                10M
              </button>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-browser-cookies">
          <div>
            <h3 class="settings-title">Browser Cookies Extraction</h3>
            <p class="settings-desc">
              Bypass bot detection, login screens, and age gates by extracting
              cookies from your local browser.
            </p>
          </div>
          <div
            class={`custom-select-wrapper ${cookiesDropdownOpen() ? "open" : ""}`}
            ref={cookiesRef}
          >
            <div
              class="custom-select-trigger"
              onClick={() => setCookiesDropdownOpen(!cookiesDropdownOpen())}
            >
              <span>
                {browserCookies() === "none"
                  ? "None"
                  : browserCookies().charAt(0).toUpperCase() +
                    browserCookies().slice(1)}
              </span>
              <i class="ph ph-caret-down"></i>
            </div>
            <div class="custom-select-menu">
              <For each={cookieOptions}>
                {(opt) => (
                  <div
                    class={`custom-select-item ${
                      (browserCookies() === "none" && opt === "None") ||
                      browserCookies().toLowerCase() === opt.toLowerCase()
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      updateBrowserCookies(opt.toLowerCase());
                      setCookiesDropdownOpen(false);
                    }}
                  >
                    {opt}
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-youtube-client">
          <div>
            <h3 class="settings-title">YouTube API Client Masquerade</h3>
            <p class="settings-desc">
              Hot-swap client fallbacks when encountering YouTube throttling or
              format lockouts.
            </p>
          </div>
          <div
            class={`custom-select-wrapper ${clientDropdownOpen() ? "open" : ""}`}
            ref={clientRef}
          >
            <div
              class="custom-select-trigger"
              onClick={() => setClientDropdownOpen(!clientDropdownOpen())}
            >
              <span>{playerClient()}</span>
              <i class="ph ph-caret-down"></i>
            </div>
            <div class="custom-select-menu">
              <For each={clientOptions}>
                {(opt) => (
                  <div
                    class={`custom-select-item ${playerClient() === opt ? "selected" : ""}`}
                    onClick={() => {
                      updatePlayerClient(opt);
                      setClientDropdownOpen(false);
                    }}
                  >
                    {opt}
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-auto-subs">
          <div>
            <h3 class="settings-title">Download Automatic Subtitles</h3>
            <p class="settings-desc">
              Automatically fallback to YouTube auto-generated captions if
              creator captions are missing.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={autoSubtitles()}
              onChange={(e) => toggleAutoSubtitles(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-sponsorblock">
          <div>
            <h3 class="settings-title">Remove Sponsored Segments</h3>
            <p class="settings-desc">
              Automatically strip sponsor integrations, promos, intros, and
              outros using SponsorBlock.
            </p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={removeSponsorBlock()}
              onChange={(e) => toggleRemoveSponsorBlock(e.target.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        <div class="flex-row-between" id="setting-engine-reindex">
          <div>
            <h3 class="settings-title">Re-index Local Storage</h3>
            <p class="settings-desc">
              Scan your media folder to link unindexed files, fix missing
              metadata, and remove broken database pointers.
            </p>
          </div>
          <button
            onClick={handleReindexLibrary}
            disabled={loadingReindex()}
            class="command-btn secondary"
            style="min-width: 150px;"
          >
            <i
              class={`ph-fill ${loadingReindex() ? "ph-spinner spinIcon" : "ph-database"}`}
            ></i>
            {loadingReindex() ? "Re-indexing..." : "Re-index Library"}
          </button>
        </div>

        <div class="full-divider"></div>

        <div class="po-token-management-block" id="setting-engine-po-token">
          <div
            class="flex-row-between"
            style="align-items: flex-start; margin-bottom: 12px; gap: 16px;"
          >
            <div>
              <div
                style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"
              >
                <h3 class="settings-title">
                  YouTube PO Token (Proof of Origin)
                </h3>
                <Show when={poStatus()?.active}>
                  <span
                    class="hw-badge hw-pass"
                    style="font-size: 0.75rem; padding: 2px 8px;"
                  >
                    <i class="ph-bold ph-check-circle"></i> Cached & Active
                    (Expires in {formatPoTtl(poStatus()!.ttl_seconds)})
                  </span>
                </Show>
                <Show when={!poStatus()?.active}>
                  <span
                    class="hw-badge hw-neutral"
                    style="font-size: 0.75rem; padding: 2px 8px;"
                  >
                    <i class="ph-bold ph-info"></i> Fallback Stream Mode (No
                    Token)
                  </span>
                </Show>
              </div>
              <p class="settings-desc" style="margin-top: 4px;">
                PO Tokens authenticate client requests with YouTube to unlock
                1080p, 1440p, and 4K formats without 144p resolution caps or
                format lockouts. Tokens are automatically saved to disk and
                reused until expiration.
              </p>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
              <button
                onClick={handleRefreshToken}
                disabled={loadingPoToken()}
                class="command-btn secondary"
                title="Attempt fast background extraction of a fresh PO token"
              >
                <i
                  class={`ph-bold ${loadingPoToken() ? "ph-spinner spinIcon" : "ph-arrows-clockwise"}`}
                ></i>
                {loadingPoToken() ? "Extracting..." : "Refresh Token"}
              </button>
              <Show when={poStatus()?.active}>
                <button
                  onClick={handleClearToken}
                  class="command-btn danger"
                  title="Clear saved PO token from disk"
                >
                  <i class="ph-bold ph-trash"></i>
                  Clear
                </button>
              </Show>
            </div>
          </div>

          <div
            style="display: flex; gap: 8px; align-items: center; background: var(--secondary-background); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);"
          >
            <i
              class="ph ph-key"
              style="color: var(--accent-color); font-size: 1.1rem;"
            ></i>
            <input
              type="text"
              class="settings-input"
              style="flex: 1; background: transparent; border: none; outline: none; font-family: monospace; font-size: 0.85rem;"
              placeholder={
                poStatus()?.active
                  ? `Active token: ${poStatus()!.token.slice(0, 16)}... (${poStatus()!.token.length} chars)`
                  : "Paste manual PO Token (e.g. web.gvs / web.player token)..."
              }
              value={manualPoToken()}
              onInput={(e) => setManualPoToken(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveManualToken();
              }}
            />
            <button
              onClick={handleSaveManualToken}
              disabled={!manualPoToken().trim()}
              class="command-btn primary"
              style="padding: 6px 14px; font-size: 0.85rem;"
            >
              <i class="ph-bold ph-floppy-disk"></i> Save Token
            </button>
          </div>
        </div>
      </div>

      <h2 class="page-title page-title-spaced" id="sec-ai">
        <i class="ph-fill ph-brain"></i> AI Studio & Whisper Engine
      </h2>

      <div class="settings-card">
        {/* Engine Status & Deploy */}
        <div class="flex-row-between" id="setting-ai-engine-status">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h3 class="settings-title">Whisper Neural Engine</h3>
              <Show
                when={!loadingWhisperStatus()}
                fallback={
                  <span class="hw-badge hw-neutral" style="font-size: 0.75rem; padding: 2px 8px; opacity: 0.7;">
                    <i class="ph-bold ph-spinner spinIcon"></i> Checking...
                  </span>
                }
              >
                <Show
                  when={whisperStatus()?.binary_installed}
                  fallback={
                    <span class="hw-badge hw-neutral" style="font-size: 0.75rem; padding: 2px 8px; background: rgba(255, 159, 28, 0.2); color: #ff9f1c;">
                      <i class="ph-bold ph-warning"></i> Engine Missing
                    </span>
                  }
                >
                  <span class="hw-badge hw-pass" style="font-size: 0.75rem; padding: 2px 8px;">
                    <i class="ph-bold ph-check-circle"></i> Pure-Rust Engine Ready
                  </span>
                </Show>
              </Show>
            </div>
            <p class="settings-desc">
              Standalone Candle neural inference runtime. Computes syllable-level alignments and synchronized lyrics on local CPU with zero Python overhead.
            </p>
          </div>
          <button
            type="button"
            class="command-btn primary"
            disabled={isDeployingWhisper() || loadingWhisperStatus()}
            onClick={handleDeployWhisperEngine}
            style="min-width: 170px;"
          >
            <i class={`ph-bold ${isDeployingWhisper() || loadingWhisperStatus() ? "ph-spinner spinIcon" : "ph-download-simple"}`}></i>
            {isDeployingWhisper() ? (whisperDeployMsg() || "Deploying...") : (whisperStatus()?.binary_installed ? "Re-Deploy Engine" : "Install Engine")}
          </button>
        </div>

        <div class="full-divider"></div>

        {/* Compute Acceleration Device */}
        <div class="flex-row-between" id="setting-ai-compute-device">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h3 class="settings-title">Compute Acceleration Device</h3>
              <Show when={whisperStatus()?.system?.primary_gpu}>
                <span class="hw-badge hw-pass" style="font-size: 0.75rem; padding: 2px 8px;">
                  <i class="ph-bold ph-lightning"></i> {whisperStatus()?.system?.primary_gpu?.name}
                </span>
              </Show>
            </div>
            <p class="settings-desc">
              Target execution hardware for local speech recognition. Dedicated GPUs (Intel Arc, NVIDIA RTX, AMD Radeon) deliver fastest transcription throughput.
            </p>
          </div>
          <div style="min-width: 260px;">
            <select
              class="neo-select"
              value={whisperComputeDevice()}
              onChange={(e) => updateWhisperComputeDevice(e.currentTarget.value)}
              style="width: 100%; padding: 8px 12px; font-weight: 700; border-radius: 8px; border: 2px solid var(--border-color); background: rgba(0, 0, 0, 0.2); color: var(--text-color);"
            >
              <For each={whisperStatus()?.system?.compute_devices || []}>
                {(dev: any) => (
                  <option value={dev.id} style="background: #1e1e24; color: #fff;">
                    {dev.label}
                  </option>
                )}
              </For>
            </select>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Default Model */}
        <div class="flex-row-between" id="setting-ai-default-model">
          <div>
            <h3 class="settings-title">Default Whisper Model</h3>
            <p class="settings-desc">
              Select your default model size for lyrics transcription. Hardware diagnostic recommends: <strong>{whisperStatus()?.system?.recommended_default_model?.toUpperCase() || "BASE"}</strong>.
            </p>
          </div>
          <div class="speed-limit-presets" role="toolbar" aria-label="Default Whisper Model">
            <For each={["tiny", "base", "small", "medium", "large-v3"]}>
              {(m) => (
                <button
                  type="button"
                  class={`speed-preset-btn ${whisperDefaultModel() === m ? "active" : ""}`}
                  onClick={() => updateWhisperDefaultModel(m)}
                >
                  {m.toUpperCase()}
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Default Task Mode */}
        <div class="flex-row-between" id="setting-ai-default-task">
          <div>
            <h3 class="settings-title">Default Processing Task</h3>
            <p class="settings-desc">
              Transcribe retains the original song language. Translate automatically generates translated English subtitles and lyrics.
            </p>
          </div>
          <div class="speed-limit-presets" role="toolbar" aria-label="Default Task">
            <button
              type="button"
              class={`speed-preset-btn ${whisperDefaultTask() === "transcribe" ? "active" : ""}`}
              onClick={() => updateWhisperDefaultTask("transcribe")}
            >
              Transcribe (Original)
            </button>
            <button
              type="button"
              class={`speed-preset-btn ${whisperDefaultTask() === "translate" ? "active" : ""}`}
              onClick={() => updateWhisperDefaultTask("translate")}
            >
              Translate (English)
            </button>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Auto Link Lyrics to Player */}
        <div class="flex-row-between" id="setting-ai-autolink">
          <div>
            <h3 class="settings-title">Auto-Sync Lyrics with Media Player</h3>
            <p class="settings-desc">
              Automatically make generated .lrc lyric files available in the ViveStream player when playing corresponding tracks.
            </p>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={whisperAutoLinkLyrics()}
              onChange={() => toggleWhisperAutoLinkLyrics()}
              aria-label="Auto-Sync Lyrics with Media Player"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="full-divider"></div>

        {/* Storage Folders */}
        <div class="flex-row-between" id="setting-ai-folders">
          <div>
            <h3 class="settings-title">Whisper Storage & Directories</h3>
            <p class="settings-desc">
              Models are stored in <code>%USERPROFILE%\ViveStream\AI\Whisper</code> and lyrics in <code>%USERPROFILE%\ViveStream\Lyrics</code>.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button
              type="button"
              class="command-btn secondary"
              onClick={() => handleOpenFolder("models")}
            >
              <i class="ph-bold ph-folder-open"></i> Models Folder
            </button>
            <button
              type="button"
              class="command-btn secondary"
              onClick={() => handleOpenFolder("lyrics")}
            >
              <i class="ph-bold ph-file-text"></i> Lyrics Folder
            </button>
          </div>
        </div>

        <div class="full-divider"></div>

        {/* Pro Subscription Status */}
        <div class="flex-row-between" id="setting-ai-subscription">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 class="settings-title">Pro Subscription Tier</h3>
              <Show
                when={isAiUnlocked()}
                fallback={
                  <span class="hw-badge hw-neutral" style="font-size: 0.75rem; padding: 2px 8px; background: rgba(255, 159, 28, 0.2); color: #ff9f1c;">
                    <i class="ph-bold ph-lock-key"></i> Locked (Preview Mode)
                  </span>
                }
              >
                <span class="hw-badge hw-pass" style="font-size: 0.75rem; padding: 2px 8px;">
                  <i class="ph-bold ph-seal-check"></i> Pro Active (6-Month Plan)
                </span>
              </Show>
            </div>
            <p class="settings-desc">
              AI Studio features are licensed under the Business Source License (BSL-1.1). Subscriptions renew every 6 months via Lemon Squeezy.
            </p>
          </div>
          <div>
            <Show
              when={isAiUnlocked()}
              fallback={
                <button
                  type="button"
                  class="command-btn primary"
                  onClick={() => setIsAiUnlocked(true)}
                >
                  <i class="ph-bold ph-key"></i> Activate Pro License
                </button>
              }
            >
              <button
                type="button"
                class="command-btn secondary"
                onClick={() => {
                  invoke("deactivate_lemon_license").catch(() => {});
                  setIsAiUnlocked(false);
                  addToast("Pro access locked for testing.", "info");
                }}
              >
                <i class="ph-bold ph-lock"></i> Deactivate License
              </button>
            </Show>
          </div>
        </div>
      </div>

      <h2 class="page-title page-title-spaced" id="sec-diagnostics">
        <i class="ph-fill ph-gauge"></i> Performance & Diagnostics
      </h2>

      <div class="settings-card">
        <div class="flex-row-between" id="setting-ui-benchmark">
          <div>
            <h3 class="settings-title">UI Rendering Benchmark</h3>
            <p class="settings-desc">
              Run hardware-accelerated diagnostics to test frame pacing, 1% low
              FPS, and 150-card DOM rendering throughput.
            </p>
          </div>
          <button
            onClick={() => setShowBenchmark(true)}
            class="command-btn secondary"
          >
            <i class="ph-fill ph-lightning"></i>
            Run Benchmark
          </button>
        </div>

        <div class="full-divider"></div>

        {/* In-App Hardware Transcoding Probe & Testing */}
        <div class="hw-test-section" id="setting-hw-transcoding-probe">
          <div class="flex-row-between">
            <div>
              <h3 class="settings-title">
                Hardware Transcoding Probe & Diagnostics
              </h3>
              <p class="settings-desc">
                Probe host GPU encoders (Intel QuickSync, NVIDIA NVENC, AMD AMF, Linux VAAPI, Software CPU) by running real synthetic micro-benchmarks.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunHardwareTest}
              disabled={loadingHwTest()}
              class="command-btn secondary"
              style="min-width: 170px;"
            >
              <i
                class={`ph-fill ${loadingHwTest() ? "ph-spinner spinIcon" : "ph-cpu"}`}
              ></i>
              {loadingHwTest() ? "Probing Hardware..." : "Test Transcoding"}
            </button>
          </div>

          <div class="hw-advisory-box">
            <i class="ph-fill ph-info hw-advisory-icon"></i>
            <div class="hw-advisory-content">
              <strong>8K & 4K Media Memory Protection:</strong>
              <p>
                Downloaded YouTube videos are already encoded with Google's multi-million dollar AV1 encoder. Re-encoding an 8K video in H.264 allocates up to 16 GB of RAM for uncompressed lookahead frame buffers. ViveStream now defaults to <strong>Direct Stream Copy (Lossless Fast Remux)</strong>, which preserves 100% original quality and containerizes the file in ~0.5s using negligible RAM.
              </p>
            </div>
          </div>

          <Show when={hwReport()}>
            {(report) => (
              <div class="hw-report-container">
                <div class="hw-report-header">
                  <div class="hw-report-metric">
                    <span class="hw-metric-label">Operating System</span>
                    <span class="hw-metric-val">{report().os.toUpperCase()}</span>
                  </div>
                  <div class="hw-report-metric">
                    <span class="hw-metric-label">Direct Stream Copy</span>
                    <span class="hw-metric-val success">
                      <i class="ph-bold ph-check"></i> Active Default
                    </span>
                  </div>
                  <div class="hw-report-metric">
                    <span class="hw-metric-label">Recommended Fallback</span>
                    <span class="hw-metric-val primary">
                      {report().recommended_encoder}
                    </span>
                  </div>
                </div>

                <div class="hw-encoders-grid">
                  <For each={report().encoders}>
                    {(enc) => (
                      <div
                        class={`hw-encoder-card ${enc.supported ? "supported" : "unsupported"}`}
                      >
                        <div class="hw-card-top">
                          <span class="hw-vendor-tag">{enc.vendor}</span>
                          <span
                            class={`hw-status-pill ${enc.supported ? "pass" : "fail"}`}
                          >
                            <i
                              class={`ph-bold ${enc.supported ? "ph-check-circle" : "ph-x-circle"}`}
                            ></i>
                            {enc.supported ? "Operational" : "Unavailable"}
                          </span>
                        </div>
                        <h4 class="hw-encoder-name">{enc.name}</h4>
                        <div class="hw-card-meta">
                          <Show when={enc.speed_fps}>
                            <span class="hw-speed-badge">
                              <i class="ph-bold ph-gauge"></i> ~{enc.speed_fps}{" "}
                              FPS
                            </span>
                          </Show>
                          <span class="hw-card-note">{enc.note}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>

      <BenchmarkModal
        isOpen={showBenchmark()}
        onClose={() => setShowBenchmark(false)}
      />

      <h2
        class="page-title page-title-spaced page-title-danger"
        id="sec-danger"
      >
        <i class="ph-fill ph-warning-circle"></i> Danger Zone
      </h2>

      <div class="danger-card">
        <div class="flex-row-between" id="setting-danger-force-setup">
          <div>
            <h3 class="settings-title">Force Setup Screen</h3>
            <p class="settings-desc">
              Launch the deployment screen to test setup rendering without
              deleting existing files.
            </p>
          </div>
          <button
            onClick={() => setForceSetup(true)}
            class="command-btn secondary"
          >
            Launch Setup
          </button>
        </div>

        <div class="full-divider danger-divider"></div>

        <div class="flex-row-between" id="setting-danger-update-binaries">
          <div>
            <h3 class="settings-title">Update Core Engines</h3>
            <p class="settings-desc">
              Checks for, downloads, and overrides your current copies of
              `yt-dlp` and `ffmpeg` with their latest stable releases.
            </p>
          </div>
          <button
            onClick={handleUpdateBinaries}
            disabled={
              loadingUpdate() ||
              loadingDep() ||
              loadingClean() ||
              loadingNuclear() ||
              loadingReindex()
            }
            class="command-btn secondary"
          >
            <i
              class={`ph-fill ${loadingUpdate() ? "ph-spinner spinIcon" : "ph-arrow-clockwise"}`}
            ></i>
            {loadingUpdate() ? "Updating..." : "Update Engines"}
          </button>
        </div>

        <div class="full-divider danger-divider"></div>

        <div class="flex-row-between" id="setting-danger-wipe-dependencies">
          <div>
            <h3 class="settings-title">Wipe Core Engines</h3>
            <p class="settings-desc">
              Deletes `yt-dlp` and `ffmpeg` from your hidden app data.{" "}
              <strong>Does not delete videos.</strong>
            </p>
          </div>
          <button
            onClick={handleWipeDependencies}
            disabled={
              loadingDep() ||
              loadingUpdate() ||
              loadingClean() ||
              loadingNuclear() ||
              loadingReindex()
            }
            class="command-btn secondary"
          >
            {loadingDep() ? "Wiping..." : "Wipe Engines"}
          </button>
        </div>

        <div class="full-divider danger-divider"></div>

        <div class="flex-row-between" id="setting-danger-clean-database">
          <div>
            <h3 class="settings-title danger">Clean Database & Media</h3>
            <p class="settings-desc">
              Deletes all downloaded videos, audio, and clears the SQLite
              database. <strong>Keeps core engines intact.</strong>
            </p>
          </div>
          <button
            onClick={handleCleanDatabase}
            disabled={
              loadingClean() ||
              loadingUpdate() ||
              loadingDep() ||
              loadingNuclear() ||
              loadingReindex()
            }
            class="command-btn danger"
          >
            <i
              class={`ph-fill ${loadingClean() ? "ph-spinner spinIcon" : "ph-trash"}`}
            ></i>
            {loadingClean() ? "Cleaning..." : "Clean Data"}
          </button>
        </div>

        <div class="full-divider danger-divider"></div>

        <div class="flex-row-between" id="setting-danger-nuclear-wipe">
          <div>
            <h3 class="settings-title danger">
              Nuclear Wipe (Delete Everything)
            </h3>
            <p class="settings-desc">
              Permanently destroys the SQLite database, all core engines, and{" "}
              <strong>ALL gigabytes of downloaded video/audio</strong>.
            </p>
          </div>
          <button
            onClick={handleNuclearWipe}
            disabled={
              loadingNuclear() ||
              loadingUpdate() ||
              loadingClean() ||
              loadingDep() ||
              loadingReindex()
            }
            class="command-btn danger"
          >
            <i
              class={`ph-fill ${loadingNuclear() ? "ph-spinner spinIcon" : "ph-warning-circle"}`}
            ></i>
            {loadingNuclear() ? "Destroying..." : "Delete Media & Database"}
          </button>
        </div>
      </div>

      {/* ABOUT VIVESTREAM SECTION */}
      <h2 class="page-title page-title-spaced" id="sec-about">
        <i class="ph-fill ph-info"></i> About ViveStream
      </h2>

      <div class="settings-card about-app-card">
        <div class="about-hero-row">
          <div class="about-logo-badge">
            <svg
              width="48"
              height="48"
              viewBox="0 0 500 500"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="var(--primary-accent)"
                d="M83.333 0h333.334A83.333 83.333 0 0 1 500 83.333v333.334A83.333 83.333 0 0 1 416.667 500H83.333A83.333 83.333 0 0 1 0 416.667V83.333A83.333 83.333 0 0 1 83.333 0"
              />
              <path
                d="M95 125 L250 385 L405 125"
                stroke="#f1f1f1"
                stroke-width="30"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M100 125 Q110 125 118 85 Q126 45 134 125 Q142 175 150 125 Q158 75 166 125 Q174 25 182 125 Q190 215 198 125 Q206 55 214 125 Q222 195 230 125 Q238 35 246 125 Q254 235 262 125 Q270 45 278 125 Q286 205 294 125 Q302 65 310 125 Q318 175 326 125 Q334 85 342 125 Q350 225 358 125 Q366 55 374 125 Q382 165 390 125 Q398 105 405 125"
                stroke="#ffffff"
                stroke-width="6"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="about-hero-text">
            <div class="about-title-row">
              <h3 class="about-app-name">ViveStream Next</h3>
              <span class="about-version-badge">v{APP_VERSION}</span>
            </div>
            <p class="about-tagline">
              High-performance local video player, stream archiver & offline
              media suite.
            </p>
          </div>
        </div>

        <div class="about-features-grid">
          <div class="about-feature-item">
            <i class="ph-fill ph-lightning"></i>
            <div>
              <h4>Zero-VDOM Engine</h4>
              <p>
                Powered by SolidJS, Rust & Tauri v2 for 300+ FPS responsiveness.
              </p>
            </div>
          </div>
          <div class="about-feature-item">
            <i class="ph-fill ph-shield-check"></i>
            <div>
              <h4>100% Offline & Private</h4>
              <p>
                Local SQLite database. Zero telemetry, tracking, or remote
                analytics.
              </p>
            </div>
          </div>
          <div class="about-feature-item">
            <i class="ph-fill ph-paint-brush-broad"></i>
            <div>
              <h4>Tactile Neo-Brutalism</h4>
              <p>
                Crisp mechanical drop-shadows and dark/light claymorphism
                palettes.
              </p>
            </div>
          </div>
          <div class="about-feature-item">
            <i class="ph-fill ph-cpu"></i>
            <div>
              <h4>Hardware Transcoding</h4>
              <p>
                Automated integration with yt-dlp, FFmpeg (QSV/NVENC), and Deno.
              </p>
            </div>
          </div>
        </div>

        <div class="full-divider"></div>

        <div class="about-dev-section">
          <div class="about-dev-header">
            <i class="ph-fill ph-heart about-heart-icon"></i>
            <div>
              <h4 class="about-dev-title">Support ViveStream Development</h4>
              <p class="about-dev-desc">
                ViveStream is 100% free, privacy-first, and open source with no
                ads or subscriptions. If this app brings value to your daily
                media workflow, please consider supporting ongoing maintenance
                and new features with a small donation!
              </p>
            </div>
          </div>

          {/* Direct Financial Support Tiers */}
          <div class="about-donation-banner">
            <span class="donation-banner-label">
              <i class="ph-fill ph-sparkle"></i> Fund The Project
            </span>
            <div
              class="about-action-links donation-links"
              role="toolbar"
              aria-label="Financial Support options"
            >
              <button
                type="button"
                class="about-link-btn bmac-btn"
                onClick={() =>
                  openExternalLink("https://buymeacoffee.com/Vivek_N_007")
                }
                title="Buy Me a Coffee"
              >
                <i class="ph-fill ph-coffee"></i>
                <span>Buy Me a Coffee</span>
              </button>
              <button
                type="button"
                class="about-link-btn sponsors-btn"
                onClick={() =>
                  openExternalLink("https://github.com/sponsors/rootlocalghost")
                }
                title="Sponsor on GitHub"
              >
                <i class="ph-fill ph-heart"></i>
                <span>GitHub Sponsors</span>
              </button>
              <button
                type="button"
                class="about-link-btn kofi-btn"
                onClick={() =>
                  openExternalLink("https://ko-fi.com/Vivek_N_007")
                }
                title="Donate via Ko-fi"
              >
                <i class="ph-fill ph-hand-heart"></i>
                <span>Ko-fi Tip</span>
              </button>
            </div>
          </div>

          <div class="full-divider"></div>

          {/* Open Source Community Actions */}
          <div
            class="about-action-links"
            role="toolbar"
            aria-label="Community project links"
          >
            <button
              type="button"
              class="about-link-btn github-star-btn"
              onClick={() =>
                openExternalLink(
                  "https://github.com/rootlocalghost/ViveStream-Next",
                )
              }
              title="Star on GitHub"
            >
              <i class="ph-fill ph-star"></i>
              <span>Star on GitHub</span>
            </button>
            <button
              type="button"
              class="about-link-btn"
              onClick={() =>
                openExternalLink(
                  "https://github.com/rootlocalghost/ViveStream-Next/issues",
                )
              }
              title="Report an issue or feature request"
            >
              <i class="ph-fill ph-bug"></i>
              <span>Report Issue</span>
            </button>
            <button
              type="button"
              class="about-link-btn"
              onClick={() =>
                openExternalLink(
                  "https://github.com/rootlocalghost/ViveStream-Next/pulls",
                )
              }
              title="Contribute pull requests"
            >
              <i class="ph-fill ph-git-pull-request"></i>
              <span>Contribute</span>
            </button>
          </div>
        </div>

        <div class="about-footer-row">
          <span>License: Business Source License 1.1 (BSL-1.1) — AI Pro Subscription</span>
          <span>ViveStream-Next © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}
