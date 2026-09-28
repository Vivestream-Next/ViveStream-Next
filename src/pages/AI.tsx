import { createSignal, onMount, onCleanup, For, Show, createMemo } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VideoEntry,
  isAiUnlocked,
  addToast,
  whisperDefaultModel,
  whisperDefaultTask,
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

interface CachedLyricItem {
  filename: string;
  stem: string;
  ext: string;
  size_bytes: number;
  path: string;
}

export default function AI() {
  // Navigation Workspaces
  const [activeWorkspace, setActiveWorkspace] = createSignal<"studio" | "models" | "hardware">("studio");

  // Core Status & Data
  const [status, setStatus] = createSignal<WhisperStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal(true);
  const [libraryVideos, setLibraryVideos] = createSignal<VideoEntry[]>([]);
  const [cachedLyricsList, setCachedLyricsList] = createSignal<CachedLyricItem[]>([]);
  const [isPreviewMode, setIsPreviewMode] = createSignal(false);
  const [isInstallingEngine, setIsInstallingEngine] = createSignal(false);
  const [engineSetupMsg, setEngineSetupMsg] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal("");

  // Studio Form State
  const [sourceMode, setSourceMode] = createSignal<"library" | "custom">("library");
  const [trackSearchQuery, setTrackSearchQuery] = createSignal("");
  const [selectedVideoId, setSelectedVideoId] = createSignal<string>("");
  const [customAudioPath, setCustomAudioPath] = createSignal<string>("");
  const [selectedModel, setSelectedModel] = createSignal<string>(whisperDefaultModel() || "base");
  const [selectedTask, setSelectedTask] = createSignal<string>(whisperDefaultTask() || "transcribe");
  const [selectedLanguage, setSelectedLanguage] = createSignal<string>("auto");
  const [selectedDevice, setSelectedDevice] = createSignal<string>(whisperComputeDevice() || "auto");
  const [liveUsage, setLiveUsage] = createSignal<LiveHardwareUsage | null>(null);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [genStatusMsg, setGenStatusMsg] = createSignal("");

  // Model Download Manager State
  const [downloadingModel, setDownloadingModel] = createSignal<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = createSignal<number>(0);
  const [downloadSpeedMb, setDownloadSpeedMb] = createSignal<string>("");

  // Results & Output Studio
  const [result, setResult] = createSignal<LyricsResult | null>(null);
  const [activeTab, setActiveTab] = createSignal<"karaoke" | "lrc" | "elrc" | "srt" | "json">("karaoke");
  const [copied, setCopied] = createSignal(false);

  // Interactive Synchronized Audio Player State
  let audioRef: HTMLAudioElement | undefined;
  let lyricsScrollContainer: HTMLDivElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [playbackTime, setPlaybackTime] = createSignal(0);
  const [audioDuration, setAudioDuration] = createSignal(0);
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1.0);

  const hasInstalledModel = () => (status()?.models || []).some((m) => m.installed);
  const installedModelsCount = () => (status()?.models || []).filter((m) => m.installed).length;

  const filteredLibrary = createMemo(() => {
    const q = trackSearchQuery().toLowerCase().trim();
    if (!q) return libraryVideos();
    return libraryVideos().filter(
      (v) => v.title.toLowerCase().includes(q) || (v.channel && v.channel.toLowerCase().includes(q))
    );
  });

  const activeAudioPath = createMemo(() => {
    if (sourceMode() === "custom") return customAudioPath();
    const vid = libraryVideos().find((v) => v.id === selectedVideoId());
    return vid ? vid.video_path : "";
  });

  const activeAudioSrc = createMemo(() => {
    const p = activeAudioPath();
    if (!p) return "";
    try {
      return convertFileSrc(p);
    } catch {
      return "";
    }
  });

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await invoke<WhisperStatus>("check_whisper_status");
      setStatus(res);
      if (!selectedModel() && res.system?.recommended_default_model) {
        setSelectedModel(res.system.recommended_default_model);
      }
      if (selectedDevice() === "auto" && res.system?.recommended_device_id) {
        setSelectedDevice(res.system.recommended_device_id);
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
      const live = await invoke<LiveHardwareUsage>("get_live_hardware_usage");
      setLiveUsage(live);
    } catch {
      // silently ignore telemetry poll errors
    }
  };

  const fetchLibrary = async () => {
    try {
      const vids = await invoke<VideoEntry[]>("get_downloaded_videos");
      setLibraryVideos(vids);
      if (vids.length > 0 && !selectedVideoId()) {
        setSelectedVideoId(vids[0].id);
      }
    } catch (e) {
      console.error("Failed to load library tracks:", e);
    }
  };

  const fetchHistory = async () => {
    try {
      const history = await invoke<CachedLyricItem[]>("list_cached_lyrics_files");
      setCachedLyricsList(history);
    } catch (e) {
      console.error("Failed to load cached lyrics:", e);
    }
  };

  onMount(() => {
    fetchStatus();
    fetchLibrary();
    fetchHistory();
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
      setErrorMsg(`Failed to deploy Whisper engine: ${e}`);
      addToast("Failed to deploy Whisper engine", "error");
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
      setDownloadingModel(modelName);
      setDownloadPercentage(0);
      setDownloadSpeedMb("Starting download...");
      await invoke("download_whisper_model", { modelName });
      addToast(`Model ${modelName.toUpperCase()} installed successfully!`, "success");
      await fetchStatus();
    } catch (e: any) {
      console.error("Failed to download model:", e);
      addToast(`Download failed: ${e}`, "error");
    } finally {
      setDownloadingModel(null);
      setDownloadPercentage(0);
      setDownloadSpeedMb("");
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    try {
      await invoke("delete_whisper_model", { modelName });
      addToast(`Model ${modelName.toUpperCase()} removed`, "info");
      await fetchStatus();
    } catch (e: any) {
      addToast(`Failed to delete model: ${e}`, "error");
    }
  };

  const handleBrowseLocalFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio & Video Files",
            extensions: ["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "mp4", "mkv", "webm"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        setCustomAudioPath(selected);
        setSourceMode("custom");
      }
    } catch (e) {
      console.error("File browse cancelled/failed", e);
    }
  };

  const handleGenerate = async () => {
    if (!isAiUnlocked()) {
      setIsPreviewMode(false);
      return;
    }

    const path = activeAudioPath();
    if (!path) {
      addToast("Please choose an audio or video track to transcribe.", "error");
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMsg("");
      setGenStatusMsg(`Transcribing audio with Whisper ${selectedModel().toUpperCase()}...`);

      const res = await invoke<LyricsResult>("generate_track_lyrics", {
        audioPath: path,
        model: selectedModel(),
        task: selectedTask(),
        language: selectedLanguage() === "auto" ? null : selectedLanguage(),
        device: selectedDevice(),
      });

      setResult(res);
      addToast("Lyrics and subtitles generated successfully!", "success");
      await fetchHistory();

      // Reset audio player to start
      if (audioRef) {
        audioRef.currentTime = 0;
        setPlaybackTime(0);
      }
    } catch (e: any) {
      console.error("Transcription failed:", e);
      setErrorMsg(`Generation failed: ${e}`);
      addToast(`Generation failed: ${e}`, "error");
    } finally {
      setIsGenerating(false);
      setGenStatusMsg("");
    }
  };

  const handleLoadCachedLyrics = async (stem: string) => {
    try {
      const res = await invoke<any>("get_cached_lyrics", { trackTitle: stem });
      if (res.found) {
        setResult({
          duration: 0,
          language: "detected",
          text: res.lrc || res.enhanced_lrc || "",
          lrc: res.lrc || "",
          enhanced_lrc: res.enhanced_lrc || "",
          srt: res.srt || "",
          segments: [],
        });
        addToast(`Loaded cached lyrics for ${stem}`, "info");
      }
    } catch (e) {
      addToast(`Could not load cached lyrics: ${e}`, "error");
    }
  };

  const handleOpenFolder = async (target: "models" | "lyrics") => {
    try {
      await invoke("open_whisper_folder", { target });
    } catch (e) {
      addToast("Could not open directory", "error");
    }
  };

  const handleCopyResult = () => {
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
    addToast("Copied to clipboard!", "success");
  };

  // Interactive Player Helpers
  const togglePlayPause = () => {
    if (!audioRef) return;
    if (isPlaying()) {
      audioRef.pause();
      setIsPlaying(false);
    } else {
      audioRef.play().then(() => setIsPlaying(true)).catch((e) => console.error("Playback error:", e));
    }
  };

  const handleSeek = (newTime: number) => {
    if (!audioRef) return;
    audioRef.currentTime = newTime;
    setPlaybackTime(newTime);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef) audioRef.playbackRate = speed;
  };

  const formatTimestamp = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Show
      when={isAiUnlocked() || isPreviewMode()}
      fallback={<AiPaywall onPreviewToggle={() => setIsPreviewMode(true)} isPreviewing={false} />}
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
            <button type="button" class="ai-btn-sm" onClick={() => setIsPreviewMode(false)}>
              <i class="ph ph-shopping-cart-simple" /> View Paywall
            </button>
          </div>
        </Show>

        {/* Global Pro Header & Telemetry Strip */}
        <header class="ai-header">
          <div class="ai-header-left">
            <div class="ai-badge-row">
              <Show
                when={isAiUnlocked()}
                fallback={
                  <span class="ai-badge warning">
                    <i class="ph-fill ph-lock-key" /> Preview Mode
                  </span>
                }
              >
                <span class="ai-badge pro">
                  <i class="ph-fill ph-seal-check" /> Pro Active (6-Month License)
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

            <h1 class="ai-title">AI Studio // Synced Lyrics & Subtitles</h1>
            <p class="ai-subtitle">
              Local neural speech recognition • Syllable-level karaoke alignments • Zero Python overhead
            </p>
          </div>

          <div class="ai-header-actions">
            {/* 3 Pro Workspaces Switcher */}
            <div class="ai-nav-switcher" role="tablist">
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "studio" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("studio")}
              >
                <i class="ph ph-waveform" /> Generation Studio
              </button>
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "models" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("models")}
              >
                <i class="ph ph-database" /> Model Repository
              </button>
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "hardware" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("hardware")}
              >
                <i class="ph ph-cpu" /> Hardware Telemetry
              </button>
            </div>
          </div>
        </header>

        {/* Global Error Banner */}
        <Show when={errorMsg()}>
          <div class="ai-alert-banner error">
            <i class="ph-fill ph-warning-circle" />
            <div class="ai-alert-content">
              <strong>Engine Alert:</strong> {errorMsg()}
            </div>
            <button type="button" class="ai-btn-sm" onClick={() => setErrorMsg("")}>
              <i class="ph ph-x" />
            </button>
          </div>
        </Show>

        {/* Step 1 Setup Card if Engine Missing */}
        <Show when={!loadingStatus() && !status()?.binary_installed}>
          <div class="ai-setup-card">
            <div class="ai-setup-icon-box">
              <i class="ph-fill ph-cpu" />
            </div>
            <div class="ai-setup-content">
              <div class="ai-badge-row">
                <span class="ai-badge warning">
                  <i class="ph-bold ph-warning" /> Step 1: Engine Setup Required
                </span>
                <span class="ai-subtitle">Standalone Candle Inference Runtime</span>
              </div>
              <h2 class="ai-setup-title">Deploy Whisper Neural Engine</h2>
              <p class="ai-setup-desc">
                ViveStream AI Studio uses a standalone pure-Rust Candle inference binary to transcribe lyrics locally on your CPU and GPU. One-click setup automatically provisions the engine from verified releases.
              </p>
              <div class="ai-setup-actions">
                <button
                  type="button"
                  class="ai-btn-primary"
                  disabled={isInstallingEngine()}
                  onClick={handleInstallEngine}
                >
                  {isInstallingEngine() ? (
                    <>
                      <i class="ph ph-spinner ph-spin" /> {engineSetupMsg() || "Deploying Engine..."}
                    </>
                  ) : (
                    <>
                      <i class="ph-bold ph-download-simple" /> Install & Deploy Whisper Engine
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Step 2 Setup Card if Engine Ready but No Models */}
        <Show when={!loadingStatus() && status()?.binary_installed && !hasInstalledModel()}>
          <div class="ai-setup-card model-setup">
            <div class="ai-setup-icon-box pro">
              <i class="ph-fill ph-database" />
            </div>
            <div class="ai-setup-content">
              <div class="ai-badge-row">
                <span class="ai-badge pro">
                  <i class="ph-bold ph-check" /> Step 2: Download Model Weights
                </span>
                <span class="ai-subtitle">
                  Hardware Recommended: {status()?.system?.recommended_default_model?.toUpperCase() || "BASE"}
                </span>
              </div>
              <h2 class="ai-setup-title">Download Recommended Whisper Model</h2>
              <p class="ai-setup-desc">
                Your hardware diagnostic recommends the <strong>{status()?.system?.recommended_default_model?.toUpperCase() || "BASE"}</strong> model (~290 MB) for optimal 2–4s transcription speed and low memory footprint.
              </p>
              <div class="ai-setup-actions">
                <button
                  type="button"
                  class="ai-btn-primary"
                  disabled={downloadingModel() !== null}
                  onClick={() => handleDownloadModel(status()?.system?.recommended_default_model || "base")}
                >
                  {downloadingModel() ? (
                    <>
                      <i class="ph ph-spinner ph-spin" /> Downloading {downloadingModel()} ({downloadPercentage()}% - {downloadSpeedMb()})
                    </>
                  ) : (
                    <>
                      <i class="ph-bold ph-download-simple" /> Download Recommended Model ({status()?.system?.recommended_default_model?.toUpperCase() || "BASE"})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* ========================================================================= */}
        {/* WORKSPACE 1: GENERATION STUDIO                                            */}
        {/* ========================================================================= */}
        <Show when={activeWorkspace() === "studio"}>
          <div class="ai-studio-grid">
            {/* Left Column: Input Source & Parameters */}
            <div class="ai-studio-panel controls-panel">
              <div class="ai-panel-header">
                <span class="ai-panel-title">
                  <i class="ph ph-sliders" /> Audio Source & Configuration
                </span>
              </div>

              {/* Source Switcher */}
              <div class="ai-source-toggle">
                <button
                  type="button"
                  class={`ai-toggle-btn ${sourceMode() === "library" ? "active" : ""}`}
                  onClick={() => setSourceMode("library")}
                >
                  <i class="ph ph-music-notes" /> ViveStream Library ({libraryVideos().length})
                </button>
                <button
                  type="button"
                  class={`ai-toggle-btn ${sourceMode() === "custom" ? "active" : ""}`}
                  onClick={() => setSourceMode("custom")}
                >
                  <i class="ph ph-folder-open" /> Custom Audio File
                </button>
              </div>

              {/* Library Track Browser */}
              <Show when={sourceMode() === "library"}>
                <div class="ai-track-browser">
                  <div class="ai-search-box">
                    <i class="ph ph-magnifying-glass" />
                    <input
                      type="text"
                      class="ai-search-input"
                      placeholder="Search downloaded tracks by title or artist..."
                      value={trackSearchQuery()}
                      onInput={(e) => setTrackSearchQuery(e.currentTarget.value)}
                    />
                  </div>

                  <div class="ai-track-list">
                    <For each={filteredLibrary()}>
                      {(vid) => (
                        <div
                          class={`ai-track-item ${selectedVideoId() === vid.id ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedVideoId(vid.id);
                            if (audioRef) {
                              audioRef.pause();
                              setIsPlaying(false);
                            }
                          }}
                        >
                          <img
                            src={convertFileSrc(vid.thumbnail_path)}
                            alt={vid.title}
                            class="ai-track-thumb"
                            loading="lazy"
                          />
                          <div class="ai-track-info">
                            <span class="ai-track-title">{vid.title}</span>
                            <span class="ai-track-channel">{vid.channel || "Local Audio"}</span>
                          </div>
                          <Show when={selectedVideoId() === vid.id}>
                            <i class="ph-bold ph-check-circle ai-selected-check" />
                          </Show>
                        </div>
                      )}
                    </For>
                    <Show when={filteredLibrary().length === 0}>
                      <div class="ai-empty-tracks">No tracks found matching "{trackSearchQuery()}"</div>
                    </Show>
                  </div>
                </div>
              </Show>

              {/* Custom File Picker */}
              <Show when={sourceMode() === "custom"}>
                <div class="ai-custom-dropzone" onClick={handleBrowseLocalFile}>
                  <i class="ph-fill ph-upload-simple" />
                  <span class="ai-dropzone-title">Click to Select Audio or Video File</span>
                  <span class="ai-dropzone-desc">Supports MP3, FLAC, WAV, M4A, AAC, OPUS, MP4, MKV</span>
                  <Show when={customAudioPath()}>
                    <div class="ai-selected-path">
                      <i class="ph-bold ph-check" /> {customAudioPath()}
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Engine Parameters */}
              <div class="ai-config-grid">
                {/* Acceleration Device Selector */}
                <div class="ai-config-item">
                  <div class="ai-field-label-row">
                    <label class="ai-field-label">
                      <i class="ph-fill ph-lightning" /> Compute Device
                    </label>
                    <Show when={status()?.system?.primary_gpu}>
                      <span class="ai-device-rec-badge">
                        <i class="ph-bold ph-seal-check" /> Best: {status()?.system?.primary_gpu?.name}
                      </span>
                    </Show>
                  </div>
                  <select
                    class="ai-select"
                    value={selectedDevice()}
                    onChange={(e) => {
                      setSelectedDevice(e.currentTarget.value);
                      updateWhisperComputeDevice(e.currentTarget.value);
                    }}
                  >
                    <For each={status()?.system?.compute_devices || []}>
                      {(dev) => (
                        <option value={dev.id}>
                          {dev.label}
                        </option>
                      )}
                    </For>
                  </select>
                </div>

                {/* Model Selector */}
                <div class="ai-config-item">
                  <label class="ai-field-label">
                    <i class="ph ph-database" /> Whisper Model
                  </label>
                  <div class="ai-model-pills">
                    <For each={status()?.models || []}>
                      {(m) => (
                        <button
                          type="button"
                          class={`ai-pill-btn ${selectedModel() === m.name ? "selected" : ""} ${m.installed ? "installed" : "uninstalled"}`}
                          onClick={() => setSelectedModel(m.name)}
                        >
                          <span>{m.name.toUpperCase()}</span>
                          <Show when={m.installed} fallback={<span class="pill-dot" title="Not downloaded yet" />}>
                            <i class="ph-bold ph-check" />
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                {/* Task & Language */}
                <div class="ai-row-2">
                  <div class="ai-config-item">
                    <label class="ai-field-label">
                      <i class="ph ph-translate" /> Processing Task
                    </label>
                    <select
                      class="ai-select"
                      value={selectedTask()}
                      onChange={(e) => setSelectedTask(e.currentTarget.value)}
                    >
                      <option value="transcribe">Transcribe (Native Language)</option>
                      <option value="translate">Translate to English</option>
                    </select>
                  </div>

                  <div class="ai-config-item">
                    <label class="ai-field-label">
                      <i class="ph ph-globe" /> Language
                    </label>
                    <select
                      class="ai-select"
                      value={selectedLanguage()}
                      onChange={(e) => setSelectedLanguage(e.currentTarget.value)}
                    >
                      <option value="auto">Auto-Detect</option>
                      <option value="en">English (en)</option>
                      <option value="ja">Japanese (ja)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="fr">French (fr)</option>
                      <option value="de">German (de)</option>
                      <option value="ko">Korean (ko)</option>
                      <option value="zh">Chinese (zh)</option>
                      <option value="it">Italian (it)</option>
                      <option value="pt">Portuguese (pt)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Trigger */}
              <button
                type="button"
                class="ai-btn-primary studio-generate-btn"
                disabled={
                  isGenerating() ||
                  !activeAudioPath() ||
                  (isAiUnlocked() && (!status()?.binary_installed || !hasInstalledModel()))
                }
                onClick={!isAiUnlocked() ? () => setIsPreviewMode(false) : handleGenerate}
              >
                {isGenerating() ? (
                  <>
                    <i class="ph ph-spinner ph-spin" /> {genStatusMsg() || "Transcribing Audio..."}
                  </>
                ) : !isAiUnlocked() ? (
                  <>
                    <i class="ph-bold ph-lock-key" /> Unlock Pro to Transcribe (6-Month License)
                  </>
                ) : !status()?.binary_installed ? (
                  <>
                    <i class="ph-bold ph-cpu" /> Deploy Whisper Engine First
                  </>
                ) : !hasInstalledModel() ? (
                  <>
                    <i class="ph-bold ph-database" /> Download a Whisper Model First
                  </>
                ) : (
                  <>
                    <i class="ph-bold ph-waveform" /> Transcribe & Synchronize Lyrics
                  </>
                )}
              </button>
            </div>

            {/* Right Column: Interactive Player & Output Studio */}
            <div class="ai-studio-panel player-panel">
              {/* Hidden Native Audio Element */}
              <Show when={activeAudioSrc()}>
                <audio
                  ref={audioRef}
                  src={activeAudioSrc()}
                  onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                  onEnded={() => setIsPlaying(false)}
                />
              </Show>

              {/* Player Topbar */}
              <div class="ai-player-header">
                <div class="ai-player-meta">
                  <span class="ai-player-status-tag">
                    <i class="ph-fill ph-music-notes" /> STUDIO MONITOR
                  </span>
                  <span class="ai-player-title">
                    {sourceMode() === "library"
                      ? libraryVideos().find((v) => v.id === selectedVideoId())?.title || "No Track Selected"
                      : customAudioPath().split(/[\\/]/).pop() || "Custom File"}
                  </span>
                </div>

                {/* Transport Controls */}
                <div class="ai-transport-controls">
                  <button
                    type="button"
                    class="ai-play-btn"
                    disabled={!activeAudioSrc()}
                    onClick={togglePlayPause}
                    title={isPlaying() ? "Pause" : "Play"}
                  >
                    <i class={`ph-fill ${isPlaying() ? "ph-pause" : "ph-play"}`} />
                  </button>

                  <div class="ai-scrubber-box">
                    <span class="ai-time-code">{formatTimestamp(playbackTime())}</span>
                    <input
                      type="range"
                      min="0"
                      max={audioDuration() || 100}
                      step="0.05"
                      value={playbackTime()}
                      onInput={(e) => handleSeek(parseFloat(e.currentTarget.value))}
                      class="ai-scrubber"
                    />
                    <span class="ai-time-code">{formatTimestamp(audioDuration())}</span>
                  </div>

                  <div class="ai-speed-chips">
                    <For each={[0.75, 1.0, 1.25, 1.5]}>
                      {(spd) => (
                        <button
                          type="button"
                          class={`ai-speed-chip ${playbackSpeed() === spd ? "active" : ""}`}
                          onClick={() => handleSpeedChange(spd)}
                        >
                          {spd}x
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              {/* Output Formats Dock & Actions */}
              <div class="ai-output-dock">
                <div class="ai-output-tabs" role="tablist">
                  <button
                    type="button"
                    class={`ai-tab-btn ${activeTab() === "karaoke" ? "active" : ""}`}
                    onClick={() => setActiveTab("karaoke")}
                  >
                    <i class="ph ph-microphone-stage" /> Live Karaoke Sync
                  </button>
                  <button
                    type="button"
                    class={`ai-tab-btn ${activeTab() === "elrc" ? "active" : ""}`}
                    onClick={() => setActiveTab("elrc")}
                  >
                    Enhanced LRC (.elrc)
                  </button>
                  <button
                    type="button"
                    class={`ai-tab-btn ${activeTab() === "lrc" ? "active" : ""}`}
                    onClick={() => setActiveTab("lrc")}
                  >
                    Standard LRC (.lrc)
                  </button>
                  <button
                    type="button"
                    class={`ai-tab-btn ${activeTab() === "srt" ? "active" : ""}`}
                    onClick={() => setActiveTab("srt")}
                  >
                    Subtitles (.srt)
                  </button>
                  <button
                    type="button"
                    class={`ai-tab-btn ${activeTab() === "json" ? "active" : ""}`}
                    onClick={() => setActiveTab("json")}
                  >
                    Raw JSON
                  </button>
                </div>

                <div class="ai-dock-actions">
                  <button
                    type="button"
                    class="ai-btn-sm"
                    disabled={!result()}
                    onClick={handleCopyResult}
                    title="Copy formatted text to clipboard"
                  >
                    <i class={`ph ${copied() ? "ph-check" : "ph-copy"}`} /> {copied() ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    class="ai-btn-sm"
                    onClick={() => handleOpenFolder("lyrics")}
                    title="Open Lyrics Storage Folder"
                  >
                    <i class="ph ph-folder-open" /> Lyrics Folder
                  </button>
                </div>
              </div>

              {/* Output Content Area */}
              <div class="ai-output-viewport" ref={lyricsScrollContainer}>
                {/* 1. Interactive Karaoke Word Alignment Mode */}
                <Show when={activeTab() === "karaoke"}>
                  <Show
                    when={result() && result()!.segments.length > 0}
                    fallback={
                      <div class="ai-empty-studio">
                        <i class="ph ph-waveform" />
                        <h3>Synchronized Lyrics Studio</h3>
                        <p>
                          {isGenerating()
                            ? "Transcribing audio and computing syllable alignments..."
                            : "Select a song and click Transcribe to generate word-level synchronized karaoke lyrics."}
                        </p>
                        <Show when={cachedLyricsList().length > 0}>
                          <div class="ai-history-quick">
                            <span>Previously Transcribed Tracks:</span>
                            <div class="ai-history-chips">
                              <For each={cachedLyricsList().slice(0, 5)}>
                                {(item) => (
                                  <button
                                    type="button"
                                    class="ai-history-chip"
                                    onClick={() => handleLoadCachedLyrics(item.stem)}
                                  >
                                    <i class="ph ph-file-text" /> {item.stem}
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                        </Show>
                      </div>
                    }
                  >
                    <div class="ai-karaoke-stream">
                      <For each={result()!.segments}>
                        {(seg) => {
                          const isLineActive = createMemo(
                            () => playbackTime() >= seg.start && playbackTime() <= seg.end
                          );

                          return (
                            <div
                              class={`ai-karaoke-line ${isLineActive() ? "active-line" : ""}`}
                              onClick={() => handleSeek(seg.start)}
                            >
                              <span class="ai-line-ts">{formatTimestamp(seg.start)}</span>
                              <div class="ai-words-flow">
                                <Show
                                  when={seg.words && seg.words.length > 0}
                                  fallback={<span class="ai-fallback-text">{seg.text}</span>}
                                >
                                  <For each={seg.words}>
                                    {(w) => {
                                      const isWordActive = createMemo(
                                        () => playbackTime() >= w.start && playbackTime() <= w.end
                                      );

                                      return (
                                        <span
                                          class={`ai-word-span ${isWordActive() ? "highlight" : ""}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSeek(w.start);
                                          }}
                                          title={`${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s`}
                                        >
                                          {w.word}
                                        </span>
                                      );
                                    }}
                                  </For>
                                </Show>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>

                {/* 2. Textual Code/Raw Views (ELRC, LRC, SRT, JSON) */}
                <Show when={activeTab() !== "karaoke"}>
                  <Show
                    when={result()}
                    fallback={
                      <div class="ai-empty-studio">
                        <i class="ph ph-file-code" />
                        <h3>Formatted Output Viewer</h3>
                        <p>Run transcription to inspect formatted subtitle timestamps and karaoke markers.</p>
                      </div>
                    }
                  >
                    <pre class="ai-code-view">
                      {activeTab() === "lrc"
                        ? result()?.lrc
                        : activeTab() === "elrc"
                        ? result()?.enhanced_lrc
                        : activeTab() === "srt"
                        ? result()?.srt
                        : JSON.stringify(result(), null, 2)}
                    </pre>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* ========================================================================= */}
        {/* WORKSPACE 2: MODEL REPOSITORY & STORAGE                                  */}
        {/* ========================================================================= */}
        <Show when={activeWorkspace() === "models"}>
          <div class="ai-models-workspace">
            {/* Storage Summary Header */}
            <div class="ai-storage-summary-card">
              <div class="ai-storage-info">
                <i class="ph-fill ph-hard-drives" />
                <div>
                  <h3 class="ai-storage-title">Whisper SafeTensors Storage Repository</h3>
                  <p class="ai-storage-path">
                    Active Storage: <code>{status()?.models_dir || "Loading..."}</code>
                  </p>
                </div>
              </div>
              <div class="ai-storage-actions">
                <button
                  type="button"
                  class="ai-btn-secondary"
                  onClick={() => handleOpenFolder("models")}
                >
                  <i class="ph-bold ph-folder-open" /> Reveal in File Explorer
                </button>
              </div>
            </div>

            {/* Model Cards Grid */}
            <div class="ai-model-cards-grid">
              <For each={status()?.models || []}>
                {(m) => {
                  const isRec = () =>
                    status()?.system?.recommended_default_model?.toLowerCase() === m.name.toLowerCase();

                  return (
                    <div class={`ai-repo-card ${m.installed ? "mounted" : ""} ${isRec() ? "recommended" : ""}`}>
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
                        <Show when={isRec()}>
                          <span class="ai-badge-rec">RECOMMENDED</span>
                        </Show>
                      </div>

                      <div class="ai-repo-specs">
                        <div class="ai-spec-row">
                          <span class="spec-label">File Size:</span>
                          <span class="spec-val">~{m.expected_size_mb} MB</span>
                        </div>
                        <div class="ai-spec-row">
                          <span class="spec-label">Relative Speed:</span>
                          <span class="spec-val">
                            {m.name === "tiny"
                              ? "32x Real-Time"
                              : m.name === "base"
                              ? "16x Real-Time"
                              : m.name === "small"
                              ? "6x Real-Time"
                              : m.name === "medium"
                              ? "2x Real-Time"
                              : "1x Real-Time"}
                          </span>
                        </div>
                        <div class="ai-spec-row">
                          <span class="spec-label">Min RAM:</span>
                          <span class="spec-val">
                            {m.name === "tiny"
                              ? "1.0 GB"
                              : m.name === "base"
                              ? "1.5 GB"
                              : m.name === "small"
                              ? "2.5 GB"
                              : m.name === "medium"
                              ? "5.0 GB"
                              : "8.0 GB"}
                          </span>
                        </div>
                      </div>

                      {/* Download Progress Bar if Active */}
                      <Show when={downloadingModel() === m.name}>
                        <div class="ai-download-monitor">
                          <div class="ai-download-labels">
                            <span>Downloading Weights...</span>
                            <span>{downloadPercentage()}% ({downloadSpeedMb()})</span>
                          </div>
                          <div class="ai-prog-track">
                            <div class="ai-prog-bar" style={{ width: `${downloadPercentage()}%` }} />
                          </div>
                        </div>
                      </Show>

                      <div class="ai-repo-card-footer">
                        <Show
                          when={!m.installed}
                          fallback={
                            <div class="ai-installed-actions">
                              <span class="ai-mounted-tag">
                                <i class="ph-bold ph-check" /> Mounted & Ready
                              </span>
                              <button
                                type="button"
                                class="ai-delete-btn"
                                title="Delete model weights to free disk space"
                                onClick={() => handleDeleteModel(m.name)}
                              >
                                <i class="ph ph-trash" />
                              </button>
                            </div>
                          }
                        >
                          <button
                            type="button"
                            class="ai-btn-primary"
                            disabled={downloadingModel() !== null}
                            onClick={() => handleDownloadModel(m.name)}
                          >
                            <i class="ph-bold ph-download-simple" /> Get Model (~{m.expected_size_mb} MB)
                          </button>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* ========================================================================= */}
        {/* WORKSPACE 3: HARDWARE TELEMETRY & ADVISOR                                */}
        {/* ========================================================================= */}
        <Show when={activeWorkspace() === "hardware"}>
          <div class="ai-hardware-workspace">
            {/* Section 1: Live Hardware Metrics Bar */}
            <div class="ai-section-title-row">
              <h2 class="ai-section-title">
                <i class="ph-fill ph-gauge" /> Live Hardware Telemetry
              </h2>
              <span class="ai-live-badge">
                <span class="ai-pulse-dot" /> LIVE 2s MONITOR
              </span>
            </div>

            <div class="ai-hw-grid">
              {/* Card 1: Dedicated GPU VRAM Live */}
              <div class="ai-hw-card gpu-card">
                <div class="ai-hw-card-header">
                  <i class="ph-fill ph-lightning" />
                  <span>Dedicated GPU VRAM (Live)</span>
                  <span class="hw-tag pro">DEDICATED GDDR6</span>
                </div>
                <div class="ai-hw-val-large">
                  {liveUsage()?.gpus?.[0]?.vram_used_mb
                    ? `${(liveUsage()!.gpus[0].vram_used_mb / 1024).toFixed(2)} GB / ${((status()?.system?.gpus?.[0]?.vram_total_mb || 16384) / 1024).toFixed(1)} GB`
                    : status()?.system?.gpus?.[0]
                    ? `${((status()!.system!.gpus![0].vram_total_mb) / 1024).toFixed(1)} GB VRAM`
                    : "16.0 GB VRAM"}
                </div>
                <div class="ai-ram-meter">
                  <div
                    class="ai-ram-meter-fill vram-fill"
                    style={{
                      width: `${
                        liveUsage()?.gpus?.[0]?.vram_usage_percent !== undefined
                          ? liveUsage()!.gpus[0].vram_usage_percent
                          : 6.5
                      }%`,
                    }}
                  />
                </div>
                <div class="ai-hw-sub-row">
                  <span>
                    Primary GPU: <strong>{status()?.system?.primary_gpu?.name || "Intel(R) Arc(TM) A770 Graphics"}</strong>
                  </span>
                  <span class="hw-tag success">
                    {liveUsage()?.gpus?.[0]?.vram_usage_percent
                      ? `${liveUsage()!.gpus[0].vram_usage_percent}% LOAD`
                      : "OPTIMAL"}
                  </span>
                </div>
              </div>

              {/* Card 2: System Memory RAM Live */}
              <div class="ai-hw-card">
                <div class="ai-hw-card-header">
                  <i class="ph-fill ph-hard-drive" />
                  <span>System Memory RAM (Live)</span>
                  <span class="hw-tag">HEADROOM</span>
                </div>
                <div class="ai-hw-val-large">
                  {liveUsage()?.used_ram_mb
                    ? `${(liveUsage()!.used_ram_mb / 1024).toFixed(1)} GB / ${(liveUsage()!.total_ram_mb / 1024).toFixed(1)} GB`
                    : status()?.system?.total_ram_mb
                    ? `${((status()?.system?.used_ram_mb || 0) / 1024).toFixed(1)} GB / ${(((status()?.system?.total_ram_mb || 0)) / 1024).toFixed(1)} GB`
                    : "16 GB RAM"}
                </div>
                <div class="ai-ram-meter">
                  <div
                    class="ai-ram-meter-fill"
                    style={{
                      width: `${
                        liveUsage()?.ram_usage_percent !== undefined
                          ? liveUsage()!.ram_usage_percent
                          : status()?.system?.ram_usage_percent || 55
                      }%`,
                    }}
                  />
                </div>
                <div class="ai-hw-sub-row">
                  <span>
                    Available:{" "}
                    <strong>
                      {liveUsage()?.available_ram_mb
                        ? `${(liveUsage()!.available_ram_mb / 1024).toFixed(1)} GB Free`
                        : `${((status()?.system?.available_ram_mb || 0) / 1024).toFixed(1)} GB Free`}
                    </strong>
                  </span>
                  <span class="hw-tag">ZERO SWAP PRESSURE</span>
                </div>
              </div>

              {/* Card 3: Host CPU & Inference Engine */}
              <div class="ai-hw-card">
                <div class="ai-hw-card-header">
                  <i class="ph-fill ph-cpu" />
                  <span>Host Processor Utilization</span>
                  <span class="hw-tag success">CANDLE 0.8.2</span>
                </div>
                <div class="ai-hw-val-large">
                  {liveUsage()?.cpu_usage_percent !== undefined
                    ? `${liveUsage()!.cpu_usage_percent.toFixed(1)}% Load`
                    : "Multi-Threaded"}
                </div>
                <div class="ai-ram-meter">
                  <div
                    class="ai-ram-meter-fill cpu-fill"
                    style={{
                      width: `${Math.min(100, Math.max(8, liveUsage()?.cpu_usage_percent || 12))}%`,
                    }}
                  />
                </div>
                <div class="ai-hw-sub-row">
                  <span>
                    {status()?.system?.cpu_physical_cores || 6} Cores / {status()?.system?.cpu_logical_threads || 12} Threads
                  </span>
                  <span class="hw-tag pro">
                    {status()?.system?.cpu_features?.join(" + ") || "AVX2 + FMA"}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Detected GPUs & Acceleration Hardware */}
            <div class="ai-section-title-row">
              <h2 class="ai-section-title">
                <i class="ph-fill ph-circuit-board" /> Detected Graphics Processing Units (GPUs)
              </h2>
              <span class="ai-subtitle">
                {status()?.system?.gpus?.length || 1} GPU Accelerator(s) Discovered
              </span>
            </div>

            <div class="ai-gpu-cards-grid">
              <For each={status()?.system?.gpus || []}>
                {(gpu) => (
                  <div class={`ai-gpu-showcase-card ${gpu.is_recommended ? "recommended" : ""}`}>
                    <div class="ai-gpu-card-top">
                      <div class="ai-gpu-title-group">
                        <div class="ai-gpu-vendor-badge" data-vendor={gpu.vendor}>
                          {gpu.vendor.toUpperCase()}
                        </div>
                        <h3 class="ai-gpu-name">{gpu.name}</h3>
                      </div>
                      <Show when={gpu.is_recommended}>
                        <span class="ai-badge-rec">DEFAULT ACCELERATOR</span>
                      </Show>
                    </div>

                    <div class="ai-gpu-specs-grid">
                      <div class="ai-gpu-spec">
                        <span class="spec-label">Device Type</span>
                        <span class="spec-val">
                          {gpu.device_type === "discrete_gpu" ? "Dedicated GPU" : "Integrated GPU (iGPU)"}
                        </span>
                      </div>
                      <div class="ai-gpu-spec">
                        <span class="spec-label">Dedicated VRAM</span>
                        <span class="spec-val highlight">
                          {gpu.vram_total_mb > 0 ? `${(gpu.vram_total_mb / 1024).toFixed(1)} GB GDDR6` : "Shared Memory"}
                        </span>
                      </div>
                      <div class="ai-gpu-spec">
                        <span class="spec-label">Driver Version</span>
                        <span class="spec-val">{gpu.driver_version || "System Default"}</span>
                      </div>
                      <div class="ai-gpu-spec">
                        <span class="spec-label">Acceleration Pipeline</span>
                        <span class="spec-val">{gpu.compute_capability}</span>
                      </div>
                    </div>

                    <div class="ai-gpu-footer">
                      <button
                        type="button"
                        class={`ai-btn-sm ${selectedDevice() === gpu.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedDevice(gpu.id);
                          updateWhisperComputeDevice(gpu.id);
                          addToast(`Switched active compute accelerator to ${gpu.name}`, "success");
                        }}
                      >
                        <i class="ph-bold ph-lightning" />
                        {selectedDevice() === gpu.id ? "Active Compute Device" : "Set as Active Device"}
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Section 3: Full Host System Specifications */}
            <div class="ai-advisor-panel">
              <div class="ai-advisor-header">
                <h3>Full System Specifications & Architecture</h3>
                <p>Complete host telemetry details utilized by the neural inference runtime.</p>
              </div>

              <div class="ai-specs-table-wrap">
                <table class="ai-advisor-table">
                  <tbody>
                    <tr>
                      <td style="width: 25%;"><strong>Host Operating System</strong></td>
                      <td>
                        {status()?.system?.os_name || "Windows 11"} ({status()?.system?.os_version || "64-bit Architecture"})
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Central Processor (CPU)</strong></td>
                      <td>
                        {status()?.system?.cpu_brand || "AMD Ryzen 5 7500F 6-Core Processor"}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Core Topology</strong></td>
                      <td>
                        {status()?.system?.cpu_physical_cores || 6} Physical Cores • {status()?.system?.cpu_logical_threads || 12} Logical Hardware Threads
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Vector & SIMD Instruction Sets</strong></td>
                      <td>
                        <span class="hw-tag success">
                          {status()?.system?.cpu_features?.join(", ") || "AVX2, FMA"} (Candle Vector Optimized)
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Total Physical Memory</strong></td>
                      <td>
                        {status()?.system?.total_ram_mb
                          ? `${(((status()?.system?.total_ram_mb || 0)) / 1024).toFixed(1)} GB High-Speed DDR RAM`
                          : "16 GB RAM"}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Candle Inference Backend</strong></td>
                      <td>
                        Pure-Rust Native Binary • Zero Python runtime overhead • Work-stealing Rayon thread pool
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 4: Hardware Compatibility & Speed Advisor Table */}
            <div class="ai-advisor-panel">
              <div class="ai-advisor-header">
                <h3>Hardware Suitability & Inference Speed Advisor</h3>
                <p>Real-time factor (RTF) estimates for 3-minute audio tracks comparing GPU acceleration vs multi-threaded CPU.</p>
              </div>

              <div class="ai-advisor-table-wrap">
                <table class="ai-advisor-table">
                  <thead>
                    <tr>
                      <th>MODEL SIZE</th>
                      <th>MEMORY FOOTPRINT</th>
                      <th>GPU ACCEL TIME (INTEL ARC A770)</th>
                      <th>CPU MULTI-THREAD TIME</th>
                      <th>ACCURACY RATING</th>
                      <th>STATUS ADVICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>TINY</strong></td>
                      <td>~1.0 GB RAM / VRAM</td>
                      <td>~0.4 seconds</td>
                      <td>~1.5 seconds</td>
                      <td>★★★☆☆ (Clear vocal tracks)</td>
                      <td><span class="status-pill optimal">Ultra Fast</span></td>
                    </tr>
                    <tr class="recommended-row">
                      <td><strong>BASE ★</strong></td>
                      <td>~1.5 GB RAM / VRAM</td>
                      <td>~0.9 seconds</td>
                      <td>~3.2 seconds</td>
                      <td>★★★★☆ (Optimal for music lyrics)</td>
                      <td><span class="status-pill optimal">Optimal (Recommended)</span></td>
                    </tr>
                    <tr>
                      <td><strong>SMALL</strong></td>
                      <td>~2.5 GB RAM / VRAM</td>
                      <td>~2.1 seconds</td>
                      <td>~8.5 seconds</td>
                      <td>★★★★★ (Studio-grade accuracy)</td>
                      <td><span class="status-pill supported">Supported</span></td>
                    </tr>
                    <tr>
                      <td><strong>MEDIUM</strong></td>
                      <td>~5.0 GB RAM / VRAM</td>
                      <td>~5.8 seconds</td>
                      <td>~24 seconds</td>
                      <td>★★★★★ (High-fidelity multilingual)</td>
                      <td><span class="status-pill supported">Supported</span></td>
                    </tr>
                    <tr>
                      <td><strong>LARGE-V3</strong></td>
                      <td>~8.0 GB RAM / VRAM</td>
                      <td>~12 seconds</td>
                      <td>~55 seconds</td>
                      <td>★★★★★ (Broadcast transcription)</td>
                      <td><span class="status-pill heavy">Supported on A770 16GB</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
