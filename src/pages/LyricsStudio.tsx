import {
  createSignal,
  onMount,
  onCleanup,
  For,
  Show,
  createMemo,
  createEffect,
} from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate, useSearchParams, A } from "@solidjs/router";
import {
  VideoEntry,
  isAiUnlocked,
  addToast,
  whisperDefaultModel,
  setWhisperDefaultModel,
  whisperDefaultTask,
  setWhisperDefaultTask,
  whisperComputeDevice,
  updateWhisperComputeDevice,
  whisperStatus,
  initWhisperStatus,
  WhisperStatus,
  setActiveVideo,
  showConfirmDialog,
  deleteLyricsForTrack,
  getThumbnailUrl,
} from "../store";
import { sortVideos } from "../utils/sortUtils";
import AiPaywall from "../components/AiPaywall";
import "./LyricsStudio.css";

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

function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function LyricsStudio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Instant render with cached engine status from store (0ms latency)
  const [status, setStatus] = createSignal<WhisperStatus | null>(whisperStatus());
  const [loadingStatus, setLoadingStatus] = createSignal(!whisperStatus());
  const [isPreviewMode, setIsPreviewMode] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [copiedError, setCopiedError] = createSignal(false);

  // Library & Currently Selected Video
  const [libraryVideos, setLibraryVideos] = createSignal<VideoEntry[]>([]);
  const [cachedLyricsList, setCachedLyricsList] = createSignal<CachedLyricItem[]>([]);
  const [selectedVideo, setSelectedVideo] = createSignal<VideoEntry | null>(null);
  const [customMediaFilePath, setCustomMediaFilePath] = createSignal<string>("");

  // Video Picker Pop-up Modal State
  const [showVideoPicker, setShowVideoPicker] = createSignal(false);
  const [pickerSearch, setPickerSearch] = createSignal("");
  const [pickerSort, setPickerSort] = createSignal<"date_desc" | "date_asc" | "title_asc" | "channel" | "duration">("date_desc");
  const [pickerStatusFilter, setPickerStatusFilter] = createSignal<"all" | "synced" | "missing">("all");

  // Video Player Runtime State
  let videoEl: HTMLVideoElement | undefined;
  let lyricsScrollEl: HTMLDivElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [volume, setVolume] = createSignal(1);
  const [isMuted, setIsMuted] = createSignal(false);
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1.0);

  // Lyrics & Generation State
  const [result, setResult] = createSignal<LyricsResult | null>(null);
  const [activeStudioTab, setActiveStudioTab] = createSignal<"karaoke" | "editor" | "formats">("karaoke");
  const [rawTab, setRawTab] = createSignal<"elrc" | "lrc" | "vtt" | "srt" | "json">("elrc");
  const [editableLrc, setEditableLrc] = createSignal("");
  const [isSavingLyrics, setIsSavingLyrics] = createSignal(false);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [genStatusMsg, setGenStatusMsg] = createSignal("");
  const [transcribeProgress, setTranscribeProgress] = createSignal<TranscribeProgress | null>(null);
  const [copied, setCopied] = createSignal(false);

  // Configuration Selectors
  const [selectedModel, setSelectedModel] = createSignal<string>(whisperDefaultModel() || "base");
  const [selectedTask, setSelectedTask] = createSignal<string>(whisperDefaultTask() || "transcribe");
  const [selectedLanguage, setSelectedLanguage] = createSignal<string>("auto");
  const [selectedDevice, setSelectedDevice] = createSignal<string>(whisperComputeDevice() || "auto");

  // Check lyrics sync status for any video
  const getTrackLyricsStatus = (vid: VideoEntry): { hasLyrics: boolean; format: "karaoke" | "lrc" | "subtitles" | "none" } => {
    const cached = cachedLyricsList();
    const cleanTitle = vid.title.replace(/[^a-zA-Z0-9_\-\. ]/g, "_");

    const matchEnhanced = cached.find(
      (c) =>
        (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename === `${vid.id}.enhanced.lrc`) &&
        c.filename.endsWith(".enhanced.lrc")
    );
    if (matchEnhanced) return { hasLyrics: true, format: "karaoke" };

    const matchLrc = cached.find(
      (c) =>
        (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename === `${vid.id}.lrc`) &&
        c.filename.endsWith(".lrc")
    );
    if (matchLrc) return { hasLyrics: true, format: "lrc" };

    const matchSub = cached.find(
      (c) =>
        (c.stem === vid.id || c.stem === vid.title || c.stem === cleanTitle || c.filename.startsWith(vid.id)) &&
        (c.filename.endsWith(".vtt") || c.filename.endsWith(".srt"))
    );
    if (matchSub) return { hasLyrics: true, format: "subtitles" };

    return { hasLyrics: false, format: "none" };
  };

  // Video Source resolution
  const activeVideoSrc = createMemo(() => {
    if (customMediaFilePath()) {
      try {
        return convertFileSrc(customMediaFilePath());
      } catch {
        return "";
      }
    }
    const vid = selectedVideo();
    if (!vid || !vid.video_path) return "";
    try {
      return convertFileSrc(vid.video_path);
    } catch {
      return "";
    }
  });

  // Active Lyric Segment Index based on Video Playhead
  const activeSegmentIndex = createMemo(() => {
    const res = result();
    if (!res || !res.segments || res.segments.length === 0) return -1;
    const t = currentTime();
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

  // Auto-scroll Karaoke container to keep active line centered
  createEffect(() => {
    const idx = activeSegmentIndex();
    if (idx >= 0 && lyricsScrollEl && activeStudioTab() === "karaoke") {
      const activeEl = lyricsScrollEl.querySelector(`[data-segment-index="${idx}"]`) as HTMLElement | null;
      if (activeEl) {
        const containerHeight = lyricsScrollEl.clientHeight;
        const lineTop = activeEl.offsetTop;
        const lineHeight = activeEl.clientHeight;
        const targetScroll = lineTop - containerHeight / 2 + lineHeight / 2;
        lyricsScrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
      }
    }
  });

  // Filtered & Sorted Videos for Video Picker Modal
  const filteredPickerVideos = createMemo(() => {
    let list = [...libraryVideos()];
    const q = pickerSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.channel && v.channel.toLowerCase().includes(q))
      );
    }

    const filter = pickerStatusFilter();
    if (filter === "missing") {
      list = list.filter((v) => !getTrackLyricsStatus(v).hasLyrics);
    } else if (filter === "synced") {
      list = list.filter((v) => getTrackLyricsStatus(v).hasLyrics);
    }

    const sort = pickerSort();
    if (sort === "title_asc") {
      return sortVideos(list, "title", "asc");
    } else if (sort === "channel") {
      return sortVideos(list, "channel", "asc");
    } else if (sort === "date_asc") {
      return sortVideos(list, "date", "asc");
    } else {
      return sortVideos(list, "date", "desc");
    }
  });

  // Load Library & History
  const fetchLibrary = async () => {
    try {
      const vids = await invoke<VideoEntry[]>("get_downloaded_videos");
      setLibraryVideos(vids);
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

  const fetchStatus = async (force = false) => {
    try {
      if (!status()) setLoadingStatus(true);
      const res = await initWhisperStatus(force);
      if (res) {
        setStatus(res);
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
      }
    } catch (e: any) {
      console.error("Failed to check whisper status:", e);
      setErrorMsg(String(e));
    } finally {
      setLoadingStatus(false);
    }
  };

  // Video Selection Handler
  const handleSelectVideo = async (vid: VideoEntry) => {
    setCustomMediaFilePath("");
    setSelectedVideo(vid);
    setShowVideoPicker(false);
    setResult(null);
    setEditableLrc("");

    if (videoEl) {
      videoEl.pause();
      setIsPlaying(false);
      videoEl.currentTime = 0;
      setCurrentTime(0);
    }

    try {
      const lyrics = await invoke<any>("get_track_lyrics", {
        trackId: vid.id,
        trackTitle: vid.title,
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
        addToast(`Loaded synchronized lyrics for "${vid.title}"`, "info");
      } else {
        setResult(null);
        setEditableLrc("");
      }
    } catch (err) {
      console.error("Failed to load lyrics:", err);
    }
  };

  // Browse local audio/video file from OS file picker
  const handleBrowseLocalFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio & Video Files",
            extensions: ["mp4", "mkv", "webm", "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        setCustomMediaFilePath(selected);
        setSelectedVideo(null);
        setResult(null);
        setEditableLrc("");
        setShowVideoPicker(false);
      }
    } catch (e) {
      console.error("File browse cancelled/failed", e);
    }
  };

  // Generate / Transcribe Currently Selected Video
  const handleGenerateLyrics = async () => {
    if (!isAiUnlocked() && !isPreviewMode()) {
      addToast("Whisper AI speech-to-lyrics requires an active Pro license.", "error");
      return;
    }

    const vid = selectedVideo();
    const localPath = customMediaFilePath();
    const mediaPath = vid ? vid.video_path : localPath;

    if (!mediaPath) {
      addToast("Please select a video or import a media file first.", "error");
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMsg("");
      setTranscribeProgress(null);
      setGenStatusMsg(`Transcribing audio with Whisper ${selectedModel().toUpperCase()}...`);

      const res = await invoke<LyricsResult>("generate_track_lyrics", {
        audioPath: mediaPath,
        trackId: vid ? vid.id : null,
        model: selectedModel(),
        task: selectedTask(),
        language: selectedLanguage() === "auto" ? null : selectedLanguage(),
        device: selectedDevice(),
      });

      setResult(res);
      setEditableLrc(res.enhanced_lrc || res.lrc || "");
      addToast("Synced lyrics and subtitles generated successfully!", "success");
      await fetchHistory();

      if (videoEl) {
        videoEl.currentTime = 0;
        setCurrentTime(0);
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

  // Offset shift nudgers
  const handleShiftOffset = async (offsetSec: number) => {
    const vid = selectedVideo();
    if (!vid) return;

    try {
      await invoke("adjust_lyrics_offset", {
        trackId: vid.id,
        offsetSec,
      });
      addToast(`Lyrics offset adjusted by ${(offsetSec > 0 ? "+" : "") + offsetSec.toFixed(2)}s`, "info");
      await handleSelectVideo(vid);
    } catch (err: any) {
      addToast(`Failed to shift offset: ${err}`, "error");
    }
  };

  // 1-Click "Align Intro to Playhead"
  const handleAlignIntroToPlayhead = async () => {
    const vid = selectedVideo();
    const res = result();
    if (!vid || !res || !res.segments || res.segments.length === 0) {
      addToast("No lyrics segments available to align.", "info");
      return;
    }

    const firstLineStart = res.segments[0].start;
    const curTime = currentTime();
    const diff = curTime - firstLineStart;
    if (Math.abs(diff) < 0.05) {
      addToast("Lyrics intro is already synchronized to playhead.", "info");
      return;
    }

    await handleShiftOffset(diff);
  };

  // Save custom edited lyrics
  const handleSaveLyrics = async () => {
    const vid = selectedVideo();
    if (!vid || !editableLrc().trim()) return;

    try {
      setIsSavingLyrics(true);
      await invoke("save_custom_lyrics", {
        trackId: vid.id,
        lrcContent: editableLrc(),
      });
      addToast("Custom lyrics saved to disk successfully!", "success");
      await fetchHistory();
      await handleSelectVideo(vid);
    } catch (err: any) {
      addToast(`Failed to save lyrics: ${err}`, "error");
    } finally {
      setIsSavingLyrics(false);
    }
  };

  // Delete lyrics action
  const handleDeleteLyrics = async () => {
    const vid = selectedVideo();
    if (!vid) return;

    const confirmed = await showConfirmDialog(
      `Are you sure you want to permanently delete the synced lyrics, karaoke timestamps, and subtitles for "${vid.title}"?`,
      "Delete Lyrics",
      "warning"
    );
    if (!confirmed) return;

    const ok = await deleteLyricsForTrack(vid.id);
    if (ok) {
      setResult(null);
      setEditableLrc("");
      await fetchHistory();
      addToast("Synced lyrics removed.", "info");
    }
  };

  // Play in main ViveStream player
  const handlePlayInMainPlayer = () => {
    const vid = selectedVideo();
    if (vid) {
      setActiveVideo(vid);
      navigate(`/player/${vid.id}`);
    }
  };

  // Copy raw formats
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

  // Video Player Control Handlers
  const togglePlay = () => {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      setIsPlaying(true);
    } else {
      videoEl.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (timeSec: number) => {
    if (!videoEl) return;
    videoEl.currentTime = timeSec;
    setCurrentTime(timeSec);
  };

  const handleStepTime = (offsetSec: number) => {
    if (!videoEl) return;
    const next = Math.max(0, Math.min(duration(), videoEl.currentTime + offsetSec));
    videoEl.currentTime = next;
    setCurrentTime(next);
  };

  const handleVolumeChange = (vol: number) => {
    if (!videoEl) return;
    videoEl.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!videoEl) return;
    const next = !isMuted();
    videoEl.muted = next;
    setIsMuted(next);
  };

  const handleSpeedChange = (spd: number) => {
    if (!videoEl) return;
    videoEl.playbackRate = spd;
    setPlaybackSpeed(spd);
  };

  // Lifecycle & Progress listeners
  onMount(async () => {
    await fetchStatus();
    await fetchLibrary();
    await fetchHistory();

    const unlistenTranscribe = listen<TranscribeProgress>("whisper-transcribe-progress", (event) => {
      setTranscribeProgress(event.payload);
      if (event.payload.message) {
        setGenStatusMsg(event.payload.message);
      }
    });

    onCleanup(async () => {
      (await unlistenTranscribe)();
    });
  });

  // Reactive URL parameter resolver: handles /lyrics?trackId=XYZ
  createEffect(() => {
    const tid = searchParams.trackId;
    const vids = libraryVideos();
    if (tid && vids.length > 0) {
      const match = vids.find((v) => v.id === tid);
      if (match && (!selectedVideo() || selectedVideo()?.id !== tid)) {
        handleSelectVideo(match);
      }
    }
  });

  return (
    <Show
      when={isAiUnlocked() || isPreviewMode()}
      fallback={
        <AiPaywall
          onPreviewToggle={() => setIsPreviewMode(true)}
          isPreviewing={isPreviewMode()}
        />
      }
    >
      <div class="lyrics-studio-container">
        {/* Sleek Top Studio Header */}
        <header class="studio-top-header">
          <div class="studio-header-left">
            <div class="studio-badge-row">
              <span class="studio-badge pro">
                <i class="ph-fill ph-seal-check" /> Pro Studio Engine
              </span>

              <span class="studio-telemetry-pill">
                <span class={`studio-led ${loadingStatus() ? "warning" : status()?.binary_installed ? "active" : "warning"}`} />
                {loadingStatus() ? "INITIALIZING..." : status()?.binary_installed ? "ENGINE ONLINE" : "ENGINE MISSING"}
              </span>

              <span class="studio-telemetry-pill">
                <i class="ph-bold ph-cpu" />
                {status()?.system?.primary_gpu
                  ? `${status()!.system!.primary_gpu!.name.toUpperCase()}`
                  : "CPU MULTI-THREAD"}
              </span>

              <span class="studio-telemetry-pill">
                <i class="ph-bold ph-sparkle" />
                MODEL: {selectedModel().toUpperCase()}
              </span>
            </div>

            <h1 class="studio-title">Lyrics Studio</h1>
            <p class="studio-subtitle">
              Inspect, generate, and synchronize word-level karaoke lyrics and subtitles using Whisper AI.
            </p>
          </div>

          <div class="studio-header-actions">
            <button
              type="button"
              class="studio-btn-primary"
              onClick={() => setShowVideoPicker(true)}
              title="Select or Change Video"
            >
              <i class="ph-bold ph-video-camera" />
              <span>{selectedVideo() || customMediaFilePath() ? "Change Video" : "Select Video"}</span>
            </button>

            <A href="/ai" class="studio-btn-secondary" title="Configure AI engine models & hardware">
              <i class="ph-bold ph-sliders" />
              <span>Models & AI Settings</span>
            </A>

            <button
              type="button"
              class="studio-btn-secondary"
              onClick={() => handleOpenFolder("lyrics")}
              title="Open local lyrics storage directory"
            >
              <i class="ph-bold ph-folder-open" />
              <span>Lyrics Folder</span>
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        <Show when={errorMsg()}>
          <div class="studio-alert-banner error">
            <i class="ph-fill ph-warning-circle" />
            <div class="studio-alert-content">
              <strong>Engine Alert:</strong> {errorMsg()}
            </div>
            <div class="studio-alert-actions">
              <button
                type="button"
                class="studio-btn-xs"
                onClick={() => {
                  navigator.clipboard.writeText(errorMsg());
                  setCopiedError(true);
                  setTimeout(() => setCopiedError(false), 2000);
                }}
              >
                <i class={`ph-bold ${copiedError() ? "ph-check" : "ph-copy"}`} />
                <span>{copiedError() ? "Copied" : "Copy Log"}</span>
              </button>
              <button type="button" class="studio-alert-close" onClick={() => setErrorMsg("")}>
                <i class="ph-bold ph-x" />
              </button>
            </div>
          </div>
        </Show>

        {/* Unified Studio Grid: Left (Video Player) + Right (Lyrics Visualization & Controls) */}
        <div class="studio-split-layout">
          {/* LEFT SIDE: Video Player & Track Details */}
          <div class="studio-left-column">
            <div class="studio-video-panel">
              <Show
                when={activeVideoSrc()}
                fallback={
                  <div class="studio-player-placeholder">
                    <div class="placeholder-mesh-glow" />
                    <div class="placeholder-content">
                      <div class="placeholder-icon-ring">
                        <i class="ph-bold ph-video" />
                      </div>
                      <h3>No Video Selected</h3>
                      <p>
                        Select a video from your downloaded library or import a media file to inspect, edit, or generate synchronized lyrics.
                      </p>
                      <div class="placeholder-btn-group">
                        <button
                          type="button"
                          class="studio-btn-primary pulse"
                          onClick={() => setShowVideoPicker(true)}
                        >
                          <i class="ph-bold ph-list-plus" />
                          <span>Select Video</span>
                        </button>
                        <button
                          type="button"
                          class="studio-btn-secondary"
                          onClick={handleBrowseLocalFile}
                        >
                          <i class="ph-bold ph-file-arrow-up" />
                          <span>Browse Local Media</span>
                        </button>
                      </div>
                    </div>
                  </div>
                }
              >
                {/* Active Video Player */}
                <div class="studio-video-wrapper">
                  <video
                    ref={videoEl}
                    src={activeVideoSrc()}
                    class="studio-video-element"
                    onTimeUpdate={() => {
                      if (videoEl) setCurrentTime(videoEl.currentTime);
                    }}
                    onLoadedMetadata={() => {
                      if (videoEl) setDuration(videoEl.duration);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />

                  {/* Sleek On-Screen Video Controls */}
                  <div class="studio-controls-bar">
                    <div class="timeline-seek-row">
                      <input
                        type="range"
                        min="0"
                        max={duration() || 100}
                        step="0.05"
                        value={currentTime()}
                        onInput={(e) => handleSeek(parseFloat(e.currentTarget.value))}
                        class="studio-seek-slider"
                      />
                    </div>

                    <div class="controls-action-row">
                      <div class="controls-left">
                        <button
                          type="button"
                          class="player-ctrl-btn primary"
                          onClick={togglePlay}
                          title={isPlaying() ? "Pause (Space)" : "Play (Space)"}
                        >
                          <i class={`ph-fill ph-${isPlaying() ? "pause" : "play"}`} />
                        </button>

                        <button
                          type="button"
                          class="player-ctrl-btn"
                          onClick={() => handleStepTime(-5)}
                          title="Rewind 5s"
                        >
                          <i class="ph-bold ph-arrow-counter-clockwise" />
                        </button>

                        <button
                          type="button"
                          class="player-ctrl-btn"
                          onClick={() => handleStepTime(5)}
                          title="Forward 5s"
                        >
                          <i class="ph-bold ph-arrow-clockwise" />
                        </button>

                        <div class="time-display-pill">
                          <span class="current">{formatTime(currentTime())}</span>
                          <span class="sep">/</span>
                          <span class="total">{formatTime(duration())}</span>
                        </div>
                      </div>

                      <div class="controls-right">
                        <div class="speed-selector">
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

                        <div class="volume-group">
                          <button type="button" class="player-ctrl-btn" onClick={toggleMute} title="Mute/Unmute">
                            <i class={`ph-bold ph-speaker-${isMuted() || volume() === 0 ? "x" : volume() < 0.5 ? "low" : "high"}`} />
                          </button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted() ? 0 : volume()}
                            onInput={(e) => handleVolumeChange(parseFloat(e.currentTarget.value))}
                            class="volume-slider"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Show>
            </div>

            {/* Video Metadata & Quick Switch Card */}
            <Show when={selectedVideo() || customMediaFilePath()}>
              <div class="studio-track-card">
                <div class="track-card-thumb">
                  <Show
                    when={selectedVideo()}
                    fallback={
                      <div class="custom-file-thumb">
                        <i class="ph-bold ph-file-audio" />
                      </div>
                    }
                  >
                    <img src={getThumbnailUrl(selectedVideo()!)} alt={selectedVideo()!.title} />
                  </Show>
                </div>

                <div class="track-card-details">
                  <h3 class="track-title" title={selectedVideo()?.title || customMediaFilePath()}>
                    {selectedVideo()?.title || customMediaFilePath().split(/[\\/]/).pop()}
                  </h3>
                  <p class="track-channel">
                    {selectedVideo()?.channel || "Custom Imported File"}
                  </p>
                  <div class="track-status-row">
                    <span
                      class={`sync-status-pill ${
                        result()
                          ? result()?.enhanced_lrc
                            ? "karaoke"
                            : "lrc"
                          : "missing"
                      }`}
                    >
                      <i
                        class={`ph-fill ${
                          result()
                            ? result()?.enhanced_lrc
                              ? "ph-microphone-stage"
                              : "ph-waveform"
                            : "ph-x-circle"
                        }`}
                      />
                      {result()
                        ? result()?.enhanced_lrc
                          ? "Word-Synced Karaoke"
                          : "Line-Synced LRC"
                        : "No Synced Lyrics Found"}
                    </span>
                  </div>
                </div>

                <div class="track-card-actions">
                  <button
                    type="button"
                    class="studio-btn-sm"
                    onClick={() => setShowVideoPicker(true)}
                    title="Choose a different video from library"
                  >
                    <i class="ph-bold ph-arrows-left-right" />
                    <span>Change</span>
                  </button>

                  <Show when={selectedVideo()}>
                    <button
                      type="button"
                      class="studio-btn-sm"
                      onClick={handlePlayInMainPlayer}
                      title="Open and play this track in the full ViveStream Player"
                    >
                      <i class="ph-bold ph-play-circle" />
                      <span>Play in Player</span>
                    </button>
                  </Show>
                </div>
              </div>
            </Show>
          </div>

          {/* RIGHT SIDE: Lyrics Visualization, Editor & Neural Controls */}
          <div class="studio-right-column">
            {/* Neural Engine Parameters Toolbar */}
            <div class="studio-config-toolbar">
              <div class="config-item">
                <label>Whisper Model:</label>
                <select
                  value={selectedModel()}
                  onChange={(e) => {
                    setSelectedModel(e.currentTarget.value);
                    setWhisperDefaultModel(e.currentTarget.value);
                  }}
                  class="studio-select"
                >
                  <For each={status()?.models || []}>
                    {(m) => (
                      <option value={m.name}>
                        {m.name.toUpperCase()} {m.installed ? "• [Installed]" : "• [Remote]"}
                      </option>
                    )}
                  </For>
                </select>
              </div>

              <div class="config-item">
                <label>Acceleration:</label>
                <select
                  value={selectedDevice()}
                  onChange={(e) => {
                    setSelectedDevice(e.currentTarget.value);
                    updateWhisperComputeDevice(e.currentTarget.value);
                  }}
                  class="studio-select"
                >
                  <option value="auto">Auto (Intel Arc GPU Preferred)</option>
                  <option value="gpu:0">
                    GPU: {status()?.system?.primary_gpu?.name || "Discrete GPU"}
                  </option>
                  <option value="cpu">CPU (Multi-Threaded Rayon)</option>
                </select>
              </div>

              <div class="config-item">
                <label>Task:</label>
                <select
                  value={selectedTask()}
                  onChange={(e) => {
                    setSelectedTask(e.currentTarget.value);
                    setWhisperDefaultTask(e.currentTarget.value);
                  }}
                  class="studio-select"
                >
                  <option value="transcribe">Transcribe (Original)</option>
                  <option value="translate">Translate to English</option>
                </select>
              </div>

              <div class="config-item">
                <label>Language:</label>
                <select
                  value={selectedLanguage()}
                  onChange={(e) => setSelectedLanguage(e.currentTarget.value)}
                  class="studio-select"
                >
                  <option value="auto">Auto-Detect</option>
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
            </div>

            {/* Generation & Calibration Action Strip */}
            <div class="studio-action-strip">
              <Show
                when={result()}
                fallback={
                  <div class="generate-prompt-box">
                    <button
                      type="button"
                      class="studio-btn-generate"
                      disabled={isGenerating() || (!selectedVideo() && !customMediaFilePath())}
                      onClick={handleGenerateLyrics}
                    >
                      <Show
                        when={isGenerating()}
                        fallback={
                          <>
                            <i class="ph-bold ph-sparkle" />
                            <span>Generate Synced Lyrics with Whisper</span>
                          </>
                        }
                      >
                        <i class="ph ph-spinner ph-spin" />
                        <span>Transcribing Audio...</span>
                      </Show>
                    </button>
                    <span class="generate-subtext">
                      Pure Rust Candle neural recognition with word-accurate syllable timestamps.
                    </span>
                  </div>
                }
              >
                {/* Calibration controls when lyrics exist */}
                <div class="calibration-row">
                  <div class="offset-nudgers">
                    <span class="nudger-label">Offset:</span>
                    <button type="button" class="nudger-btn" onClick={() => handleShiftOffset(-1.0)} title="Shift earlier 1.0s">
                      -1s
                    </button>
                    <button type="button" class="nudger-btn" onClick={() => handleShiftOffset(-0.2)} title="Shift earlier 0.2s">
                      -0.2s
                    </button>
                    <button type="button" class="nudger-btn" onClick={() => handleShiftOffset(0.2)} title="Shift later 0.2s">
                      +0.2s
                    </button>
                    <button type="button" class="nudger-btn" onClick={() => handleShiftOffset(1.0)} title="Shift later 1.0s">
                      +1s
                    </button>
                  </div>

                  <button
                    type="button"
                    class="studio-btn-align"
                    onClick={handleAlignIntroToPlayhead}
                    title="Lock the first sung lyric line directly to the current video playhead"
                  >
                    <i class="ph-bold ph-target" />
                    <span>Align Intro to Playhead</span>
                  </button>

                  <div class="action-strip-end">
                    <button
                      type="button"
                      class="studio-btn-secondary-sm"
                      disabled={isGenerating()}
                      onClick={handleGenerateLyrics}
                      title="Re-run Whisper neural transcription on this track"
                    >
                      <i class="ph-bold ph-arrows-clockwise" />
                      <span>Regenerate</span>
                    </button>

                    <button
                      type="button"
                      class="studio-btn-danger-sm"
                      onClick={handleDeleteLyrics}
                      title="Delete all synced lyrics & subtitles for this track"
                    >
                      <i class="ph-bold ph-trash" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </Show>

              {/* Real-time Transcription Progress Indicator */}
              <Show when={isGenerating()}>
                <div class="studio-progress-card">
                  <div class="progress-info-row">
                    <span class="progress-msg">
                      <i class="ph-fill ph-waveform lyrics-pulse" />
                      {genStatusMsg() || transcribeProgress()?.message || "Running neural speech decoder..."}
                    </span>
                    <span class="progress-pct">
                      {Math.round(transcribeProgress()?.percent || 0)}%
                    </span>
                  </div>
                  <div class="studio-progress-track">
                    <div
                      class="studio-progress-fill"
                      style={{ width: `${Math.max(5, Math.min(100, transcribeProgress()?.percent || 0))}%` }}
                    />
                  </div>
                </div>
              </Show>
            </div>

            {/* Studio Workspace Tabs: Karaoke, Editor, Formats */}
            <div class="studio-tabs-bar">
              <div class="tabs-left">
                <button
                  type="button"
                  class={`studio-tab-btn ${activeStudioTab() === "karaoke" ? "active" : ""}`}
                  onClick={() => setActiveStudioTab("karaoke")}
                >
                  <i class="ph-fill ph-microphone-stage" />
                  <span>Karaoke Stream</span>
                </button>
                <button
                  type="button"
                  class={`studio-tab-btn ${activeStudioTab() === "editor" ? "active" : ""}`}
                  onClick={() => setActiveStudioTab("editor")}
                >
                  <i class="ph-fill ph-note-pencil" />
                  <span>LRC Editor</span>
                </button>
                <button
                  type="button"
                  class={`studio-tab-btn ${activeStudioTab() === "formats" ? "active" : ""}`}
                  onClick={() => setActiveStudioTab("formats")}
                >
                  <i class="ph-fill ph-code" />
                  <span>Export & Formats</span>
                </button>
              </div>

              <div class="tabs-right">
                <Show when={activeStudioTab() === "editor"}>
                  <button
                    type="button"
                    class="studio-btn-primary-sm"
                    disabled={isSavingLyrics() || !editableLrc().trim()}
                    onClick={handleSaveLyrics}
                  >
                    <i class="ph-bold ph-floppy-disk" />
                    <span>{isSavingLyrics() ? "Saving..." : "Save to Disk"}</span>
                  </button>
                </Show>

                <Show when={activeStudioTab() === "formats"}>
                  <button type="button" class="studio-btn-secondary-sm" onClick={handleCopyRaw}>
                    <i class={`ph-bold ${copied() ? "ph-check" : "ph-copy"}`} />
                    <span>{copied() ? "Copied" : "Copy to Clipboard"}</span>
                  </button>
                </Show>
              </div>
            </div>

            {/* TAB 1: Live Interactive Karaoke Stream */}
            <Show when={activeStudioTab() === "karaoke"}>
              <div class="studio-karaoke-viewer" ref={lyricsScrollEl}>
                <Show
                  when={result() && result()!.segments && result()!.segments.length > 0}
                  fallback={
                    <div class="karaoke-empty-box">
                      <i class="ph-fill ph-waveform" />
                      <h4>No Lyrics to Display</h4>
                      <p>
                        Load a video and click "Generate Synced Lyrics with Whisper" to watch real-time synchronized karaoke syllables.
                      </p>
                    </div>
                  }
                >
                  <div class="karaoke-lines-list">
                    <For each={result()!.segments}>
                      {(seg, segIdx) => {
                        const isActive = () => activeSegmentIndex() === segIdx();
                        const isPast = () => activeSegmentIndex() > segIdx();

                        return (
                          <div
                            data-segment-index={segIdx()}
                            class={`karaoke-line-row ${isActive() ? "is-active" : ""} ${isPast() ? "is-past" : ""}`}
                            onClick={() => handleSeek(seg.start)}
                            title={`Jump video playhead to ${formatTime(seg.start)}`}
                          >
                            <span class="line-timestamp">{formatTime(seg.start)}</span>

                            <div class="line-text-wrap">
                              <Show
                                when={seg.words && seg.words.length > 0}
                                fallback={<span class="plain-line-text">{seg.text}</span>}
                              >
                                <div class="karaoke-words-row">
                                  <For each={seg.words}>
                                    {(w) => {
                                      const isWordActive = () => currentTime() >= w.start && currentTime() <= w.end;
                                      const isWordSung = () => currentTime() > w.end;
                                      return (
                                        <span
                                          class={`karaoke-word ${isWordActive() ? "active" : ""} ${isWordSung() ? "sung" : ""}`}
                                        >
                                          {w.word}{" "}
                                        </span>
                                      );
                                    }}
                                  </For>
                                </div>
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

            {/* TAB 2: Direct LRC & Timestamp Editor */}
            <Show when={activeStudioTab() === "editor"}>
              <div class="studio-editor-container">
                <div class="editor-subbar">
                  <span class="editor-hint">
                    Edit synced lyrics directly. Use the stamp button to insert the current video playhead timestamp.
                  </span>
                  <button
                    type="button"
                    class="stamp-time-btn"
                    onClick={() => {
                      const t = currentTime();
                      const m = Math.floor(t / 60);
                      const s = (t % 60).toFixed(2);
                      const tag = `[${m.toString().padStart(2, "0")}:${s.padStart(5, "0")}] `;
                      setEditableLrc((prev) => `${prev}\n${tag}`);
                    }}
                  >
                    <i class="ph-bold ph-clock" />
                    <span>Stamp Playhead ({formatTime(currentTime())})</span>
                  </button>
                </div>

                <textarea
                  class="studio-lrc-textarea"
                  value={editableLrc()}
                  onInput={(e) => setEditableLrc(e.currentTarget.value)}
                  placeholder="[00:00.00] Enter synchronized lyrics here..."
                  spellcheck={false}
                />
              </div>
            </Show>

            {/* TAB 3: Multi-Format Exporter */}
            <Show when={activeStudioTab() === "formats"}>
              <div class="studio-formats-container">
                <div class="formats-pill-selector">
                  <button
                    type="button"
                    class={`fmt-pill ${rawTab() === "elrc" ? "active" : ""}`}
                    onClick={() => setRawTab("elrc")}
                  >
                    Enhanced LRC (.elrc)
                  </button>
                  <button
                    type="button"
                    class={`fmt-pill ${rawTab() === "lrc" ? "active" : ""}`}
                    onClick={() => setRawTab("lrc")}
                  >
                    Standard LRC (.lrc)
                  </button>
                  <button
                    type="button"
                    class={`fmt-pill ${rawTab() === "vtt" ? "active" : ""}`}
                    onClick={() => setRawTab("vtt")}
                  >
                    WebVTT (.vtt)
                  </button>
                  <button
                    type="button"
                    class={`fmt-pill ${rawTab() === "srt" ? "active" : ""}`}
                    onClick={() => setRawTab("srt")}
                  >
                    SubRip (.srt)
                  </button>
                  <button
                    type="button"
                    class={`fmt-pill ${rawTab() === "json" ? "active" : ""}`}
                    onClick={() => setRawTab("json")}
                  >
                    Raw Whisper JSON
                  </button>
                </div>

                <div class="format-code-block">
                  <pre>
                    <code>
                      {(() => {
                        const res = result();
                        if (!res) return "// No lyrics generated yet. Run Whisper neural recognition to inspect formats.";
                        if (rawTab() === "elrc") return res.enhanced_lrc || res.lrc;
                        if (rawTab() === "lrc") return res.lrc;
                        if (rawTab() === "srt") return res.srt;
                        if (rawTab() === "vtt") return res.srt ? res.srt.replace(/,/g, ".") : "";
                        if (rawTab() === "json") return JSON.stringify(res, null, 2);
                        return "";
                      })()}
                    </code>
                  </pre>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* POP-UP MODAL: Video Selection Window (Homepage Grid Layout) */}
        <Show when={showVideoPicker()}>
          <div class="video-picker-overlay" onClick={() => setShowVideoPicker(false)}>
            <div class="video-picker-modal" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div class="modal-header">
                <div class="modal-title-group">
                  <i class="ph-bold ph-video-camera modal-icon" />
                  <div>
                    <h2>Select Video from Library</h2>
                    <p>Choose any video to load into Lyrics Studio for playback and synchronization.</p>
                  </div>
                </div>

                <button
                  type="button"
                  class="modal-close-btn"
                  onClick={() => setShowVideoPicker(false)}
                  title="Close (Esc)"
                >
                  <i class="ph-bold ph-x" />
                </button>
              </div>

              {/* Search & Filter Toolbar */}
              <div class="modal-toolbar">
                <div class="modal-search-box">
                  <i class="ph-bold ph-magnifying-glass" />
                  <input
                    type="text"
                    placeholder="Search videos by title or artist..."
                    value={pickerSearch()}
                    onInput={(e) => setPickerSearch(e.currentTarget.value)}
                    autofocus
                  />
                  <Show when={pickerSearch()}>
                    <button
                      type="button"
                      class="search-clear-btn"
                      onClick={() => setPickerSearch("")}
                    >
                      <i class="ph-bold ph-x-circle" />
                    </button>
                  </Show>
                </div>

                <div class="modal-filter-group">
                  <button
                    type="button"
                    class={`modal-filter-chip ${pickerStatusFilter() === "all" ? "active" : ""}`}
                    onClick={() => setPickerStatusFilter("all")}
                  >
                    All ({libraryVideos().length})
                  </button>
                  <button
                    type="button"
                    class={`modal-filter-chip ${pickerStatusFilter() === "synced" ? "active" : ""}`}
                    onClick={() => setPickerStatusFilter("synced")}
                  >
                    Synced Lyrics
                  </button>
                  <button
                    type="button"
                    class={`modal-filter-chip ${pickerStatusFilter() === "missing" ? "active" : ""}`}
                    onClick={() => setPickerStatusFilter("missing")}
                  >
                    Missing Lyrics
                  </button>
                </div>

                <div class="modal-sort-box">
                  <label>Sort:</label>
                  <select
                    value={pickerSort()}
                    onChange={(e: any) => setPickerSort(e.currentTarget.value)}
                    class="studio-select"
                  >
                    <option value="date_desc">Recently Added</option>
                    <option value="date_asc">Oldest First</option>
                    <option value="title_asc">Title (A-Z)</option>
                    <option value="channel">Channel / Artist</option>
                    <option value="duration">Duration</option>
                  </select>
                </div>
              </div>

              {/* Modal Video Grid */}
              <div class="modal-video-grid">
                <Show
                  when={filteredPickerVideos().length > 0}
                  fallback={
                    <div class="picker-empty-state">
                      <i class="ph-bold ph-magnifying-glass" />
                      <h4>No matching videos found</h4>
                      <p>Try searching with a different title or clearing the status filter.</p>
                    </div>
                  }
                >
                  <For each={filteredPickerVideos()}>
                    {(vid) => {
                      const status = () => getTrackLyricsStatus(vid);
                      const isCurrent = () => selectedVideo()?.id === vid.id;

                      return (
                        <div
                          class={`picker-video-card ${isCurrent() ? "is-selected" : ""}`}
                          onClick={() => handleSelectVideo(vid)}
                        >
                          <div class="picker-thumb-wrapper">
                            <img src={getThumbnailUrl(vid)} alt={vid.title} loading="lazy" />
                            <span class="picker-duration">Local Video</span>

                            <Show when={status().hasLyrics}>
                              <span class={`picker-sync-badge ${status().format}`}>
                                <i class="ph-fill ph-check" />
                                {status().format === "karaoke" ? "Karaoke" : "LRC"}
                              </span>
                            </Show>
                          </div>

                          <div class="picker-meta">
                            <h4 class="picker-title" title={vid.title}>
                              {vid.title}
                            </h4>
                            <p class="picker-channel" title={vid.channel}>
                              {vid.channel}
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>

              {/* Modal Footer */}
              <div class="modal-footer">
                <span class="modal-count-text">
                  Showing {filteredPickerVideos().length} of {libraryVideos().length} library tracks
                </span>

                <button
                  type="button"
                  class="studio-btn-secondary"
                  onClick={handleBrowseLocalFile}
                >
                  <i class="ph-bold ph-file-arrow-up" />
                  <span>Import External File</span>
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
