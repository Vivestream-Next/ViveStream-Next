import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { setForceSetup } from "../store";
import { APP_VERSION } from "../version";
import SetupMinigame from "../components/SetupMinigame";
import "./Setup.css";

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
      stroke="#f1f1f1"
      stroke-width="30"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      class="animated-wave"
      d="M100 125 Q110 125 118 85 Q126 45 134 125 Q142 175 150 125 Q158 75 166 125 Q174 25 182 125 Q190 215 198 125 Q206 55 214 125 Q222 195 230 125 Q238 35 246 125 Q254 235 262 125 Q270 45 278 125 Q286 205 294 125 Q302 65 310 125 Q318 175 326 125 Q334 85 342 125 Q350 225 358 125 Q366 55 374 125 Q382 165 390 125 Q398 105 405 125"
      stroke="#ffffff"
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
  const [activeTab, setActiveTab] = createSignal<"console" | "game">("console");
  const [showCompletionGame, setShowCompletionGame] = createSignal<boolean>(false);

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
                    aria-selected={activeTab() === "console"}
                    class={`setup-tab-btn ${activeTab() === "console" ? "active" : ""}`}
                    onClick={() => setActiveTab("console")}
                  >
                    <i class="ph ph-terminal-window"></i> Deployment Console
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
                </div>
              </div>

              <Show when={activeTab() === "game"}>
                <div class="setup-game-container">
                  <SetupMinigame
                    downloadProgress={downloadProgress()}
                    isCompleted={isCompleted()}
                    onLaunch={handleLaunch}
                    onClose={() => setActiveTab("console")}
                  />
                </div>
              </Show>

              <div
                class="setup-terminal-wrapper"
                style={activeTab() === "game" ? { display: "none" } : {}}
              >
                <div class="terminal-header">
                  <div class="term-dot r"></div>
                  <div class="term-dot y"></div>
                  <div class="term-dot g"></div>
                  <span class="terminal-title">Deployment Console</span>
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

              <Show when={loading() && activeTab() === "console"}>
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
