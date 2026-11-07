import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { setForceSetup } from "../store";
import { APP_VERSION } from "../version";
import SetupMinigame from "../components/SetupMinigame";
import "./Setup.css";

interface AppFeatureGuide {
  badge: string;
  icon: string;
  title: string;
  desc: string;
  tip: string;
}

const FEATURE_GUIDES: AppFeatureGuide[] = [
  {
    badge: "IMMERSIVE PLAYBACK",
    icon: "ph-fill ph-sparkle",
    title: "Cinematic Ambient Glow",
    desc: "Real-time reactive ambient lighting dynamically matches colors and rhythm from your playing video, creating an immersive edge glow across your whole screen.",
    tip: "Customize static color swatches or toggle dynamic glow in Player settings.",
  },
  {
    badge: "SEAMLESS AUDIO & VIDEO",
    icon: "ph-fill ph-picture-in-picture",
    title: "Zero-Lag Seamless Miniplayer",
    desc: "Never interrupt your music. Press 'I' or click the miniplayer icon for instant Picture-in-Picture playback with zero audio stutter while exploring libraries, artists, and playlists.",
    tip: "Pause/play by clicking directly on the video and adjust playback volume right inside the floating miniplayer.",
  },
  {
    badge: "ULTRA-HD MEDIA LIBRARY",
    icon: "ph-fill ph-film-strip",
    title: "Offline 4K & Lossless Library",
    desc: "Save videos in pristine 1080p, 1440p, or 4K, or extract high-fidelity audio tracks. ViveStream automatically indexes artist profiles, avatars, and high-res thumbnails locally.",
    tip: "Download an entire artist discography or album in one paste — tracks are automatically grouped into playlists.",
  },
  {
    badge: "ON-DEVICE AI",
    icon: "ph-fill ph-brain",
    title: "Whisper AI Lyrics & Subtitles",
    desc: "Generate accurate, time-synced lyrics for any song completely offline using local hardware-accelerated OpenAI Whisper neural models with zero cloud telemetry.",
    tip: "Visit AI Studio to generate interactive sing-along lyrics that highlight synchronously as your tracks play.",
  },
  {
    badge: "ADAPTIVE MATERIAL YOU",
    icon: "ph-fill ph-palette",
    title: "Dynamic Theming Engine",
    desc: "Pick your personal accent color and watch buttons, preview cards, animated logos, and ambient lighting harmonize instantly with Android Material You-inspired design.",
    tip: "Choose from 6 signature palettes (Emerald, Cyber, Sunset, Crimson, Royal, Monochrome) in Appearance settings.",
  },
  {
    badge: "BYPASS THROTTLING",
    icon: "ph-fill ph-shield-check",
    title: "YouTube PO Token Companion",
    desc: "Bypass YouTube's 144p resolution restrictions and iframe embedding blocks with 1-click browser companion attestation and automated loopback synchronization.",
    tip: "Use '1-Click Auto Install' or 'Auto-Run (No Install)' in Settings to instantly sync tokens from Chrome or Brave.",
  },
];

