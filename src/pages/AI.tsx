import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isAiUnlocked,
  licenseData,
  checkLicenseStatus,
  addToast,
  whisperDefaultModel,
  setWhisperDefaultModel,
  whisperDefaultTask,
  setWhisperDefaultTask,
  whisperComputeDevice,
  updateWhisperComputeDevice,
  LiveHardwareUsage,
  SystemScan,
} from "../store";
import AiPaywall from "../components/AiPaywall";
import "./AI.css";

interface ModelInfo {
  name: string;
  expected_size_mb: number;
  installed: boolean;
  path?: string;
  download_url?: string;
}

interface WhisperStatus {
  binary_installed: boolean;
  binary_path: string;
  models_dir: string;
  system?: SystemScan;
  models?: ModelInfo[];
}

interface BenchmarkResult {
  success: boolean;
  model: string;
  device: string;
  audio_duration_sec: number;
  model_load_ms: number;
  inference_ms: number;
  real_time_factor: number;
  speedup: string;
}

export default function AI() {
  // Core AI Engine & Model State
  const [status, setStatus] = createSignal<WhisperStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal(true);
  const [isPreviewMode, setIsPreviewMode] = createSignal(false);
  const [isInstallingEngine, setIsInstallingEngine] = createSignal(false);
  const [engineSetupMsg, setEngineSetupMsg] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal("");
  const [copiedError, setCopiedError] = createSignal(false);

  // Model Downloader State
  const [downloadingModel, setDownloadingModel] = createSignal<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = createSignal(0);
  const [downloadSpeedMb, setDownloadSpeedMb] = createSignal("");

  // Diagnostics & Hardware Telemetry
  const [liveUsage, setLiveUsage] = createSignal<LiveHardwareUsage | null>(null);
  const [isBenchmarking, setIsBenchmarking] = createSignal(false);
  const [benchmarkResult, setBenchmarkResult] = createSignal<BenchmarkResult | null>(null);

  const hasInstalledModel = () => (status()?.models || []).some((m) => m.installed);
  const installedModelsCount = () => (status()?.models || []).filter((m) => m.installed).length;

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await invoke<WhisperStatus>("check_whisper_status");
      setStatus(res);

      const installedList = (res.models || []).filter((m) => m.installed);
      const currentDefault = whisperDefaultModel();
      const isCurrentInstalled = (res.models || []).some((m) => m.name === currentDefault && m.installed);
      if (!isCurrentInstalled && installedList.length > 0) {
        setWhisperDefaultModel(installedList[0].name);
      } else if (!currentDefault && res.system?.recommended_default_model) {
        setWhisperDefaultModel(res.system.recommended_default_model);
      }
    } catch (e: any) {
      console.error("Failed to check whisper status:", e);
      setErrorMsg(String(e));
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchLiveUsage = async () => {
    try {
      const usage = await invoke<LiveHardwareUsage>("get_live_hardware_usage");
      setLiveUsage(usage);
    } catch {}
  };

  onMount(() => {
    fetchStatus();
    fetchLiveUsage();
    const liveInterval = setInterval(fetchLiveUsage, 2000);

    const unlistenModel = listen<{
      model: string;
      percentage: number;
      downloaded_mb: number;
      total_mb: number;
    }>("whisper-model-progress", (event) => {
      setDownloadingModel(event.payload.model);
      setDownloadPercentage(event.payload.percentage);
      setDownloadSpeedMb(`${event.payload.downloaded_mb} / ${event.payload.total_mb} MB`);
    });

    const unlistenSetup = listen<string>("whisper-setup-progress", (event) => {
      setEngineSetupMsg(event.payload);
    });

    onCleanup(async () => {
      clearInterval(liveInterval);
      (await unlistenModel)();
      (await unlistenSetup)();
    });
  });

  const handleInstallEngine = async () => {
    if (!isAiUnlocked()) {
      addToast("Whisper Engine deployment is available to Pro users.", "error");
      setIsPreviewMode(false);
      return;
    }

    try {
      setIsInstallingEngine(true);
      setErrorMsg("");
      setEngineSetupMsg("Deploying Whisper engine binary...");
      await invoke("install_whisper_binary");
      addToast("Whisper engine deployed successfully!", "success");
      await fetchStatus();
    } catch (e: any) {
      console.error("Failed to deploy whisper binary:", e);
      setErrorMsg(String(e));
      addToast(`Engine deployment error: ${e}`, "error");
    } finally {
      setIsInstallingEngine(false);
      setEngineSetupMsg("");
    }
  };

  const handleDownloadModel = async (modelName: string) => {
    if (!isAiUnlocked()) {
      addToast("Model downloads are locked behind the 6-month Pro subscription.", "error");
      setIsPreviewMode(false);
      return;
    }

    try {
      setErrorMsg("");
      setDownloadingModel(modelName);
      setDownloadPercentage(0);
      setDownloadSpeedMb("Starting...");
      await invoke("download_whisper_model", { modelName });
      addToast(`Model ${modelName.toUpperCase()} installed successfully!`, "success");
      setWhisperDefaultModel(modelName);
      await fetchStatus();
    } catch (e: any) {
      console.error("Failed to download model:", e);
      setErrorMsg(String(e));
      addToast(`Download failed: ${e}`, "error");
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    if (!isAiUnlocked()) {
      addToast("Model management is locked behind the 6-Month Pro Subscription.", "error");
      setIsPreviewMode(false);
      return;
    }

    try {
      await invoke("delete_whisper_model", { modelName });
      addToast(`Model ${modelName.toUpperCase()} removed`, "info");
      await fetchStatus();
    } catch (e: any) {
      addToast(`Failed to delete model: ${e}`, "error");
    }
  };

  const handleRunBenchmark = async () => {
    if (!isAiUnlocked()) {
      addToast("Candle hardware benchmark is locked behind Pro license.", "error");
      setIsPreviewMode(false);
      return;
    }

    try {
      setIsBenchmarking(true);
      setErrorMsg("");
      const res = await invoke<BenchmarkResult>("run_whisper_benchmark", {
        model: whisperDefaultModel() || "base",
        device: whisperComputeDevice() || "auto",
      });
      setBenchmarkResult(res);
      addToast(
        `Benchmark completed: ${res.speedup} (${res.real_time_factor.toFixed(2)}x real-time speed)!`,
        "success",
      );
    } catch (e: any) {
      console.error("Benchmark failed:", e);
      setErrorMsg(String(e));
      addToast(`Benchmark error: ${e}`, "error");
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleOpenFolder = async (target: "models" | "lyrics") => {
    try {
      await invoke("open_whisper_folder", { target });
    } catch (e) {
      addToast(`Could not open folder: ${e}`, "error");
    }
  };

  const handleCopyError = () => {
    if (!errorMsg()) return;
    navigator.clipboard.writeText(errorMsg());
    setCopiedError(true);
    setTimeout(() => setCopiedError(false), 2000);
  };

  return (
    <Show
      when={isAiUnlocked() || isPreviewMode()}
      fallback={
        <AiPaywall
          onUnlocked={() => {
            fetchStatus();
          }}
          onPreview={() => setIsPreviewMode(true)}
        />
      }
    >
      <div class="ai-page-container">
        {/* AI Management Header */}
        <header class="ai-top-header">
          <div class="ai-header-left">
            <div class="ai-badge-row">
              <Show
                when={isAiUnlocked()}
                fallback={
                  <span class="ai-badge trial" onClick={() => setIsPreviewMode(false)}>
                    <i class="ph-bold ph-lock-key" /> Preview Mode • Activate Pro
                  </span>
                }
              >
                <span
                  class="ai-badge pro"
                  title={licenseData()?.customer_email ? `Customer: ${licenseData()!.customer_email}` : "6-Month Subscription"}
                >
                  <i class="ph-fill ph-seal-check" /> Pro Active ({licenseData()?.customer_email || "6-Month Plan"})
                </span>
              </Show>

              <span class="ai-badge dark">
                <i class="ph-bold ph-lightning" /> Pure Rust Candle Engine
              </span>

              <span class="ai-telemetry-pill">
                <span class="ai-led-dot active" />
                {status()?.system?.primary_gpu
                  ? `${status()!.system!.primary_gpu!.name.toUpperCase()} (${(status()!.system!.primary_gpu!.vram_total_mb / 1024).toFixed(0)}GB VRAM)`
                  : "CPU MULTI-THREAD"}
              </span>

              <span class="ai-telemetry-pill">
                <span class={`ai-led-dot ${status()?.binary_installed ? "active" : "warning"}`} />
                {status()?.binary_installed ? "ENGINE ONLINE" : "ENGINE MISSING"}
              </span>

              <span class="ai-telemetry-pill">
                <span class={`ai-led-dot ${hasInstalledModel() ? "active" : "neutral"}`} />
                {installedModelsCount()} MODELS MOUNTED
              </span>
            </div>

            <h1 class="ai-title">AI Engine & Model Hub</h1>
            <p class="ai-subtitle">
              Configure local neural speech models, inspect GPU/CPU acceleration, deploy binaries, and run benchmarks.
            </p>
          </div>

          <div class="ai-header-actions">
            <button
              type="button"
              class="ai-btn-secondary"
              onClick={() => handleOpenFolder("models")}
              title="Open models storage folder"
            >
              <i class="ph-bold ph-folder-open" /> Models Folder
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        <Show when={errorMsg()}>
          <div class="ai-alert-banner error" style={{ "user-select": "text", "-webkit-user-select": "text" }}>
            <i class="ph-fill ph-warning-circle" />
            <div class="ai-alert-content" style={{ "user-select": "text", "-webkit-user-select": "text" }}>
              <strong>Engine Alert:</strong> {errorMsg()}
            </div>
            <div class="ai-alert-actions">
              <button type="button" class="ai-btn-sm" onClick={handleCopyError}>
                <i class={`ph-bold ${copiedError() ? "ph-check" : "ph-copy"}`} />
                <span>{copiedError() ? "Copied" : "Copy Log"}</span>
              </button>
              <button type="button" class="ai-alert-close" onClick={() => setErrorMsg("")}>
                <i class="ph-bold ph-x" />
              </button>
            </div>
          </div>
        </Show>

        {/* Binary Engine Setup Notice if missing */}
        <Show when={!loadingStatus() && !status()?.binary_installed}>
          <div class="ai-setup-card">
            <div class="ai-setup-icon">
              <i class="ph-fill ph-cpu" />
            </div>
            <div class="ai-setup-content">
              <div class="ai-setup-step-tag">
                <i class="ph-bold ph-check" /> Step 1: Deploy Neural Engine Binary
              </div>
              <h2 class="ai-setup-title">Deploy ViveStream-Whisper Standalone Binary</h2>
              <p class="ai-setup-desc">
                Deploy the optimized native Rust binary directly into your local installation. No Python, no CUDA SDK, and no heavy runtime dependencies required.
              </p>
              <div class="ai-setup-actions">
                <button
                  type="button"
                  class="ai-btn-primary"
                  disabled={isInstallingEngine()}
                  onClick={handleInstallEngine}
                >
                  <Show
                    when={isInstallingEngine()}
                    fallback={
                      <>
                        <i class="ph-bold ph-download-simple" /> Deploy Engine Binary
                      </>
                    }
                  >
                    <i class="ph ph-spinner ph-spin" /> {engineSetupMsg() || "Deploying..."}
                  </Show>
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Active Engine & Compute Settings Bar */}
        <div class="ai-config-bar">
          <div class="ai-config-field">
            <label>Default Model:</label>
            <select
              value={whisperDefaultModel()}
              onChange={(e) => setWhisperDefaultModel(e.currentTarget.value)}
              class="ai-select"
            >
              <For each={status()?.models || []}>
                {(m) => (
                  <option value={m.name}>
                    {m.name.toUpperCase()} {m.installed ? "• [Installed]" : "• [Not downloaded]"}
                  </option>
                )}
              </For>
            </select>
          </div>

          <div class="ai-config-field">
            <label>Compute Acceleration Device:</label>
            <select
              value={whisperComputeDevice()}
              onChange={(e) => updateWhisperComputeDevice(e.currentTarget.value)}
              class="ai-select"
            >
              <option value="auto">Auto (Hardware Recommended)</option>
              <option value="gpu:0">
                GPU: {status()?.system?.primary_gpu?.name || "Discrete GPU"}
              </option>
              <option value="cpu">CPU (Multi-Threaded Rayon / AVX2)</option>
            </select>
          </div>

          <div class="ai-config-field">
            <label>Default Task:</label>
            <select
              value={whisperDefaultTask()}
              onChange={(e) => setWhisperDefaultTask(e.currentTarget.value)}
              class="ai-select"
            >
              <option value="transcribe">Transcribe (Original Language)</option>
              <option value="translate">Translate (Translate to English)</option>
            </select>
          </div>
        </div>

        {/* Models Management Grid */}
        <div class="ai-storage-summary-card">
          <div class="ai-storage-info">
            <i class="ph-fill ph-hard-drives" />
            <div>
              <h3 class="ai-storage-title">Whisper SafeTensors Neural Model Weights</h3>
              <p class="ai-storage-path">
                Installed directory: <code>{status()?.models_dir || "Loading..."}</code>
              </p>
            </div>
          </div>
        </div>

        <div class="ai-model-cards-grid">
          <For each={status()?.models || []}>
            {(m) => {
              const isRec = () =>
                status()?.system?.recommended_default_model?.toLowerCase() === m.name.toLowerCase();
              const isCurrent = () => whisperDefaultModel() === m.name;

              return (
                <div
                  class={`ai-repo-card ${m.installed ? "mounted" : ""} ${isRec() ? "recommended" : ""} ${isCurrent() ? "active-default" : ""}`}
                >
                  <div class="ai-repo-card-top">
                    <div class="ai-repo-title-wrap">
                      <span class="ai-repo-name">{m.name.toUpperCase()}</span>
                      <span class="ai-repo-tier">
                        {m.name === "tiny"
                          ? "Fastest Inference"
                          : m.name === "base"
                          ? "Balanced Music Tier"
                          : m.name === "small"
                          ? "Studio Accuracy"
                          : m.name === "medium"
                          ? "High Precision"
                          : "Maximum Studio"}
                      </span>
                    </div>
                    <div class="ai-badge-group">
                      <Show when={isCurrent()}>
                        <span class="ai-badge-active">ACTIVE DEFAULT</span>
                      </Show>
                      <Show when={isRec()}>
                        <span class="ai-badge-rec">RECOMMENDED</span>
                      </Show>
                    </div>
                  </div>

                  <div class="ai-repo-specs">
                    <div class="ai-spec-row">
                      <span class="spec-label">File Size:</span>
                      <span class="spec-val">~{m.expected_size_mb} MB</span>
                    </div>
                    <div class="ai-spec-row">
                      <span class="spec-label">Status:</span>
                      <span class={`spec-status ${m.installed ? "installed" : "missing"}`}>
                        {m.installed ? "Mounted & Verified" : "Not Downloaded"}
                      </span>
                    </div>
                  </div>

                  <div class="ai-repo-actions">
                    <Show
                      when={m.installed}
                      fallback={
                        <button
                          type="button"
                          class="ai-btn-download"
                          disabled={downloadingModel() !== null}
                          onClick={() => handleDownloadModel(m.name)}
                        >
                          <Show
                            when={downloadingModel() === m.name}
                            fallback={
                              <>
                                <i class="ph-bold ph-download-simple" /> Mount Model
                              </>
                            }
                          >
                            <i class="ph ph-spinner ph-spin" /> {downloadPercentage()}% ({downloadSpeedMb()})
                          </Show>
                        </button>
                      }
                    >
                      <div class="repo-mounted-actions">
                        <button
                          type="button"
                          class={`ai-btn-sm ${isCurrent() ? "active" : ""}`}
                          onClick={() => setWhisperDefaultModel(m.name)}
                          disabled={isCurrent()}
                        >
                          {isCurrent() ? "Default Model" : "Set as Default"}
                        </button>
                        <button
                          type="button"
                          class="ai-btn-danger-outline"
                          onClick={() => handleDeleteModel(m.name)}
                        >
                          <i class="ph-bold ph-trash" /> Remove
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        {/* Hardware & Diagnostics Suite */}
        <div class="ai-hw-workspace" style={{ "margin-top": "28px" }}>
          <div class="ai-telemetry-hero">
            <div class="ai-telemetry-hero-left">
              <span class="ai-badge dark">
                <i class="ph-bold ph-cpu" /> Pure Rust Candle Diagnostics
              </span>
              <h2>Neural Inference Hardware Telemetry & Benchmarking</h2>
              <p>Real-time telemetry showing detected compute capability, GPU VRAM, and memory load.</p>
            </div>

            <div class="ai-telemetry-hero-right">
              <button
                type="button"
                class="ai-btn-primary"
                disabled={isBenchmarking()}
                onClick={handleRunBenchmark}
              >
                <Show when={isBenchmarking()} fallback={<><i class="ph-bold ph-gauge" /> Run Hardware Benchmark</>}>
                  <i class="ph-bold ph-spinner animate-spin" /> Benchmarking Model...
                </Show>
              </button>
            </div>
          </div>

          <div class="ai-hw-grid">
            <div class="ai-hw-card">
              <div class="ai-hw-card-icon"><i class="ph-fill ph-cpu" /></div>
              <div class="ai-hw-card-info">
                <span class="hw-label">Host Processor</span>
                <strong class="hw-value">{status()?.system?.cpu_brand || "Multi-core CPU"}</strong>
                <span class="hw-sub">{status()?.system?.cpu_cores || 8} Logical Cores • Rayon Thread Pool</span>
              </div>
            </div>

            <div class="ai-hw-card">
              <div class="ai-hw-card-icon gpu"><i class="ph-fill ph-graphics-card" /></div>
              <div class="ai-hw-card-info">
                <span class="hw-label">Primary GPU</span>
                <strong class="hw-value">{status()?.system?.primary_gpu?.name || "Integrated Graphics"}</strong>
                <span class="hw-sub">
                  {status()?.system?.primary_gpu
                    ? `${(status()!.system!.primary_gpu!.vram_total_mb / 1024).toFixed(1)} GB VRAM • ${status()!.system!.primary_gpu!.compute_capability}`
                    : "CPU Fallback"}
                </span>
              </div>
            </div>

            <div class="ai-hw-card">
              <div class="ai-hw-card-icon memory"><i class="ph-fill ph-memory" /></div>
              <div class="ai-hw-card-info">
                <span class="hw-label">System Memory</span>
                <strong class="hw-value">
                  {status()?.system?.total_ram_gb ? `${status()!.system!.total_ram_gb.toFixed(1)} GB RAM` : "16.0 GB RAM"}
                </strong>
                <span class="hw-sub">
                  {liveUsage()?.ram_usage_percent ? `${liveUsage()!.ram_usage_percent}% Utilized` : "Telemetry Active"}
                </span>
              </div>
            </div>
          </div>

          <Show when={benchmarkResult()}>
            <div class="ai-benchmark-results-panel">
              <div class="benchmark-summary">
                <i class="ph-bold ph-check-circle" />
                <div>
                  <h4>Benchmark Complete for {benchmarkResult()?.model.toUpperCase()} ({benchmarkResult()?.device.toUpperCase()})</h4>
                  <p>
                    Audio Duration: {benchmarkResult()?.audio_duration_sec.toFixed(1)}s • Model Load: {benchmarkResult()?.model_load_ms}ms • Inference: {benchmarkResult()?.inference_ms}ms • Real-Time Factor: {benchmarkResult()?.real_time_factor.toFixed(2)}x ({benchmarkResult()?.speedup})
                  </p>
                </div>
              </div>
            </div>
          </Show>
        </div>

        {/* Future Extensible AI Suite Registry */}
        <div class="ai-future-suite" style={{ "margin-top": "36px" }}>
          <div class="future-suite-header">
            <h3><i class="ph-bold ph-cube" /> ViveStream AI Neural Ecosystem</h3>
            <p>Upcoming neural audio tools engineered for seamless on-device offline processing.</p>
          </div>
          <div class="future-cards-grid">
            <div class="future-ai-card">
              <div class="future-card-icon"><i class="ph-fill ph-waveform" /></div>
              <h4>Demucs Stem Separation</h4>
              <p>Separate songs into vocal, drums, bass, and instrumental stems with 4-track precision.</p>
              <span class="future-badge">IN DEVELOPMENT</span>
            </div>
            <div class="future-ai-card">
              <div class="future-card-icon"><i class="ph-fill ph-microphone-stage" /></div>
              <h4>Vocal Remover & Isolator</h4>
              <p>Instant 1-click studio-grade vocal removal for custom karaoke creation.</p>
              <span class="future-badge">PLANNED</span>
            </div>
            <div class="future-ai-card">
              <div class="future-card-icon"><i class="ph-fill ph-speaker-high" /></div>
              <h4>AI Audio Upscaler</h4>
              <p>Reconstruct high-frequency harmonics and clarify low-bitrate music tracks.</p>
              <span class="future-badge">RESEARCH</span>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
