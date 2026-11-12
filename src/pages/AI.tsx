import { createSignal, onMount, onCleanup, For, Show, createMemo } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "@solidjs/router";
import {
  VideoEntry,
  isAiUnlocked,
  licenseData,
  checkLicenseStatus,
  addToast,
  whisperDefaultModel,
  whisperDefaultTask,
  whisperComputeDevice,
  updateWhisperComputeDevice,
  LiveHardwareUsage,
  SystemScan,
  setActiveVideo,
  BatchProgressEvent,
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

interface TranscribeProgress {
  type: string;
  stage: string;
  percent: number;
  seek_sec: number;
  total_sec: number;
  message: string;
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
  const navigate = useNavigate();

  // Navigation Workspaces: matrix (Library Matrix & Batch), inspector (Karaoke Inspector & Editor), models (Neural Hub & Telemetry)
  const [activeWorkspace, setActiveWorkspace] = createSignal<"matrix" | "inspector" | "models">("matrix");

  // Core Status & Data
  const [status, setStatus] = createSignal<WhisperStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = createSignal(true);
  const [libraryVideos, setLibraryVideos] = createSignal<VideoEntry[]>([]);
  const [cachedLyricsList, setCachedLyricsList] = createSignal<CachedLyricItem[]>([]);
  const [isPreviewMode, setIsPreviewMode] = createSignal(false);
  const [isInstallingEngine, setIsInstallingEngine] = createSignal(false);
  const [engineSetupMsg, setEngineSetupMsg] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal("");
  const [copiedError, setCopiedError] = createSignal(false);

  // Configuration Parameters
  const [selectedModel, setSelectedModel] = createSignal<string>(whisperDefaultModel() || "base");
  const [selectedTask, setSelectedTask] = createSignal<string>(whisperDefaultTask() || "transcribe");
  const [selectedLanguage, setSelectedLanguage] = createSignal<string>("auto");
  const [selectedDevice, setSelectedDevice] = createSignal<string>(whisperComputeDevice() || "auto");
  const [liveUsage, setLiveUsage] = createSignal<LiveHardwareUsage | null>(null);

  // Workspace 1: Matrix & Batch State
  const [matrixSearchQuery, setMatrixSearchQuery] = createSignal("");
  const [matrixStatusFilter, setMatrixStatusFilter] = createSignal<"all" | "missing" | "synced">("all");
  const [selectedBatchIds, setSelectedBatchIds] = createSignal<string[]>([]);
  const [isBatchTranscribing, setIsBatchTranscribing] = createSignal(false);
  const [batchProgress, setBatchProgress] = createSignal<BatchProgressEvent | null>(null);

  // Workspace 2: Pro Karaoke Inspector & Editor State
  const [inspectVideoId, setInspectVideoId] = createSignal<string>("");
  const [sourceMode, setSourceMode] = createSignal<"library" | "custom">("library");
  const [customAudioPath, setCustomAudioPath] = createSignal<string>("");
  const [result, setResult] = createSignal<LyricsResult | null>(null);
  const [inspectorTab, setInspectorTab] = createSignal<"karaoke" | "editor" | "raw">("karaoke");
  const [rawTab, setRawTab] = createSignal<"elrc" | "lrc" | "srt" | "vtt" | "json">("elrc");
  const [editableLrc, setEditableLrc] = createSignal("");
  const [isSavingLyrics, setIsSavingLyrics] = createSignal(false);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [genStatusMsg, setGenStatusMsg] = createSignal("");
  const [transcribeProgress, setTranscribeProgress] = createSignal<TranscribeProgress | null>(null);
  const [copied, setCopied] = createSignal(false);

  // Interactive Synchronized Audio Player State
  let audioRef: HTMLAudioElement | undefined;
  let lyricsScrollContainer: HTMLDivElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [playbackTime, setPlaybackTime] = createSignal(0);
  const [audioDuration, setAudioDuration] = createSignal(0);
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1.0);

  // Workspace 3: Model Manager & Benchmark State
  const [downloadingModel, setDownloadingModel] = createSignal<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = createSignal<number>(0);
  const [downloadSpeedMb, setDownloadSpeedMb] = createSignal<string>("");
  const [isBenchmarking, setIsBenchmarking] = createSignal(false);
  const [benchmarkResult, setBenchmarkResult] = createSignal<BenchmarkResult | null>(null);

  const hasInstalledModel = () => (status()?.models || []).some((m) => m.installed);
  const installedModelsCount = () => (status()?.models || []).filter((m) => m.installed).length;

  // Active track resolution
  const activeVideo = createMemo(() => {
    return libraryVideos().find((v) => v.id === inspectVideoId()) || null;
  });

  const activeAudioPath = createMemo(() => {
    if (sourceMode() === "custom") return customAudioPath();
    const vid = activeVideo();
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

  // Track lyrics lookup helper
  const getTrackLyricsStatus = (vid: VideoEntry): { hasLyrics: boolean; format: "karaoke" | "lrc" | "subtitles" | "none" } => {
    const cached = cachedLyricsList();
    const cleanTitle = vid.title.replace(/[^a-zA-Z0-9_\-\. ]/g, "_");

    const matchEnhanced = cached.find((c) =>
      (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename === `${vid.id}.enhanced.lrc`) &&
      c.filename.endsWith(".enhanced.lrc")
    );
    if (matchEnhanced) return { hasLyrics: true, format: "karaoke" };

    const matchLrc = cached.find((c) =>
      (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename === `${vid.id}.lrc`) &&
      c.filename.endsWith(".lrc")
    );
    if (matchLrc) return { hasLyrics: true, format: "lrc" };

    const matchSub = cached.find((c) =>
      (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename.startsWith(vid.id)) &&
      (c.filename.endsWith(".vtt") || c.filename.endsWith(".srt"))
    );
    if (matchSub) return { hasLyrics: true, format: "subtitles" };

    return { hasLyrics: false, format: "none" };
  };

  // Matrix Filtered Tracks
  const filteredMatrixTracks = createMemo(() => {
    let list = libraryVideos();
    const q = matrixSearchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter((v) => v.title.toLowerCase().includes(q) || (v.channel && v.channel.toLowerCase().includes(q)));
    }
    const filter = matrixStatusFilter();
    if (filter === "missing") {
      list = list.filter((v) => !getTrackLyricsStatus(v).hasLyrics);
    } else if (filter === "synced") {
      list = list.filter((v) => getTrackLyricsStatus(v).hasLyrics);
    }
    return list;
  });

  // Active Lyric Line calculation in Inspector
  const activeSegmentIndex = createMemo(() => {
    const res = result();
    if (!res || !res.segments || res.segments.length === 0) return -1;
    const t = playbackTime();
    let idx = -1;
    for (let i = 0; i < res.segments.length; i++) {
      if (res.segments[i].start <= t) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  });

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await invoke<WhisperStatus>("check_whisper_status");
      setStatus(res);

      // Auto-select an installed model if the currently selected one isn't installed
      const installedList = (res.models || []).filter((m) => m.installed);
      const isCurrentInstalled = (res.models || []).some((m) => m.name === selectedModel() && m.installed);
      if (!isCurrentInstalled && installedList.length > 0) {
        setSelectedModel(installedList[0].name);
        setWhisperDefaultModel(installedList[0].name);
      } else if (!selectedModel() && res.system?.recommended_default_model) {
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
      // silently ignore
    }
  };

  const fetchLibrary = async () => {
    try {
      const vids = await invoke<VideoEntry[]>("get_downloaded_videos");
      setLibraryVideos(vids);
      if (vids.length > 0 && !inspectVideoId()) {
        setInspectVideoId(vids[0].id);
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

    const unlistenTranscribe = listen<TranscribeProgress>("whisper-transcribe-progress", (event) => {
      setTranscribeProgress(event.payload);
      if (event.payload.message) {
        setGenStatusMsg(event.payload.message);
      }
    });

    const unlistenBatch = listen<BatchProgressEvent>("whisper-batch-progress", (event) => {
      setBatchProgress(event.payload);
    });

    onCleanup(async () => {
      clearInterval(liveInterval);
      (await unlistenModel)();
      (await unlistenSetup)();
      (await unlistenTranscribe)();
      (await unlistenBatch)();
    });
  });

  // Action Handlers
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

  // Workspace 1 Batch & Quick Selection Handlers
  const toggleSelectBatchTrack = (id: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const ids = filteredMatrixTracks().map((t) => t.id);
      setSelectedBatchIds(Array.from(new Set([...selectedBatchIds(), ...ids])));
    } else {
      const filteredIds = new Set(filteredMatrixTracks().map((t) => t.id));
      setSelectedBatchIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    }
  };

  const handleSelectAllMissing = () => {
    const missingIds = libraryVideos()
      .filter((v) => !getTrackLyricsStatus(v).hasLyrics)
      .map((v) => v.id);
    setSelectedBatchIds(missingIds);
    addToast(`Selected ${missingIds.length} tracks with missing lyrics.`, "info");
  };

  const handleRunBatch = async () => {
    const ids = selectedBatchIds();
    if (ids.length === 0) {
      addToast("Please select at least one track for batch transcription.", "error");
      return;
    }
    if (!isAiUnlocked()) {
      setIsPreviewMode(false);
      return;
    }

    try {
      setIsBatchTranscribing(true);
      setBatchProgress(null);
      addToast(`Starting batch Whisper transcription for ${ids.length} tracks...`, "info");

      await invoke("generate_batch_lyrics", {
        trackIds: ids,
        model: selectedModel() || "base",
        task: selectedTask() || "transcribe",
        language: selectedLanguage() === "auto" ? null : selectedLanguage(),
        device: selectedDevice() || "auto",
      });

      addToast(`Batch transcription completed (${ids.length} tracks processed)!`, "success");
      await fetchHistory();
      setSelectedBatchIds([]);
    } catch (err: any) {
      console.error("Batch transcription error:", err);
      addToast(`Batch transcription failed: ${err}`, "error");
    } finally {
      setIsBatchTranscribing(false);
      setBatchProgress(null);
    }
  };

  // Quick 1-click transcribe for track in Matrix
  const handleQuickTranscribe = async (vid: VideoEntry) => {
    if (!isAiUnlocked()) {
      setIsPreviewMode(false);
      return;
    }
    try {
      setIsGenerating(true);
      setErrorMsg("");
      setGenStatusMsg(`Transcribing "${vid.title}" with Whisper ${selectedModel().toUpperCase()}...`);
      const res = await invoke<LyricsResult>("generate_track_lyrics", {
        audioPath: vid.video_path,
        trackId: vid.id,
        model: selectedModel() || "base",
        task: selectedTask() || "transcribe",
        language: selectedLanguage() === "auto" ? null : selectedLanguage(),
        device: selectedDevice() || "auto",
      });

      setResult(res);
      setEditableLrc(res.enhanced_lrc || res.lrc || "");
      addToast(`Synced lyrics generated for "${vid.title}"!`, "success");
      await fetchHistory();
    } catch (err: any) {
      console.error("Quick transcribe error:", err);
      setErrorMsg(`Transcription error: ${err}`);
      addToast(`Transcription error: ${err}`, "error");
    } finally {
      setIsGenerating(false);
      setGenStatusMsg("");
    }
  };

  // Workspace 2: Load track into Pro Inspector
  const handleInspectTrack = async (vid: VideoEntry) => {
    setInspectVideoId(vid.id);
    setSourceMode("library");
    setActiveWorkspace("inspector");
    setEditableLrc("");
    setResult(null);

    if (audioRef) {
      audioRef.pause();
      setIsPlaying(false);
    }

    try {
      const lyrics = await invoke<any>("get_track_lyrics", {
        trackId: vid.id,
        title: vid.title,
      });

      if (lyrics && lyrics.has_lyrics) {
        setResult({
          duration: lyrics.duration || 0,
          language: lyrics.language || "detected",
          text: lyrics.raw_lrc || "",
          lrc: lyrics.raw_lrc || "",
          enhanced_lrc: lyrics.raw_enhanced_lrc || "",
          srt: lyrics.raw_srt || "",
          segments: (lyrics.lines || []).map((l: any) => ({
            id: l.id,
            start: l.start,
            end: l.end,
            text: l.text,
            words: l.words || [],
          })),
        });
        setEditableLrc(lyrics.raw_enhanced_lrc || lyrics.raw_lrc || "");
        addToast(`Loaded lyrics for "${vid.title}"`, "info");
      } else {
        setResult(null);
        setEditableLrc("");
        addToast(`No lyrics found for "${vid.title}". Click Generate to transcribe.`, "info");
      }
    } catch (err) {
      console.error("Failed to load lyrics:", err);
    }
  };

  // Inspector: Generate / Transcribe currently inspected track
  const handleGenerateInspectTrack = async () => {
    if (!isAiUnlocked()) {
      setIsPreviewMode(false);
      return;
    }
    const path = activeAudioPath();
    if (!path) {
      addToast("Please select a valid audio or video track.", "error");
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMsg("");
      setTranscribeProgress(null);
      setGenStatusMsg(`Transcribing audio with Whisper ${selectedModel().toUpperCase()}...`);

      const res = await invoke<LyricsResult>("generate_track_lyrics", {
        audioPath: path,
        trackId: sourceMode() === "library" ? inspectVideoId() : null,
        model: selectedModel(),
        task: selectedTask(),
        language: selectedLanguage() === "auto" ? null : selectedLanguage(),
        device: selectedDevice(),
      });

      setResult(res);
      setEditableLrc(res.enhanced_lrc || res.lrc || "");
      addToast("Synced lyrics and subtitles generated successfully!", "success");
      await fetchHistory();

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
      setTranscribeProgress(null);
    }
  };

  // Inspector: Timing offset shift
  const handleShiftOffset = async (offsetSec: number) => {
    if (!inspectVideoId()) return;
    try {
      await invoke("adjust_lyrics_offset", {
        trackId: inspectVideoId(),
        offsetSec,
        offsetSeconds: offsetSec,
      });
      addToast(`Lyrics offset adjusted by ${(offsetSec > 0 ? "+" : "") + offsetSec.toFixed(2)}s`, "info");
      const vid = activeVideo();
      if (vid) handleInspectTrack(vid);
    } catch (err: any) {
      addToast(`Failed to shift offset: ${err}`, "error");
    }
  };

  const handleAlignIntroToPlayhead = async () => {
    if (!inspectVideoId() || !lyricsData() || lyricsData()!.lines.length === 0) return;
    const firstLineStart = lyricsData()!.lines[0].start;
    const curTime = previewAudioEl ? previewAudioEl.currentTime : 0;
    const diff = curTime - firstLineStart;
    if (Math.abs(diff) < 0.05) {
      addToast("Lyrics intro is already aligned to playhead.", "info");
      return;
    }
    await handleShiftOffset(diff);
  };

  // Inspector: Save custom edited lyrics
  const handleSaveLyrics = async () => {
    if (!inspectVideoId() || !editableLrc().trim()) return;
    try {
      setIsSavingLyrics(true);
      await invoke("save_custom_lyrics", {
        trackId: inspectVideoId(),
        lrcContent: editableLrc(),
      });
      addToast("Custom lyrics saved to disk successfully!", "success");
      await fetchHistory();
      const vid = activeVideo();
      if (vid) handleInspectTrack(vid);
    } catch (err: any) {
      addToast(`Failed to save lyrics: ${err}`, "error");
    } finally {
      setIsSavingLyrics(false);
    }
  };

  // Play track in Main ViveStream Player
  const handlePlayInMainPlayer = (vid: VideoEntry) => {
    setActiveVideo(vid);
    navigate(`/player/${vid.id}`);
  };

  const handleCopyRaw = () => {
    const res = result();
    if (!res) return;
    let text = "";
    if (rawTab() === "elrc") text = res.enhanced_lrc || res.lrc;
    else if (rawTab() === "lrc") text = res.lrc;
    else if (rawTab() === "srt") text = res.srt;
    else if (rawTab() === "vtt") text = res.srt ? res.srt.replace(/,/g, ".") : "";
    else if (rawTab() === "json") text = JSON.stringify(res, null, 2);

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast("Copied to clipboard!", "success");
  };

  const handleOpenFolder = async (target: "models" | "lyrics") => {
    try {
      await invoke("open_whisper_folder", { target });
    } catch (e) {
      addToast("Could not open directory", "error");
    }
  };

  const handleCopyError = async () => {
    if (!errorMsg()) return;
    try {
      await navigator.clipboard.writeText(errorMsg());
      setCopiedError(true);
      addToast("Error message copied to clipboard!", "success");
      setTimeout(() => setCopiedError(false), 2500);
    } catch {
      addToast("Failed to copy to clipboard", "error");
    }
  };

  const handleRunBenchmark = async () => {
    if (!isAiUnlocked()) {
      addToast("Neural benchmarks are locked behind the 6-Month Pro Subscription.", "error");
      setIsPreviewMode(false);
      return;
    }
    try {
      setIsBenchmarking(true);
      setBenchmarkResult(null);
      addToast("Starting Candle Whisper benchmark...", "info");
      const res = await invoke<BenchmarkResult>("run_whisper_benchmark", {
        model: selectedModel() || "base",
        device: selectedDevice() || "auto",
      });
      setBenchmarkResult(res);
      addToast(`Benchmark complete: ${res.speedup}!`, "success");
    } catch (e: any) {
      console.error("Benchmark failed:", e);
      addToast(`Benchmark failed: ${e}`, "error");
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Audio Player Controls
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
                <span class="ai-badge pro" title={licenseData()?.customer_email ? `Customer: ${licenseData()!.customer_email}` : "6-Month Subscription"}>
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

            <h1 class="ai-title">AI Studio // Synced Lyrics & Subtitles</h1>
            <p class="ai-subtitle">
              Local neural speech recognition • Syllable-level karaoke alignments • Zero Python overhead
            </p>
          </div>

          <div class="ai-header-actions">
            {/* 3 Workspaces Switcher */}
            <div class="ai-nav-switcher" role="tablist">
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "matrix" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("matrix")}
              >
                <i class="ph ph-table" /> Library Matrix & Batch
              </button>
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "inspector" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("inspector")}
              >
                <i class="ph ph-microphone-stage" /> Karaoke Inspector & Editor
              </button>
              <button
                type="button"
                class={`ai-nav-tab ${activeWorkspace() === "models" ? "active" : ""}`}
                onClick={() => setActiveWorkspace("models")}
              >
                <i class="ph ph-cpu" /> Neural Hub & Models
              </button>
            </div>
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
              <button
                type="button"
                class="ai-btn-sm"
                onClick={handleCopyError}
                title="Copy error message to clipboard"
                style={{ "display": "inline-flex", "align-items": "center", "gap": "6px", "font-weight": "800" }}
              >
                <i class={`ph-bold ${copiedError() ? "ph-check" : "ph-copy"}`} />
                <span>{copiedError() ? "Copied!" : "Copy Error"}</span>
              </button>
              <button
                type="button"
                class="ai-btn-sm"
                onClick={() => setErrorMsg("")}
              >
                <i class="ph ph-x" />
              </button>
            </div>
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
        {/* WORKSPACE 1: LIBRARY LYRICS MATRIX & BATCH QUEUE                           */}
        {/* ========================================================================= */}
        <Show when={activeWorkspace() === "matrix"}>
          <div class="ai-matrix-workspace">
            {/* Matrix Toolbar */}
            <div class="ai-matrix-toolbar">
              <div class="ai-matrix-search">
                <i class="ph-bold ph-magnifying-glass" />
                <input
                  type="text"
                  placeholder="Filter library tracks by song title or artist..."
                  value={matrixSearchQuery()}
                  onInput={(e) => setMatrixSearchQuery(e.currentTarget.value)}
                />
              </div>

              {/* Status Filters */}
              <div class="ai-matrix-filter-pills">
                <button
                  type="button"
                  class={`matrix-filter-btn ${matrixStatusFilter() === "all" ? "active" : ""}`}
                  onClick={() => setMatrixStatusFilter("all")}
                >
                  All Tracks ({libraryVideos().length})
                </button>
                <button
                  type="button"
                  class={`matrix-filter-btn missing ${matrixStatusFilter() === "missing" ? "active" : ""}`}
                  onClick={() => setMatrixStatusFilter("missing")}
                >
                  <i class="ph-fill ph-warning-circle" /> Missing Lyrics ({libraryVideos().filter((v) => !getTrackLyricsStatus(v).hasLyrics).length})
                </button>
                <button
                  type="button"
                  class={`matrix-filter-btn synced ${matrixStatusFilter() === "synced" ? "active" : ""}`}
                  onClick={() => setMatrixStatusFilter("synced")}
                >
                  <i class="ph-fill ph-check-circle" /> Synced ({libraryVideos().filter((v) => getTrackLyricsStatus(v).hasLyrics).length})
                </button>
              </div>

              {/* Selection shortcuts */}
              <div class="ai-matrix-selection-actions">
                <button
                  type="button"
                  class="ai-btn-sm"
                  onClick={handleSelectAllMissing}
                  title="Select all tracks without lyrics"
                >
                  <i class="ph-bold ph-checks" /> Select Missing
                </button>
                <Show when={selectedBatchIds().length > 0}>
                  <button
                    type="button"
                    class="ai-btn-sm neutral"
                    onClick={() => setSelectedBatchIds([])}
                  >
                    Clear ({selectedBatchIds().length})
                  </button>
                </Show>
              </div>
            </div>

            {/* Batch Action Strip (Shown when 1+ tracks selected) */}
            <Show when={selectedBatchIds().length > 0}>
              <div class="ai-batch-action-bar">
                <div class="ai-batch-info">
                  <span class="ai-batch-count">
                    <i class="ph-bold ph-check-square" />
                    <strong>{selectedBatchIds().length}</strong> tracks selected for batch transcription
                  </span>
                </div>

                <div class="ai-batch-configs">
                  <div class="ai-batch-select-wrap">
                    <label>Model:</label>
                    <select
                      value={selectedModel()}
                      onChange={(e) => setSelectedModel(e.currentTarget.value)}
                    >
                      <option value="tiny">Tiny (~75 MB)</option>
                      <option value="base">Base (~290 MB - Optimal)</option>
                      <option value="small">Small (~960 MB)</option>
                      <option value="medium">Medium (~3.0 GB)</option>
                      <option value="large-v3">Large-v3 (~6.2 GB)</option>
                    </select>
                  </div>

                  <div class="ai-batch-select-wrap">
                    <label>Device:</label>
                    <select
                      value={selectedDevice()}
                      onChange={(e) => {
                        setSelectedDevice(e.currentTarget.value);
                        updateWhisperComputeDevice(e.currentTarget.value);
                      }}
                    >
                      <option value="auto">Auto (GPU Preferred)</option>
                      <option value="cuda">Vulkan / GPU</option>
                      <option value="cpu">CPU Rayon Multi-thread</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    class="ai-batch-run-btn"
                    disabled={isBatchTranscribing()}
                    onClick={handleRunBatch}
                  >
                    <Show
                      when={isBatchTranscribing()}
                      fallback={
                        <>
                          <i class="ph-bold ph-lightning" />
                          <span>Transcribe Selected ({selectedBatchIds().length})</span>
                        </>
                      }
                    >
                      <i class="ph-bold ph-spinner animate-spin" />
                      <span>Transcribing Batch...</span>
                    </Show>
                  </button>
                </div>
              </div>
            </Show>

            {/* Batch Progress Card */}
            <Show when={isBatchTranscribing() && batchProgress()}>
              <div class="ai-batch-progress-card">
                <div class="batch-progress-header">
                  <div class="batch-progress-title">
                    <i class="ph-bold ph-spinner animate-spin" />
                    <span>
                      Batch Transcription in Progress: <strong>{batchProgress()?.current_index}</strong> of <strong>{batchProgress()?.total_tracks}</strong>
                    </span>
                  </div>
                  <span class="batch-progress-percent">{Math.round(batchProgress()?.percent || 0)}%</span>
                </div>

                <div class="batch-progress-bar-track">
                  <div
                    class="batch-progress-bar-fill"
                    style={{ width: `${batchProgress()?.percent || 0}%` }}
                  />
                </div>

                <div class="batch-progress-footer">
                  <span class="batch-current-title">
                    Now processing: <strong>{batchProgress()?.title}</strong>
                  </span>
                  <span class="batch-current-stage">
                    Stage: <em>{batchProgress()?.stage}</em>
                  </span>
                </div>
              </div>
            </Show>

            {/* Matrix Table */}
            <div class="ai-matrix-table-wrap">
              <table class="ai-matrix-table">
                <thead>
                  <tr>
                    <th style={{ width: "44px" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredMatrixTracks().length > 0 &&
                          filteredMatrixTracks().every((t) => selectedBatchIds().includes(t.id))
                        }
                        onChange={(e) => handleSelectAllFiltered(e.currentTarget.checked)}
                        title="Select All Filtered"
                      />
                    </th>
                    <th>TRACK INFO</th>
                    <th style={{ width: "180px" }}>LYRICS STATUS</th>
                    <th style={{ width: "260px" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <For
                    each={filteredMatrixTracks()}
                    fallback={
                      <tr>
                        <td colspan="4" class="ai-table-empty">
                          <i class="ph-bold ph-waveform" />
                          <p>No tracks match the filter.</p>
                        </td>
                      </tr>
                    }
                  >
                    {(vid) => {
                      const st = getTrackLyricsStatus(vid);
                      const isSelected = () => selectedBatchIds().includes(vid.id);

                      return (
                        <tr class={`ai-matrix-row ${isSelected() ? "selected" : ""}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected()}
                              onChange={() => toggleSelectBatchTrack(vid.id)}
                            />
                          </td>
                          <td class="ai-matrix-track-cell">
                            <img
                              src={convertFileSrc(vid.thumbnail_path)}
                              alt={vid.title}
                              class="matrix-thumb"
                            />
                            <div class="matrix-track-info">
                              <span class="matrix-track-title" title={vid.title}>
                                {vid.title}
                              </span>
                              <span class="matrix-track-channel">
                                {vid.channel || "Local Media"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <Show
                              when={st.hasLyrics}
                              fallback={
                                <span class="matrix-status-pill missing">
                                  <i class="ph-bold ph-x-circle" /> Missing Lyrics
                                </span>
                              }
                            >
                              <span class={`matrix-status-pill ${st.format}`}>
                                <i class="ph-bold ph-check-circle" />
                                {st.format === "karaoke"
                                  ? "Word-Synced Karaoke"
                                  : st.format === "lrc"
                                  ? "Line-Synced LRC"
                                  : "Subtitles (VTT)"}
                              </span>
                            </Show>
                          </td>
                          <td class="ai-matrix-actions-cell">
                            <div class="matrix-action-group">
                              <Show
                                when={st.hasLyrics}
                                fallback={
                                  <button
                                    type="button"
                                    class="matrix-btn-action transcribe"
                                    disabled={isGenerating()}
                                    onClick={() => handleQuickTranscribe(vid)}
                                    title="Transcribe this track with Whisper"
                                  >
                                    <i class="ph-bold ph-sparkle" /> Transcribe
                                  </button>
                                }
                              >
                                <button
                                  type="button"
                                  class="matrix-btn-action inspect"
                                  onClick={() => handleInspectTrack(vid)}
                                  title="Open Karaoke Inspector & Editor"
                                >
                                  <i class="ph-bold ph-microphone-stage" /> Inspect & Edit
                                </button>
                              </Show>

                              <button
                                type="button"
                                class="matrix-btn-action play"
                                onClick={() => handlePlayInMainPlayer(vid)}
                                title="Play in Media Player"
                              >
                                <i class="ph-fill ph-play" /> Play
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>

        {/* ========================================================================= */}
        {/* WORKSPACE 2: PRO KARAOKE INSPECTOR & TIMING EDITOR                         */}
        {/* ========================================================================= */}
        <Show when={activeWorkspace() === "inspector"}>
          <div class="ai-inspector-workspace">
            {/* Inspector Top Bar */}
            <div class="ai-inspector-header">
              <div class="inspector-header-left">
                <button
                  type="button"
                  class="ai-btn-sm"
                  onClick={() => setActiveWorkspace("matrix")}
                  title="Return to Library Matrix"
                >
                  <i class="ph-bold ph-arrow-left" /> Back to Matrix
                </button>
                <div class="inspector-track-title-wrap">
                  <h2 class="inspector-track-title">
                    {activeVideo()?.title || customAudioPath().split(/[\\/]/).pop() || "Select Track"}
                  </h2>
                  <span class="inspector-track-sub">
                    {activeVideo()?.channel || (sourceMode() === "custom" ? "Custom File" : "No track selected")}
                  </span>
                </div>
              </div>

              <div class="inspector-header-right">
                {/* Calibration Offset Bar */}
                <div class="inspector-offset-bar" title="Calibrate Lyrics Timing Offset">
                  <span class="offset-title">Timing Offset:</span>
                  <button type="button" class="offset-chip align-chip" onClick={handleAlignIntroToPlayhead} title="Align lyrics intro to audio playhead">
                    <i class="ph-bold ph-target" /> Align Intro
                  </button>
                  <button type="button" class="offset-chip" onClick={() => handleShiftOffset(-1.0)}>-1.0s</button>
                  <button type="button" class="offset-chip" onClick={() => handleShiftOffset(-0.2)}>-0.2s</button>
                  <button type="button" class="offset-chip" onClick={() => handleShiftOffset(0.2)}>+0.2s</button>
                  <button type="button" class="offset-chip" onClick={() => handleShiftOffset(1.0)}>+1.0s</button>
                </div>

                <Show when={activeVideo()}>
                  <button
                    type="button"
                    class="ai-btn-primary"
                    onClick={() => handlePlayInMainPlayer(activeVideo()!)}
                  >
                    <i class="ph-fill ph-play" /> Open in Media Player
                  </button>
                </Show>
              </div>
            </div>

            {/* Audio Transport Bar */}
            <div class="ai-inspector-transport">
              <audio
                ref={audioRef}
                src={activeAudioSrc()}
                onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
              />

              <div class="transport-controls">
                <button
                  type="button"
                  class="transport-play-btn"
                  onClick={togglePlayPause}
                  title={isPlaying() ? "Pause" : "Play"}
                >
                  <i class={`ph-fill ${isPlaying() ? "ph-pause" : "ph-play"}`} />
                </button>

                <div class="transport-timecode">
                  <span>{formatTimestamp(playbackTime())}</span>
                  <span class="time-divider">/</span>
                  <span>{formatTimestamp(audioDuration())}</span>
                </div>

                {/* Scrubber timeline */}
                <div class="transport-scrubber-wrap">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration() || 100}
                    step="0.05"
                    value={playbackTime()}
                    onInput={(e) => handleSeek(parseFloat(e.currentTarget.value))}
                    class="transport-scrubber"
                  />
                </div>

                {/* Speed buttons */}
                <div class="transport-speed-group">
                  <button
                    type="button"
                    class={`speed-chip ${playbackSpeed() === 0.75 ? "active" : ""}`}
                    onClick={() => handleSpeedChange(0.75)}
                  >
                    0.75x
                  </button>
                  <button
                    type="button"
                    class={`speed-chip ${playbackSpeed() === 1.0 ? "active" : ""}`}
                    onClick={() => handleSpeedChange(1.0)}
                  >
                    1x
                  </button>
                  <button
                    type="button"
                    class={`speed-chip ${playbackSpeed() === 1.25 ? "active" : ""}`}
                    onClick={() => handleSpeedChange(1.25)}
                  >
                    1.25x
                  </button>
                </div>

                {/* Generate / Retranscribe trigger */}
                <button
                  type="button"
                  class="ai-btn-sm pro"
                  disabled={isGenerating()}
                  onClick={handleGenerateInspectTrack}
                >
                  <Show when={isGenerating()} fallback={<><i class="ph-bold ph-lightning" /> Transcribe Track</>}>
                    <i class="ph-bold ph-spinner animate-spin" /> Transcribing...
                  </Show>
                </button>
              </div>
            </div>

            {/* Inspector Workspace Sub-Tabs */}
            <div class="ai-inspector-tabs-nav">
              <button
                type="button"
                class={`inspector-tab-btn ${inspectorTab() === "karaoke" ? "active" : ""}`}
                onClick={() => setInspectorTab("karaoke")}
              >
                <i class="ph-bold ph-waveform" /> Synchronized Karaoke View
              </button>
              <button
                type="button"
                class={`inspector-tab-btn ${inspectorTab() === "editor" ? "active" : ""}`}
                onClick={() => setInspectorTab("editor")}
              >
                <i class="ph-bold ph-pencil-simple-line" /> Pro LRC Text Editor
              </button>
              <button
                type="button"
                class={`inspector-tab-btn ${inspectorTab() === "raw" ? "active" : ""}`}
                onClick={() => setInspectorTab("raw")}
              >
                <i class="ph-bold ph-code" /> Raw Exports (VTT, SRT, JSON)
              </button>
            </div>

            {/* Tab 1: Live Karaoke Stream */}
            <Show when={inspectorTab() === "karaoke"}>
              <div class="ai-karaoke-stream-panel" ref={lyricsScrollContainer}>
                <Show
                  when={result()?.segments && result()!.segments.length > 0}
                  fallback={
                    <div class="ai-inspector-empty">
                      <i class="ph-bold ph-sparkle" />
                      <h3>No Synced Lyrics Loaded</h3>
                      <p>Click "Transcribe Track" above or choose a track from the Matrix to inspect its word-level alignments.</p>
                    </div>
                  }
                >
                  <div class="karaoke-stream-rows">
                    <For each={result()?.segments}>
                      {(seg, idx) => {
                        const isActive = () => activeSegmentIndex() === idx();
                        const isPast = () => activeSegmentIndex() > idx();

                        return (
                          <div
                            class={`karaoke-stream-row ${isActive() ? "is-active" : ""} ${isPast() ? "is-past" : ""}`}
                            onClick={() => handleSeek(seg.start)}
                            title={`Jump to ${formatTimestamp(seg.start)}`}
                          >
                            <span class="karaoke-row-time">{formatTimestamp(seg.start)}</span>

                            <div class="karaoke-row-words">
                              <Show
                                when={seg.words && seg.words.length > 0}
                                fallback={<span class="karaoke-plain-line">{seg.text}</span>}
                              >
                                <For each={seg.words}>
                                  {(w) => {
                                    const sung = () => playbackTime() >= w.end;
                                    const active = () => playbackTime() >= w.start && playbackTime() < w.end;
                                    return (
                                      <span class={`karaoke-syllable ${sung() ? "sung" : ""} ${active() ? "active" : ""}`}>
                                        {w.word}{" "}
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
              </div>
            </Show>

            {/* Tab 2: Pro LRC Text Editor */}
            <Show when={inspectorTab() === "editor"}>
              <div class="ai-lrc-editor-panel">
                <div class="editor-toolbar">
                  <div class="editor-toolbar-left">
                    <span class="editor-note">
                      <i class="ph-bold ph-info" /> Edit LRC lines and timestamps directly. Click Save to persist to disk.
                    </span>
                  </div>
                  <div class="editor-toolbar-right">
                    <button
                      type="button"
                      class="ai-btn-sm"
                      onClick={() => {
                        const timeTag = `[${formatTimestamp(playbackTime())}.00] `;
                        setEditableLrc((prev) => prev + "\n" + timeTag);
                      }}
                      title="Append current audio timecode tag"
                    >
                      <i class="ph-bold ph-clock" /> Stamp Current Time
                    </button>
                    <button
                      type="button"
                      class="ai-btn-primary"
                      disabled={isSavingLyrics()}
                      onClick={handleSaveLyrics}
                    >
                      <Show when={isSavingLyrics()} fallback={<><i class="ph-bold ph-floppy-disk" /> Save Changes</>}>
                        <i class="ph-bold ph-spinner animate-spin" /> Saving...
                      </Show>
                    </button>
                  </div>
                </div>

                <textarea
                  class="ai-lrc-textarea"
                  value={editableLrc()}
                  onInput={(e) => setEditableLrc(e.currentTarget.value)}
                  placeholder="Paste or edit [mm:ss.xx] LRC formatted lyrics here..."
                  rows={20}
                  spellcheck={false}
                />
              </div>
            </Show>

            {/* Tab 3: Raw Exports */}
            <Show when={inspectorTab() === "raw"}>
              <div class="ai-raw-export-panel">
                <div class="raw-export-header">
                  <div class="raw-format-pills">
                    <button
                      type="button"
                      class={`raw-pill ${rawTab() === "elrc" ? "active" : ""}`}
                      onClick={() => setRawTab("elrc")}
                    >
                      Enhanced LRC
                    </button>
                    <button
                      type="button"
                      class={`raw-pill ${rawTab() === "lrc" ? "active" : ""}`}
                      onClick={() => setRawTab("lrc")}
                    >
                      Standard LRC
                    </button>
                    <button
                      type="button"
                      class={`raw-pill ${rawTab() === "vtt" ? "active" : ""}`}
                      onClick={() => setRawTab("vtt")}
                    >
                      WebVTT
                    </button>
                    <button
                      type="button"
                      class={`raw-pill ${rawTab() === "srt" ? "active" : ""}`}
                      onClick={() => setRawTab("srt")}
                    >
                      SubRip (SRT)
                    </button>
                    <button
                      type="button"
                      class={`raw-pill ${rawTab() === "json" ? "active" : ""}`}
                      onClick={() => setRawTab("json")}
                    >
                      Raw JSON
                    </button>
                  </div>

                  <div class="raw-actions">
                    <button type="button" class="ai-btn-sm" onClick={handleCopyRaw}>
                      <i class={`ph-bold ${copied() ? "ph-check" : "ph-copy"}`} />
                      <span>{copied() ? "Copied!" : "Copy"}</span>
                    </button>
                    <button type="button" class="ai-btn-sm" onClick={() => handleOpenFolder("lyrics")}>
                      <i class="ph-bold ph-folder-open" /> Open Lyrics Folder
                    </button>
                  </div>
                </div>

                <pre class="raw-export-content">
                  {rawTab() === "elrc"
                    ? result()?.enhanced_lrc || "No Enhanced LRC data"
                    : rawTab() === "lrc"
                    ? result()?.lrc || "No LRC data"
                    : rawTab() === "vtt"
                    ? result()?.srt ? result()!.srt.replace(/,/g, ".") : "No WebVTT data"
                    : rawTab() === "srt"
                    ? result()?.srt || "No SRT data"
                    : JSON.stringify(result(), null, 2)}
                </pre>
              </div>
            </Show>
          </div>
        </Show>

        {/* ========================================================================= */}
        {/* WORKSPACE 3: NEURAL HUB & REPOSITORY                                      */}
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
                          <button
                            type="button"
                            class="ai-btn-danger-outline"
                            onClick={() => handleDeleteModel(m.name)}
                          >
                            <i class="ph-bold ph-trash" /> Remove
                          </button>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Hardware & Diagnostics Suite */}
            <div class="ai-hw-workspace" style={{ "margin-top": "24px" }}>
              <div class="ai-telemetry-hero">
                <div class="ai-telemetry-hero-left">
                  <span class="ai-badge dark">
                    <i class="ph-bold ph-cpu" /> Pure Rust Candle Diagnostics
                  </span>
                  <h2>Neural Inference Hardware Telemetry</h2>
                  <p>Real-time telemetry showing detected compute capability and VRAM capacity.</p>
                </div>

                <div class="ai-telemetry-hero-right">
                  <button
                    type="button"
                    class="ai-btn-primary"
                    disabled={isBenchmarking()}
                    onClick={handleRunBenchmark}
                  >
                    <Show when={isBenchmarking()} fallback={<><i class="ph-bold ph-gauge" /> Run Candle Benchmark</>}>
                      <i class="ph-bold ph-spinner animate-spin" /> Benchmarking...
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
                    <span class="hw-sub">{status()?.system?.cpu_cores || 8} Logical Cores • Rayon Pool</span>
                  </div>
                </div>

                <div class="ai-hw-card">
                  <div class="ai-hw-card-icon gpu"><i class="ph-fill ph-graphics-card" /></div>
                  <div class="ai-hw-card-info">
                    <span class="hw-label">Primary GPU</span>
                    <strong class="hw-value">{status()?.system?.primary_gpu?.name || "Integrated Graphics"}</strong>
                    <span class="hw-sub">
                      {status()?.system?.primary_gpu
                        ? `${(status()!.system!.primary_gpu!.vram_total_mb / 1024).toFixed(1)} GB VRAM`
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
                        Inference: {benchmarkResult()?.inference_ms}ms • Real-Time Factor: {benchmarkResult()?.real_time_factor.toFixed(2)}x ({benchmarkResult()?.speedup})
                      </p>
                    </div>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
