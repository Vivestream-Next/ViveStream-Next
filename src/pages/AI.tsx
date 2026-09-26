import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { VideoEntry, isAiUnlocked, setIsAiUnlocked, addToast } from "../store";
import AiPaywall from "../components/AiPaywall";
import "./AI.css";

interface ModelInfo {
  name: string;
  expected_size_mb: number;
  installed: boolean;
  path?: string;
  download_url?: string;
}

interface SystemScan {
  cpu_brand?: string;
  cpu_cores?: number;
  total_ram_gb?: number;
  available_ram_gb?: number;
  recommended_default_model?: string;
  model_recommendations?: Array<{
    model: string;
    performance: string;
    can_run: boolean;
    min_ram_gb: number;
    recommended_ram_gb: number;
    note: string;
  }>;
}

interface WhisperStatus {
  binary_installed: boolean;
  binary_path: string;
  models_dir: string;
  system?: SystemScan;
  models?: ModelInfo[];
}

interface LyricsResult {
  duration: number;
  language: string;
  text: string;
  lrc: string;
  enhanced_lrc: string;
  srt: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    words: Array<{
      word: string;
      start: number;
      end: number;
      probability: number;
    }>;
  }>;
}

export default function AI() {
  const [status, setStatus] = createSignal<WhisperStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal(true);
  const [libraryVideos, setLibraryVideos] = createSignal<VideoEntry[]>([]);
  const [isPreviewMode, setIsPreviewMode] = createSignal(false);

  // Generation Form State
  const [selectedVideoId, setSelectedVideoId] = createSignal<string>("");
  const [customAudioPath, setCustomAudioPath] = createSignal<string>("");
  const [selectedModel, setSelectedModel] = createSignal<string>("base");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [genStatusMsg, setGenStatusMsg] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal("");

  // Model Download State
  const [downloadingModel, setDownloadingModel] = createSignal<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = createSignal<number>(0);
  const [downloadSpeedMb, setDownloadSpeedMb] = createSignal<string>("");

  // Generated Results & Tab State
  const [result, setResult] = createSignal<LyricsResult | null>(null);
  const [activeTab, setActiveTab] = createSignal<"karaoke" | "lrc" | "elrc" | "srt" | "json">("karaoke");
  const [copied, setCopied] = createSignal(false);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await invoke<WhisperStatus>("check_whisper_status");
      setStatus(res);
      if (res.system?.recommended_default_model) {
        setSelectedModel(res.system.recommended_default_model);
      }
    } catch (e: any) {
      console.error("Failed to check whisper status:", e);
      setErrorMsg(String(e));
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchLibrary = async () => {
    try {
      const vids = await invoke<VideoEntry[]>("get_downloaded_videos");
      setLibraryVideos(vids);
    } catch (e) {
      console.error("Failed to load library tracks:", e);
    }
  };

  onMount(() => {
    fetchStatus();
    fetchLibrary();

    // Listen for model download progress
    listen<{ model: string; percentage: number; downloaded_mb: number; total_mb: number }>(
      "whisper-model-progress",
      (event) => {
        setDownloadingModel(event.payload.model);
        setDownloadPercentage(event.payload.percentage);
        setDownloadSpeedMb(`${event.payload.downloaded_mb} / ${event.payload.total_mb} MB`);
      }
    );
  });

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
      await invoke("download_whisper_model", { modelName });
      setDownloadingModel(null);
      await fetchStatus();
    } catch (e: any) {
      setErrorMsg(`Failed to download ${modelName}: ${e}`);
      setDownloadingModel(null);
    }
  };

  const handleBrowseLocalFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio/Video",
            extensions: ["mp3", "flac", "wav", "m4a", "aac", "ogg", "mp4", "mkv", "webm"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        setCustomAudioPath(selected);
        setSelectedVideoId("");
      }
    } catch (e) {
      console.error("File browse cancelled/failed", e);
    }
  };

  const getAudioPathToRun = () => {
    if (customAudioPath()) return customAudioPath();
    const vid = libraryVideos().find((v) => v.id === selectedVideoId());
    if (vid) return vid.video_path;
    return "";
  };

  const handleGenerate = async () => {
    if (!isAiUnlocked()) {
      addToast("AI Studio features are locked. A 6-month Pro subscription is required.", "error");
      setIsPreviewMode(false);
      return;
    }

    const targetPath = getAudioPathToRun();
    if (!targetPath) {
      setErrorMsg("Please select a video from your library or browse for a local audio file.");
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMsg("");
      setGenStatusMsg(`Generating synced lyrics with Whisper ${selectedModel()}...`);

      const res = await invoke<LyricsResult>("generate_track_lyrics", {
        audioPath: targetPath,
        model: selectedModel(),
      });

      setResult(res);
      setGenStatusMsg("Lyrics successfully generated!");
    } catch (e: any) {
      setErrorMsg(String(e));
      setGenStatusMsg("");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCurrentText = () => {
    const res = result();
    if (!res) return;
    let text = "";
    if (activeTab() === "lrc") text = res.lrc;
    else if (activeTab() === "elrc") text = res.enhanced_lrc;
    else if (activeTab() === "srt") text = res.srt;
    else if (activeTab() === "json") text = JSON.stringify(res, null, 2);
    else text = res.text;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Show
      when={isAiUnlocked() || isPreviewMode()}
      fallback={
        <AiPaywall
          onPreviewToggle={() => setIsPreviewMode(true)}
          isPreviewing={false}
        />
      }
    >
      <div class="ai-page-container">
        {/* Preview Mode Locked Banner */}
        <Show when={!isAiUnlocked()}>
          <div class="ai-preview-banner">
            <div class="ai-preview-banner-text">
              <i class="ph-fill ph-lock-key" />
              <span>
                AI Studio Preview Mode — Generation is locked behind the 6-Month Pro Subscription (Lemon Squeezy).
              </span>
            </div>
            <button
              type="button"
              class="ai-btn-sm"
              onClick={() => setIsPreviewMode(false)}
            >
              <i class="ph ph-shopping-cart-simple" /> View Paywall
            </button>
          </div>
        </Show>

        {/* Header */}
        <div class="ai-header">
          <div class="ai-title-wrap">
            <div class="ai-badge-row">
              <Show
                when={isAiUnlocked()}
                fallback={
                  <span class="ai-badge" style={{ background: "#ff9f1c", color: "#111" }}>
                    <i class="ph-fill ph-lock-key" /> Preview Mode
                  </span>
                }
              >
                <span class="ai-badge" style={{ background: "#2ec4b6", color: "#000" }}>
                  <i class="ph-fill ph-seal-check" /> Pro Active (6-Month Plan)
                </span>
              </Show>
              <span class="ai-badge">Pure Rust Native</span>
              <span class="ai-subtitle">Candle Engine // Zero Python Overhead</span>
              <Show when={isAiUnlocked()}>
                <button
                  type="button"
                  class="ai-btn-sm"
                  style={{ "margin-left": "auto", "font-size": "11px", padding: "4px 8px" }}
                  onClick={() => {
                    setIsAiUnlocked(false);
                    setIsPreviewMode(false);
                    addToast("Pro access locked. Paywall active.", "info");
                  }}
                  title="Lock Pro access for testing"
                >
                  <i class="ph ph-lock" /> Lock Pro
                </button>
              </Show>
            </div>
            <h1 class="ai-title">AI Studio // Synced Lyrics & Subtitles</h1>
          </div>
        </div>

      {/* Show Global Error if any */}
      <Show when={errorMsg()}>
        <div
          class="ai-card"
          style={{ "border-color": "var(--primary-accent)", background: "rgba(231, 29, 54, 0.1)" }}
        >
          <div style={{ color: "var(--primary-accent)", "font-weight": "700" }}>{errorMsg()}</div>
        </div>
      </Show>

      {/* System Hardware & Status Section */}
      <div class="ai-grid-2">
        {/* Hardware Diagnostics Card */}
        <div class="ai-card">
          <div class="ai-card-header">
            <span class="ai-card-title">
              <i class="ph ph-cpu" /> System Hardware Diagnostic
            </span>
            <span
              class={`ai-status-pill ${
                loadingStatus()
                  ? "warning"
                  : status()?.binary_installed
                  ? "ready"
                  : "warning"
              }`}
            >
              {loadingStatus()
                ? "Scanning..."
                : status()?.binary_installed
                ? "Engine Ready"
                : "Setup Required"}
            </span>
          </div>

          <div class="ai-specs-list">
            <div class="ai-spec-item">
              <span class="ai-spec-label">Processor</span>
              <span class="ai-spec-val">
                {status()?.system?.cpu_brand || "Auto-detecting CPU..."}
              </span>
            </div>
            <div class="ai-spec-item">
              <span class="ai-spec-label">CPU Cores</span>
              <span class="ai-spec-val">
                {status()?.system?.cpu_cores ? `${status()?.system?.cpu_cores} threads` : "..."}
              </span>
            </div>
            <div class="ai-spec-item">
              <span class="ai-spec-label">Total System RAM</span>
              <span class="ai-spec-val">
                {status()?.system?.total_ram_gb
                  ? `${status()?.system?.total_ram_gb?.toFixed(1)} GB`
                  : "..."}
              </span>
            </div>
            <div class="ai-spec-item">
              <span class="ai-spec-label">Available Free RAM</span>
              <span class="ai-spec-val">
                {status()?.system?.available_ram_gb
                  ? `${status()?.system?.available_ram_gb?.toFixed(1)} GB`
                  : "..."}
              </span>
            </div>
            <div class="ai-spec-item">
              <span class="ai-spec-label">Recommended Model</span>
              <span class="ai-spec-val" style={{ color: "var(--primary-accent)" }}>
                {status()?.system?.recommended_default_model?.toUpperCase() || "BASE"}
              </span>
            </div>
          </div>
        </div>

        {/* Models Management Card */}
        <div class="ai-card">
          <div class="ai-card-header">
            <span class="ai-card-title">
              <i class="ph ph-database" /> Supported Whisper Models
            </span>
            <span class="ai-subtitle">On-Demand Downloads</span>
          </div>

          <div class="ai-models-list">
            <For each={status()?.models || []}>
              {(m) => (
                <div class="ai-model-row">
                  <div class="ai-model-info">
                    <div class="ai-model-name-row">
                      <span class="ai-model-name">{m.name.toUpperCase()}</span>
                      <span class="ai-model-tag">~{m.expected_size_mb} MB</span>
                    </div>
                    <span class="ai-model-desc">
                      {m.name === "base"
                        ? "Default balanced tier for music lyrics"
                        : m.name === "small"
                        ? "High accuracy multilingual transcription"
                        : m.name === "tiny"
                        ? "Ultra-lightweight fast tier"
                        : "High precision studio grade"}
                    </span>
                  </div>

                  <div>
                    <Show
                      when={!m.installed}
                      fallback={
                        <button class="ai-btn-sm installed" disabled>
                          <i class="ph ph-check" /> Installed
                        </button>
                      }
                    >
                      <button
                        class="ai-btn-sm"
                        disabled={downloadingModel() === m.name}
                        onClick={() => handleDownloadModel(m.name)}
                      >
                        {downloadingModel() === m.name ? (
                          <span>{downloadPercentage()}%</span>
                        ) : (
                          <span>
                            <i class="ph ph-download-simple" /> Get
                          </span>
                        )}
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>

            {/* Active Model Download Progress */}
            <Show when={downloadingModel()}>
              <div style={{ "margin-top": "8px" }}>
                <div style={{ display: "flex", "justify-content": "space-between", "font-size": "12px" }}>
                  <span>Downloading {downloadingModel()} model weights...</span>
                  <span>{downloadSpeedMb()}</span>
                </div>
                <div class="ai-progress-wrap">
                  <div
                    class="ai-progress-fill"
                    style={{ width: `${downloadPercentage()}%` }}
                  />
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Generation Studio Card */}
      <div class="ai-card">
        <div class="ai-card-header">
          <span class="ai-card-title">
            <i class="ph ph-waveform" /> Synchronized Lyrics & Subtitles Studio
          </span>
        </div>

        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
          {/* Source Selection */}
          <div class="ai-form-group">
            <label class="ai-form-label">Select Audio Source</label>
            <div style={{ display: "flex", gap: "12px", "align-items": "center" }}>
              <select
                class="ai-select"
                style={{ flex: 1 }}
                value={selectedVideoId()}
                onChange={(e) => {
                  setSelectedVideoId(e.currentTarget.value);
                  setCustomAudioPath("");
                }}
              >
                <option value="">-- Choose from ViveStream Library ({libraryVideos().length} tracks) --</option>
                <For each={libraryVideos()}>
                  {(v) => <option value={v.id}>{v.title} ({v.channel})</option>}
                </For>
              </select>

              <span style={{ "font-size": "12px", color: "var(--secondary-text)" }}>OR</span>

              <button class="ai-btn-sm" onClick={handleBrowseLocalFile}>
                <i class="ph ph-folder-open" /> Browse File...
              </button>
            </div>

            <Show when={customAudioPath()}>
              <div style={{ "font-size": "12px", color: "var(--primary-accent)", "font-weight": "700" }}>
                Custom File Selected: {customAudioPath()}
              </div>
            </Show>
          </div>

          {/* Model Selection */}
          <div class="ai-form-group">
            <label class="ai-form-label">Whisper Model Size</label>
            <div style={{ display: "flex", gap: "10px", "flex-wrap": "wrap" }}>
              <For each={status()?.models || []}>
                {(m) => (
                  <button
                    class={`ai-btn-sm ${selectedModel() === m.name ? "installed" : ""}`}
                    style={{
                      background: selectedModel() === m.name ? "var(--primary-accent)" : "rgba(0,0,0,0.2)",
                      color: selectedModel() === m.name ? "#fff" : "var(--text-color)",
                    }}
                    onClick={() => setSelectedModel(m.name)}
                  >
                    {m.name.toUpperCase()} {m.installed ? "✓" : ""}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Action Trigger */}
          <button
            class="ai-btn-primary"
            disabled={isGenerating() || (!selectedVideoId() && !customAudioPath())}
            onClick={!isAiUnlocked() ? () => setIsPreviewMode(false) : handleGenerate}
          >
            {isGenerating() ? (
              <>
                <i class="ph ph-spinner ph-spin" /> {genStatusMsg()}
              </>
            ) : !isAiUnlocked() ? (
              <>
                <i class="ph-bold ph-lock-simple" /> Unlock Pro to Generate (6-Month Subscription)
              </>
            ) : (
              <>
                <i class="ph ph-sparkle" /> Generate Synced Lyrics & Subtitles
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results & Interactive Karaoke Preview */}
      <Show when={result()}>
        <div class="ai-preview-card">
          <div class="ai-card-header">
            <span class="ai-card-title">
              <i class="ph ph-music-notes" /> Generated Lyrics & Karaoke Viewer
            </span>
            <button class="ai-btn-sm" onClick={copyCurrentText}>
              <i class="ph ph-copy" /> {copied() ? "Copied!" : "Copy Active Tab"}
            </button>
          </div>

          {/* Tabs */}
          <div class="ai-tabs-row">
            <button
              class={`ai-tab-btn ${activeTab() === "karaoke" ? "active" : ""}`}
              onClick={() => setActiveTab("karaoke")}
            >
              Karaoke View
            </button>
            <button
              class={`ai-tab-btn ${activeTab() === "lrc" ? "active" : ""}`}
              onClick={() => setActiveTab("lrc")}
            >
              Standard LRC
            </button>
            <button
              class={`ai-tab-btn ${activeTab() === "elrc" ? "active" : ""}`}
              onClick={() => setActiveTab("elrc")}
            >
              Enhanced Karaoke LRC
            </button>
            <button
              class={`ai-tab-btn ${activeTab() === "srt" ? "active" : ""}`}
              onClick={() => setActiveTab("srt")}
            >
              SRT Subtitles
            </button>
            <button
              class={`ai-tab-btn ${activeTab() === "json" ? "active" : ""}`}
              onClick={() => setActiveTab("json")}
            >
              JSON Data
            </button>
          </div>

          {/* Tab Content */}
          <Show when={activeTab() === "karaoke"}>
            <div class="ai-lyrics-box">
              <div class="karaoke-container">
                <For each={result()?.segments || []}>
                  {(seg) => (
                    <div class="karaoke-line active">
                      <For each={seg.words}>
                        {(w) => (
                          <span class="karaoke-word sung" title={`${w.start}s - ${w.end}s`}>
                            {w.word}
                          </span>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={activeTab() === "lrc"}>
            <div class="ai-lyrics-box">{result()?.lrc}</div>
          </Show>

          <Show when={activeTab() === "elrc"}>
            <div class="ai-lyrics-box">{result()?.enhanced_lrc}</div>
          </Show>

          <Show when={activeTab() === "srt"}>
            <div class="ai-lyrics-box">{result()?.srt}</div>
          </Show>

          <Show when={activeTab() === "json"}>
            <div class="ai-lyrics-box">
              {JSON.stringify(result(), null, 2)}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  </Show>
  );
}