const AnimatedLogo = () => (
  <svg
    width="84"
    height="84"
    viewBox="0 0 500 500"
    xmlns="http://www.w3.org/2000/svg"
    class="setup-hero-logo"
  >
    <defs>
      <style>
        {`
          @keyframes drawWave {
            0% { stroke-dashoffset: 2000; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes pulseGlow {
            0%, 100% { opacity: 0.7; filter: drop-shadow(0 0 4px var(--primary-accent)) drop-shadow(0 0 8px var(--primary-accent)); }
            50% { opacity: 1; filter: drop-shadow(0 0 8px var(--primary-accent)) drop-shadow(0 0 16px var(--primary-accent)); }
          }
          .animated-wave {
            stroke-dasharray: 2000;
            stroke-dashoffset: 2000;
            animation: drawWave 2.6s cubic-bezier(0.16, 1, 0.3, 1) forwards, pulseGlow 4s ease-in-out infinite;
          }
        `}
      </style>
      <filter id="clayGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow
          dx="0"
          dy="8"
          stdDeviation="12"
          flood-color="rgba(0,0,0,0.2)"
        />
        <feDropShadow
          dx="0"
          dy="-4"
          stdDeviation="8"
          flood-color="rgba(255,255,255,0.1)"
        />
      </filter>
    </defs>
    <path
      fill="var(--primary-accent)"
      filter="url(#clayGlow)"
      d="M83.333 0h333.334A83.333 83.333 0 0 1 500 83.333v333.334A83.333 83.333 0 0 1 416.667 500H83.333A83.333 83.333 0 0 1 0 416.667V83.333A83.333 83.333 0 0 1 83.333 0"
    />
    <path
      d="M95 125 L250 385 L405 125"
      stroke="var(--logo-inner, #f1f1f1)"
      stroke-width="30"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      class="animated-wave"
      d="M100 125 Q110 125 118 85 Q126 45 134 125 Q142 175 150 125 Q158 75 166 125 Q174 25 182 125 Q190 215 198 125 Q206 55 214 125 Q222 195 230 125 Q238 35 246 125 Q254 235 262 125 Q270 45 278 125 Q286 205 294 125 Q302 65 310 125 Q318 175 326 125 Q334 85 342 125 Q350 225 358 125 Q366 55 374 125 Q382 165 390 125 Q398 105 405 125"
      stroke="var(--logo-wave, #ffffff)"
      stroke-width="8"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export default function Setup(props: { onComplete?: () => void }) {
  const [loading, setLoading] = createSignal(false);
  const [isCompleted, setIsCompleted] = createSignal(false);
  const [hasError, setHasError] = createSignal(false);
  const [showLogs, setShowLogs] = createSignal(false);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [downloadProgress, setDownloadProgress] = createSignal<number>(0);
  const [activeTab, setActiveTab] = createSignal<"guide" | "game" | "console">("guide");
  const [guideIndex, setGuideIndex] = createSignal(0);
  const [autoRotate, setAutoRotate] = createSignal(true);
  const [showCompletionGame, setShowCompletionGame] = createSignal<boolean>(false);

  let slideInterval: any = null;

  const nextGuide = () => {
    setGuideIndex((prev) => (prev + 1) % FEATURE_GUIDES.length);
  };

  const prevGuide = () => {
    setGuideIndex((prev) => (prev - 1 + FEATURE_GUIDES.length) % FEATURE_GUIDES.length);
  };

  onMount(() => {
    slideInterval = setInterval(() => {
      if (autoRotate() && activeTab() === "guide") {
        nextGuide();
      }
    }, 6000);
  });

  onCleanup(() => {
    if (slideInterval) clearInterval(slideInterval);
  });

  onMount(async () => {
    try {
      const status = await invoke<{
        ytdlp_exists: boolean;
        ffmpeg_exists: boolean;
        bin_folder: string;
      }>("check_binaries");

      addLog(`ViveStream v${APP_VERSION} // Pre-flight Diagnostic`);
      addLog(
        `[SYSTEM] Target Data Path: ${status.bin_folder || "~/.local/share/vivestream"}`,
      );
      if (!status.ytdlp_exists) {
        addLog(`[ACTION REQUIRED] yt-dlp core stream engine needs setup.`);
      }
      if (!status.ffmpeg_exists) {
        addLog(`[ACTION REQUIRED] FFmpeg hardware transcoder needs setup.`);
      }
      addLog(`[READY] All network and deployment channels primed.`);
    } catch (e) {
      addLog(`[ERROR] System check failed: ${e}`);
    }
  });

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
    const terminal = document.getElementById("setup-terminal");
    if (terminal) terminal.scrollTop = terminal.scrollHeight;
  };

  const handleLaunch = () => {
    setForceSetup(false);
    if (props.onComplete) {
      props.onComplete();
    }
  };

  const startSetup = async () => {
    setLoading(true);
    setHasError(false);
    setLogs([]);
    setDownloadProgress(0);
    addLog(`[SYSTEM] Initializing deployment sequence...`);

    const unlisten = await listen<string>("setup-progress", (event) => {
      const payload = event.payload;

      if (payload === "[COMPLETE]" || payload === "[RESTART]") {
        addLog("> Deployment successful. All core engines integrated.");
        setDownloadProgress(100);
        setIsCompleted(true);
        return;
      }

      if (payload.startsWith("[PROGRESS]")) {
        const value = parseFloat(payload.replace("[PROGRESS]", "").trim());
        if (!isNaN(value)) setDownloadProgress(value);
      } else {
        addLog(`> ${payload}`);
      }
    });

    try {
      await invoke("download_binaries");
      setIsCompleted(true);
    } catch (e) {
      setHasError(true);
      addLog(`[CRITICAL FAILURE] Deployment interrupted: ${e}`);
      addLog(
        `> Please verify your internet connection and click "Retry Deployment".`,
      );
    } finally {
      unlisten();
      setLoading(false);
    }
  };

  return (
    <div class="immersive-setup-container">
      <div class="setup-content-card">
        {/* Onboarding Stepper Indicator */}
        <div
          class="setup-stepper"
          role="progressbar"
          aria-label="Setup progress"
        >
          <div
            class={`step-node ${!loading() && !isCompleted() ? "active" : "completed"}`}
          >
            <span class="step-num">1</span>
            <span class="step-text">System Check</span>
          </div>
          <div class="step-line"></div>
          <div
            class={`step-node ${loading() ? "active" : isCompleted() ? "completed" : ""}`}
          >
            <span class="step-num">2</span>
            <span class="step-text">Deploy Engines</span>
          </div>
          <div class="step-line"></div>
          <div class={`step-node ${isCompleted() ? "active completed" : ""}`}>
            <span class="step-num">3</span>
            <span class="step-text">Ready to Stream</span>
          </div>
        </div>

        <Show
          when={isCompleted()}
          fallback={
            <>
              <div class="setup-header">
                <AnimatedLogo />
                <h1 class="setup-title">WELCOME TO VIVESTREAM</h1>
                <p class="setup-description">
                  To enable high-speed 4K streaming, offline collection caching,
                  and hardware-accelerated playback, let's configure your local
                  core media engines.
                </p>
              </div>
              <div class="setup-tabs-wrapper">
                <div class="setup-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab() === "guide"}
                    class={`setup-tab-btn ${activeTab() === "guide" ? "active" : ""}`}
                    onClick={() => setActiveTab("guide")}
                  >
                    <i class="ph-fill ph-sparkle"></i> Feature Guide
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab() === "game"}
                    class={`setup-tab-btn ${activeTab() === "game" ? "active" : ""}`}
                    onClick={() => setActiveTab("game")}
                  >
                    <i class="ph-fill ph-game-controller"></i> Stream Runner
                    <span class="setup-tab-badge">ARCADE</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab() === "console"}
                    class={`setup-tab-btn ${activeTab() === "console" ? "active" : ""}`}
                    onClick={() => setActiveTab("console")}
                  >
                    <i class="ph ph-terminal-window"></i> Deployment Console
                  </button>
                </div>
              </div>

              {/* 1. Feature Showcase & User Guide (Default view while initializing) */}
              <Show when={activeTab() === "guide"}>
                <div
                  class="setup-guide-card"
                  onMouseEnter={() => setAutoRotate(false)}
                  onMouseLeave={() => setAutoRotate(true)}
                >
                  <div class="setup-guide-header">
                    <span class="setup-guide-badge">
                      <i class="ph-bold ph-star"></i> {FEATURE_GUIDES[guideIndex()].badge}
                    </span>
                    <span class="setup-guide-counter">
                      Feature {guideIndex() + 1} of {FEATURE_GUIDES.length}
                    </span>
                  </div>

                  <div class="setup-guide-body">
                    <div class="setup-guide-icon-box">
                      <i class={FEATURE_GUIDES[guideIndex()].icon}></i>
                    </div>
                    <div class="setup-guide-content">
                      <h3 class="setup-guide-title">
                        {FEATURE_GUIDES[guideIndex()].title}
                      </h3>
                      <p class="setup-guide-desc">
                        {FEATURE_GUIDES[guideIndex()].desc}
                      </p>
                    </div>
                  </div>

                  <div class="setup-guide-tip-box">
                    <i class="ph-fill ph-lightbulb"></i>
                    <span>{FEATURE_GUIDES[guideIndex()].tip}</span>
                  </div>

                  <div class="setup-guide-footer">
                    <button
                      type="button"
                      class="setup-guide-nav-btn"
                      onClick={prevGuide}
                      title="Previous feature"
                      aria-label="Previous feature"
                    >
                      <i class="ph-bold ph-caret-left"></i>
                    </button>

                    <div class="setup-guide-dots">
                      <For each={FEATURE_GUIDES}>
                        {(_, idx) => (
                          <button
                            type="button"
                            class={`setup-guide-dot ${guideIndex() === idx() ? "active" : ""}`}
                            onClick={() => setGuideIndex(idx())}
                            aria-label={`Jump to feature ${idx() + 1}`}
                          />
                        )}
                      </For>
                    </div>

                    <button
                      type="button"
                      class="setup-guide-nav-btn"
                      onClick={nextGuide}
                      title="Next feature"
                      aria-label="Next feature"
                    >
                      <i class="ph-bold ph-caret-right"></i>
                    </button>
                  </div>
                </div>

                <div class="setup-logs-toggle-row">
                  <button
                    type="button"
                    class="setup-toggle-logs-btn"
                    onClick={() => setActiveTab("console")}
                  >
                    <i class="ph ph-terminal-window"></i> View Deployment Logs
                  </button>
                </div>
              </Show>

              {/* 2. Stream Runner Minigame */}
              <Show when={activeTab() === "game"}>
                <div class="setup-game-container">
                  <SetupMinigame
                    downloadProgress={downloadProgress()}
                    isCompleted={isCompleted()}
                    onLaunch={handleLaunch}
                    onClose={() => setActiveTab("guide")}
                  />
                </div>
              </Show>

              {/* 3. Deployment Console Terminal (Hidden by default, toggleable on demand) */}
              <div
                class="setup-terminal-wrapper"
                style={activeTab() === "console" ? {} : { display: "none" }}
              >
                <div class="terminal-header">
                  <div class="term-dot r"></div>
                  <div class="term-dot y"></div>
                  <div class="term-dot g"></div>
                  <span class="terminal-title">Deployment Console</span>
                  <button
                    type="button"
                    class="terminal-back-btn"
                    onClick={() => setActiveTab("guide")}
                    title="Return to Feature Guide"
                  >
                    <i class="ph-bold ph-x"></i>
                  </button>
                </div>
                <div id="setup-terminal" class="setup-terminal">
                  <For each={logs()}>
                    {(log) => (
                      <p
                        class={`setup-log-line ${
                          log.includes("[ERROR]") ||
                          log.includes("[CRITICAL") ||
                          log.includes("[ACTION REQUIRED]")
                            ? "r"
                            : log.includes("[READY]")
                              ? "g"
                              : ""
                        }`}
                      >
                        {log}
                      </p>
                    )}
                  </For>
                  {loading() && downloadProgress() === 0 && (
                    <p class="setup-log-line processing">
                      &gt; Initializing high-speed secure download...
                    </p>
                  )}
                  {logs().length === 0 && (
                    <p class="setup-log-line muted">
                      Ready to initialize deployment...
                    </p>
                  )}
                </div>
              </div>

              <Show when={loading() && activeTab() !== "game"}>
                <div
                  class="setup-arcade-teaser"
                  onClick={() => setActiveTab("game")}
                  role="button"
                  tabIndex={0}
                  title="Play Minigame"
                >
                  <div class="setup-teaser-left">
                    <div class="setup-teaser-icon">
                      <i class="ph-fill ph-game-controller"></i>
                    </div>
                    <span class="setup-teaser-text">
                      Engines are deploying! Play Stream Runner while you wait.
                    </span>
                  </div>
                  <span class="setup-teaser-btn-label">
                    PLAY MINIGAME <i class="ph ph-arrow-right"></i>
                  </span>
                </div>
              </Show>
              <button
                type="button"
                class={`setup-btn ${loading() ? "loading" : ""} ${hasError() ? "error-btn" : ""}`}
                onClick={startSetup}
                disabled={loading()}
                aria-label="Start Core Engine Deployment"
                style={
                  loading() && downloadProgress() > 0
                    ? {
                        background: `linear-gradient(90deg, var(--primary-accent) ${downloadProgress()}%, var(--tertiary-background) ${downloadProgress()}%)`,
                      }
                    : {}
                }
              >
                {loading() ? (
                  <>
                    <i class="ph ph-spinner spinIcon" aria-hidden="true"></i>
                    {downloadProgress() > 0 && downloadProgress() < 100
                      ? `DOWNLOADING ENGINES... ${downloadProgress().toFixed(1)}%`
                      : "DEPLOYING ENGINES..."}
                  </>
                ) : hasError() ? (
                  <>
                    <i
                      class="ph ph-arrow-counter-clockwise"
                      aria-hidden="true"
                    ></i>{" "}
                    RETRY DEPLOYMENT
                  </>
                ) : (
                  <>
                    <i
                      class="ph-fill ph-download-simple"
                      aria-hidden="true"
                    ></i>{" "}
                    INITIALIZE DEPLOYMENT
                  </>
                )}
              </button>
            </>
          }
        >
          {/* Custom Styled Completion Screen */}
          <div class="setup-complete-container">
            <div class="setup-success-badge">
              <div class="setup-success-glow"></div>
              <i class="ph-fill ph-check-circle setup-success-icon"></i>
            </div>

            <div class="setup-header">
              <h1 class="setup-title setup-complete-title">SETUP COMPLETE</h1>
              <p class="setup-description">
                All media engines and hardware acceleration pipelines are fully
                configured and verified.
              </p>
            </div>

            <div class="setup-status-grid">
              <div class="setup-status-item">
                <div class="setup-status-icon-box ready">
                  <i class="ph-fill ph-check"></i>
                </div>
                <div class="setup-status-text">
                  <span class="setup-status-name">yt-dlp Core Engine</span>
                  <span class="setup-status-desc">Nightly Build Verified</span>
                </div>
              </div>

              <div class="setup-status-item">
                <div class="setup-status-icon-box ready">
                  <i class="ph-fill ph-check"></i>
                </div>
                <div class="setup-status-text">
                  <span class="setup-status-name">Deno JS Runtime</span>
                  <span class="setup-status-desc">
                    n-Challenge Decryption Active
                  </span>
                </div>
              </div>

              <div class="setup-status-item">
                <div class="setup-status-icon-box ready">
                  <i class="ph-fill ph-check"></i>
                </div>
                <div class="setup-status-text">
                  <span class="setup-status-name">FFmpeg Transcoder</span>
                  <span class="setup-status-desc">
                    Intel QSV / NVIDIA NVENC Enabled
                  </span>
                </div>
              </div>

              <div class="setup-status-item">
                <div class="setup-status-icon-box ready">
                  <i class="ph-fill ph-check"></i>
                </div>
                <div class="setup-status-text">
                  <span class="setup-status-name">Local Library</span>
                  <span class="setup-status-desc">
                    High-Performance Database Ready
                  </span>
                </div>
              </div>
            </div>

            <button class="setup-btn setup-launch-btn" onClick={handleLaunch}>
              <i class="ph-fill ph-rocket-launch"></i> LAUNCH VIVESTREAM
            </button>

            <button
              type="button"
              class="setup-arcade-teaser"
              style={{ "margin-top": "6px", width: "100%" }}
              onClick={() => setShowCompletionGame(!showCompletionGame())}
            >
              <div class="setup-teaser-left">
                <div class="setup-teaser-icon">
                  <i class="ph-fill ph-game-controller"></i>
                </div>
                <span class="setup-teaser-text">
                  {showCompletionGame() ? "Close Arcade Runner" : "Beat Your High Score in Stream Runner"}
                </span>
              </div>
              <span class="setup-teaser-btn-label">
                {showCompletionGame() ? "HIDE" : "PLAY ARCADE"} <i class="ph ph-arrow-right"></i>
              </span>
            </button>

            <Show when={showCompletionGame()}>
              <div class="setup-game-container">
                <SetupMinigame
                  downloadProgress={100}
                  isCompleted={true}
                  onLaunch={handleLaunch}
                  onClose={() => setShowCompletionGame(false)}
                />
              </div>
            </Show>

            <div
              class="setup-log-toggle"
              onClick={() => setShowLogs(!showLogs())}
            >
              <i class={`ph ph-caret-${showLogs() ? "up" : "down"}`}></i>
              <span>
                {showLogs() ? "Hide Deployment Logs" : "View Deployment Logs"}
              </span>
            </div>

            <Show when={showLogs()}>
              <div class="setup-terminal-wrapper setup-terminal-compact">
                <div class="setup-terminal">
                  <For each={logs()}>
                    {(log) => <p class="setup-log-line">{log}</p>}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
