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
  activeVideo,
  showConfirmDialog,
  deleteLyricsForTrack,
  getThumbnailUrl,
  studioSelectedVideo,
  setStudioSelectedVideo,
  studioCustomMediaPath,
  setStudioCustomMediaPath,
  studioResult,
  setStudioResult,
  studioEditableLrc,
  setStudioEditableLrc,
  studioIsGenerating,
  setStudioIsGenerating,
  studioGenStatusMsg,
  setStudioGenStatusMsg,
  transcribeProgress,
  setTranscribeProgress,
  studioActiveTab,
  setStudioActiveTab,
  studioRawTab,
  setStudioRawTab,
  studioSelectedModel,
  setStudioSelectedModel,
  studioSelectedTask,
  setStudioSelectedTask,
  studioSelectedLanguage,
  setStudioSelectedLanguage,
  studioSelectedDevice,
  setStudioSelectedDevice,
  runStudioLyricsGeneration,
  StudioLyricsResult,
} from "../store";
import { sortVideos } from "../utils/sortUtils";
import AiPaywall from "../components/AiPaywall";
import CustomSelect from "../components/CustomSelect";
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
  const selectedVideo = studioSelectedVideo;
  const setSelectedVideo = setStudioSelectedVideo;
  const customMediaFilePath = studioCustomMediaPath;
  const setCustomMediaFilePath = setStudioCustomMediaPath;

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

  // Lyrics & Generation State (persisted globally across navigation)
  const result = studioResult;
  const setResult = setStudioResult;
  const activeStudioTab = studioActiveTab;
  const setActiveStudioTab = setStudioActiveTab;
  const rawTab = studioRawTab;
  const setRawTab = setStudioRawTab;
  const editableLrc = studioEditableLrc;
  const setEditableLrc = setStudioEditableLrc;
  const [isSavingLyrics, setIsSavingLyrics] = createSignal(false);
  const isGenerating = studioIsGenerating;
  const setIsGenerating = setStudioIsGenerating;
  const genStatusMsg = studioGenStatusMsg;
  const setGenStatusMsg = setStudioGenStatusMsg;
  const [copied, setCopied] = createSignal(false);

  // Configuration Selectors (persisted globally across navigation)
  const selectedModel = studioSelectedModel;
  const setSelectedModel = setStudioSelectedModel;
  const selectedTask = studioSelectedTask;
  const setSelectedTask = setStudioSelectedTask;
  const selectedLanguage = studioSelectedLanguage;
  const setSelectedLanguage = setStudioSelectedLanguage;
  const selectedDevice = studioSelectedDevice;
  const setSelectedDevice = setStudioSelectedDevice;

  // Visual Lyrics Line Model & Editor State
  interface VisualLyricLine {
    id: string;
    startSec: number;
    text: string;
  }

  const [editorMode, setEditorMode] = createSignal<"visual" | "raw">("visual");
  const [editorFont, setEditorFont] = createSignal<"google-sans" | "major-mono" | "system-mono">("google-sans");
  const [editorFontSize, setEditorFontSize] = createSignal<"sm" | "md" | "lg">("md");
  const [visualLines, setVisualLines] = createSignal<VisualLyricLine[]>([]);
  const [showSearchReplace, setShowSearchReplace] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [replaceQuery, setReplaceQuery] = createSignal("");
  const [lastSyncedLrc, setLastSyncedLrc] = createSignal("");

  const parseLrcToVisual = (raw: string): VisualLyricLine[] => {
    if (!raw) return [];
    const lines = raw.split("\n");
    const parsed: VisualLyricLine[] = [];
    const regex = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      const match = trimmed.match(regex);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseFloat(match[2]);
        const startSec = Math.max(0, +(min * 60 + sec).toFixed(2));
        const text = match[3].replace(/<[^>]+>/g, "").trim();
        parsed.push({
          id: `line-${i}-${Math.random().toString(36).substr(2, 5)}`,
          startSec,
          text,
        });
      }
    }
    return parsed;
  };

  const visualToLrc = (lines: VisualLyricLine[]): string => {
    return lines
      .map((l) => {
        const min = Math.floor(Math.max(0, l.startSec) / 60);
        const sec = (Math.max(0, l.startSec) % 60).toFixed(2);
        return `[${min.toString().padStart(2, "0")}:${sec.padStart(5, "0")}] ${l.text}`;
      })
      .join("\n");
  };

  // Synchronize visual lines when editableLrc changes from external sources
  createEffect(() => {
    const raw = editableLrc();
    if (raw !== lastSyncedLrc()) {
      setLastSyncedLrc(raw);
      setVisualLines(parseLrcToVisual(raw));
    }
  });

  const commitVisualLines = (updated: VisualLyricLine[]) => {
    setVisualLines(updated);
    const serialized = visualToLrc(updated);
    setLastSyncedLrc(serialized);
    setEditableLrc(serialized);
  };

  const handleUpdateLineText = (id: string, text: string) => {
    const updated = visualLines().map((l) => (l.id === id ? { ...l, text } : l));
    commitVisualLines(updated);
  };

  const handleUpdateLineTime = (id: string, sec: number) => {
    const updated = visualLines().map((l) =>
      l.id === id ? { ...l, startSec: Math.max(0, +sec.toFixed(2)) } : l
    );
    commitVisualLines(updated);
  };

  const handleNudgeLine = (id: string, delta: number) => {
    const updated = visualLines().map((l) =>
      l.id === id ? { ...l, startSec: Math.max(0, +(l.startSec + delta).toFixed(2)) } : l
    );
    commitVisualLines(updated);
  };

  const handleStampLine = (id: string) => {
    const updated = visualLines().map((l) =>
      l.id === id ? { ...l, startSec: +currentTime().toFixed(2) } : l
    );
    commitVisualLines(updated);
    addToast("Stamped current video playhead", "info");
  };

  const handlePlayLine = (sec: number) => {
    if (videoEl) {
      videoEl.currentTime = sec;
      videoEl.play();
      setIsPlaying(true);
    }
  };

  const handleInsertLineBelow = (idx: number) => {
    const current = visualLines();
    const prevSec = current[idx]?.startSec ?? currentTime();
    const nextSec = current[idx + 1]?.startSec ?? prevSec + 3.0;
    const newSec = +((prevSec + nextSec) / 2).toFixed(2);
    const newLine: VisualLyricLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      startSec: newSec,
      text: "",
    };
    const updated = [...current.slice(0, idx + 1), newLine, ...current.slice(idx + 1)];
    commitVisualLines(updated);
  };

  const handleDeleteLine = (id: string) => {
    const updated = visualLines().filter((l) => l.id !== id);
    commitVisualLines(updated);
  };

  const handleAddLineAtPlayhead = () => {
    const t = +currentTime().toFixed(2);
    const newLine: VisualLyricLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      startSec: t,
      text: "",
    };
    const updated = [...visualLines(), newLine].sort((a, b) => a.startSec - b.startSec);
    commitVisualLines(updated);
    addToast(`Added lyric line at ${formatTime(t)}`, "info");
  };

  const handleShiftAllVisualLines = (delta: number) => {
    const updated = visualLines().map((l) => ({
      ...l,
      startSec: Math.max(0, +(l.startSec + delta).toFixed(2)),
    }));
    commitVisualLines(updated);
    addToast(`Shifted all timestamps by ${delta > 0 ? "+" : ""}${delta}s`, "info");
  };

  const handleSortVisualLines = () => {
    const updated = [...visualLines()].sort((a, b) => a.startSec - b.startSec);
    commitVisualLines(updated);
    addToast("Sorted lines chronologically", "info");
  };

  const handleExecuteReplace = (replaceAll: boolean) => {
    const q = searchQuery();
    const r = replaceQuery();
    if (!q) return;

    let count = 0;
    const updated = visualLines().map((l) => {
      if (!l.text.includes(q)) return l;
      if (replaceAll) {
        const occurrences = l.text.split(q).length - 1;
        count += occurrences;
        return { ...l, text: l.text.replaceAll(q, r) };
      } else if (count === 0) {
        count = 1;
        return { ...l, text: l.text.replace(q, r) };
      }
      return l;
    });

    if (count > 0) {
      commitVisualLines(updated);
      addToast(`Replaced ${count} occurrence${count > 1 ? "s" : ""}`, "success");
    } else {
      addToast(`No matches found for "${q}"`, "warning");
    }
  };

  const activeVisualLineIndex = createMemo(() => {
    const lines = visualLines();
    if (lines.length === 0) return -1;
    const t = currentTime();
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startSec <= t) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  });

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
        const containerRect = lyricsScrollEl.getBoundingClientRect();
        const lineRect = activeEl.getBoundingClientRect();
        const offset = lineRect.top - containerRect.top - (containerRect.height / 2) + (lineRect.height / 2);
        lyricsScrollEl.scrollBy({ top: offset, behavior: "smooth" });
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
      setErrorMsg("");
      await runStudioLyricsGeneration(
        mediaPath,
        vid,
        selectedModel(),
        selectedTask(),
        selectedLanguage(),
        selectedDevice()
      );
      await fetchHistory();

      if (videoEl) {
        videoEl.currentTime = 0;
        setCurrentTime(0);
      }
    } catch (e: any) {
      setErrorMsg(`Generation failed: ${e}`);
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

  // Reactive URL parameter resolver: handles /lyrics?trackId=XYZ or /lyrics?id=XYZ or /lyrics-studio?id=XYZ
  createEffect(() => {
    const tid = searchParams.trackId || searchParams.id;
    if (!tid) return;

    const vids = libraryVideos();
    if (vids.length > 0) {
      const match = vids.find((v) => v.id === tid);
      if (match && (!selectedVideo() || selectedVideo()?.id !== tid)) {
        handleSelectVideo(match);
        return;
      }
    }

    const currentVid = activeVideo();
    if (currentVid && currentVid.id === tid && (!selectedVideo() || selectedVideo()?.id !== tid)) {
      handleSelectVideo(currentVid);
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
                <CustomSelect
                  size="sm"
                  value={selectedModel()}
                  onChange={(val) => {
                    setSelectedModel(val);
                    setWhisperDefaultModel(val);
                  }}
                  options={(status()?.models || []).map((m) => ({
                    value: m.name,
                    label: m.name.toUpperCase(),
                    badge: m.installed ? "Installed" : "Remote",
                    icon: "ph-bold ph-cube",
                  }))}
                />
              </div>

              <div class="config-item">
                <label>Acceleration:</label>
                <CustomSelect
                  size="sm"
                  value={selectedDevice()}
                  onChange={(val) => {
                    setSelectedDevice(val);
                    updateWhisperComputeDevice(val);
                  }}
                  options={[
                    {
                      value: "auto",
                      label: "Auto (DirectML / Arc)",
                      badge: "Auto",
                      icon: "ph-bold ph-sparkle",
                    },
                    {
                      value: "gpu:0",
                      label: `GPU: ${status()?.system?.primary_gpu?.name || "Discrete GPU"}`,
                      badge: "GPU",
                      icon: "ph-bold ph-lightning",
                    },
                    {
                      value: "cpu",
                      label: "CPU (Rayon SIMD)",
                      badge: "CPU",
                      icon: "ph-bold ph-cpu",
                    },
                  ]}
                />
              </div>

              <div class="config-item">
                <label>Task:</label>
                <CustomSelect
                  size="sm"
                  value={selectedTask()}
                  onChange={(val) => {
                    setSelectedTask(val);
                    setWhisperDefaultTask(val);
                  }}
                  options={[
                    {
                      value: "transcribe",
                      label: "Transcribe (Original)",
                      badge: "Native",
                      icon: "ph-bold ph-waveform",
                    },
                    {
                      value: "translate",
                      label: "Translate to English",
                      badge: "EN",
                      icon: "ph-bold ph-translate",
                    },
                  ]}
                />
              </div>

              <div class="config-item">
                <label>Language:</label>
                <CustomSelect
                  size="sm"
                  value={selectedLanguage()}
                  onChange={(val) => setSelectedLanguage(val)}
                  options={[
                    { value: "auto", label: "Auto-Detect", icon: "ph-bold ph-globe" },
                    { value: "bn", label: "Bengali (Bangla)", badge: "BN" },
                    { value: "hi", label: "Hindi", badge: "HI" },
                    { value: "en", label: "English", badge: "EN" },
                    { value: "ja", label: "Japanese", badge: "JA" },
                    { value: "ko", label: "Korean", badge: "KO" },
                    { value: "es", label: "Spanish", badge: "ES" },
                    { value: "fr", label: "French", badge: "FR" },
                    { value: "de", label: "German", badge: "DE" },
                    { value: "zh", label: "Chinese", badge: "ZH" },
                    { value: "ur", label: "Urdu", badge: "UR" },
                    { value: "pa", label: "Punjabi", badge: "PA" },
                    { value: "ta", label: "Tamil", badge: "TA" },
                    { value: "te", label: "Telugu", badge: "TE" },
                    { value: "ar", label: "Arabic", badge: "AR" },
                    { value: "ru", label: "Russian", badge: "RU" },
                    { value: "pt", label: "Portuguese", badge: "PT" },
                    { value: "it", label: "Italian", badge: "IT" },
                    { value: "tr", label: "Turkish", badge: "TR" },
                  ]}
                />
              </div>
            </div>

            {/* Generation & Calibration Action Strip */}
            <div class="studio-action-strip">
              <Show
                when={result()}
                fallback={
                  <div class="generate-prompt-box">
                    <div class="generate-btn-row">
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

                      <Show when={selectedVideo() && getTrackLyricsStatus(selectedVideo()!).hasLyrics}>
                        <button
                          type="button"
                          class="studio-btn-danger-sm"
                          onClick={handleDeleteLyrics}
                          title="Delete existing lyrics files from disk"
                        >
                          <i class="ph-bold ph-trash" />
                          <span>Delete Existing Lyrics</span>
                        </button>
                      </Show>
                    </div>
                    <span class="generate-subtext">
                      High-precision Whisper AI neural speech recognition with word and line synchronization.
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

            {/* TAB 2: Direct LRC & Timestamp Visual Studio Editor */}
            <Show when={activeStudioTab() === "editor"}>
              <div class="studio-editor-container">
                {/* Editor Control Header */}
                <div class="editor-header-bar">
                  <div class="editor-header-left">
                    <div class="editor-mode-pills">
                      <button
                        type="button"
                        class={`editor-mode-pill ${editorMode() === "visual" ? "active" : ""}`}
                        onClick={() => setEditorMode("visual")}
                      >
                        <i class="ph-bold ph-table" />
                        <span>Visual Editor</span>
                      </button>
                      <button
                        type="button"
                        class={`editor-mode-pill ${editorMode() === "raw" ? "active" : ""}`}
                        onClick={() => setEditorMode("raw")}
                      >
                        <i class="ph-bold ph-code" />
                        <span>Raw LRC Code</span>
                      </button>
                    </div>

                    <div class="editor-font-picker">
                      <label>Font:</label>
                      <select
                        class="editor-font-select"
                        value={editorFont()}
                        onChange={(e) => setEditorFont(e.currentTarget.value as any)}
                      >
                        <option value="google-sans">Google Sans Flex</option>
                        <option value="major-mono">Major Mono Display</option>
                        <option value="system-mono">Monospace Studio</option>
                      </select>
                    </div>

                    <div class="editor-size-pills">
                      <button
                        type="button"
                        class={`editor-size-pill ${editorFontSize() === "sm" ? "active" : ""}`}
                        onClick={() => setEditorFontSize("sm")}
                        title="Small font size"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        class={`editor-size-pill ${editorFontSize() === "md" ? "active" : ""}`}
                        onClick={() => setEditorFontSize("md")}
                        title="Medium font size"
                      >
                        M
                      </button>
                      <button
                        type="button"
                        class={`editor-size-pill ${editorFontSize() === "lg" ? "active" : ""}`}
                        onClick={() => setEditorFontSize("lg")}
                        title="Large font size"
                      >
                        L
                      </button>
                    </div>
                  </div>

                  <div class="editor-header-right">
                    <button
                      type="button"
                      class={`editor-tool-btn ${showSearchReplace() ? "active" : ""}`}
                      onClick={() => setShowSearchReplace((prev) => !prev)}
                      title="Search & Replace"
                    >
                      <i class="ph-bold ph-magnifying-glass" />
                      <span>Find & Replace</span>
                    </button>

                    <button
                      type="button"
                      class="editor-tool-btn"
                      onClick={handleAddLineAtPlayhead}
                      title="Insert new synchronized lyric line at current video time"
                    >
                      <i class="ph-bold ph-plus-circle" />
                      <span>+ Stamp Line ({formatTime(currentTime())})</span>
                    </button>

                    <button
                      type="button"
                      class="editor-tool-btn"
                      onClick={handleSortVisualLines}
                      title="Sort lines by start timestamp ascending"
                    >
                      <i class="ph-bold ph-sort-ascending" />
                      <span>Sort Time</span>
                    </button>

                    <div class="editor-bulk-shift-group">
                      <button
                        type="button"
                        class="editor-shift-btn"
                        onClick={() => handleShiftAllVisualLines(-0.2)}
                        title="Shift all lines 0.2s earlier"
                      >
                        -0.2s
                      </button>
                      <button
                        type="button"
                        class="editor-shift-btn"
                        onClick={() => handleShiftAllVisualLines(0.2)}
                        title="Shift all lines 0.2s later"
                      >
                        +0.2s
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Search & Replace Bar */}
                <Show when={showSearchReplace()}>
                  <div class="editor-search-replace-drawer">
                    <div class="search-replace-inputs">
                      <div class="sr-input-wrap">
                        <i class="ph-bold ph-magnifying-glass" />
                        <input
                          type="text"
                          placeholder="Search lyric text..."
                          value={searchQuery()}
                          onInput={(e) => setSearchQuery(e.currentTarget.value)}
                        />
                      </div>
                      <div class="sr-input-wrap">
                        <i class="ph-bold ph-arrows-left-right" />
                        <input
                          type="text"
                          placeholder="Replace with..."
                          value={replaceQuery()}
                          onInput={(e) => setReplaceQuery(e.currentTarget.value)}
                        />
                      </div>
                    </div>
                    <div class="sr-actions">
                      <button
                        type="button"
                        class="sr-btn"
                        onClick={() => handleExecuteReplace(false)}
                      >
                        Replace Next
                      </button>
                      <button
                        type="button"
                        class="sr-btn primary"
                        onClick={() => handleExecuteReplace(true)}
                      >
                        Replace All
                      </button>
                      <button
                        type="button"
                        class="sr-btn-close"
                        onClick={() => setShowSearchReplace(false)}
                      >
                        <i class="ph-bold ph-x" />
                      </button>
                    </div>
                  </div>
                </Show>

                {/* VISUAL TABLE VIEW */}
                <Show when={editorMode() === "visual"}>
                  <div
                    class={`editor-visual-table-wrap font-${editorFont()} size-${editorFontSize()}`}
                  >
                    <div class="editor-table-header">
                      <span class="col-idx">#</span>
                      <span class="col-time">Timestamp</span>
                      <span class="col-nudge">Nudge</span>
                      <span class="col-text">Lyric Text Content</span>
                      <span class="col-actions">Actions</span>
                    </div>

                    <div class="editor-table-body">
                      <Show
                        when={visualLines().length > 0}
                        fallback={
                          <div class="editor-empty-table">
                            <i class="ph-bold ph-text-aa" />
                            <p>No lyrics lines found yet.</p>
                            <button
                              type="button"
                              class="studio-btn-primary-sm"
                              onClick={handleAddLineAtPlayhead}
                            >
                              + Add First Lyric Line at {formatTime(currentTime())}
                            </button>
                          </div>
                        }
                      >
                        <For each={visualLines()}>
                          {(line, idx) => {
                            const isActive = () => activeVisualLineIndex() === idx();

                            return (
                              <div
                                class={`editor-line-row ${isActive() ? "is-playing-active" : ""}`}
                              >
                                <div class="col-idx">
                                  <span class="row-index-badge">{idx() + 1}</span>
                                </div>

                                <div class="col-time">
                                  <input
                                    type="text"
                                    class="row-time-input"
                                    value={formatTime(line.startSec)}
                                    title="Click to edit timestamp mm:ss"
                                    onChange={(e) => {
                                      const parts = e.currentTarget.value.split(":");
                                      if (parts.length === 2) {
                                        const m = parseFloat(parts[0]) || 0;
                                        const s = parseFloat(parts[1]) || 0;
                                        handleUpdateLineTime(line.id, m * 60 + s);
                                      }
                                    }}
                                  />
                                </div>

                                <div class="col-nudge">
                                  <button
                                    type="button"
                                    class="row-nudge-btn"
                                    onClick={() => handleNudgeLine(line.id, -0.2)}
                                    title="Shift 0.2s earlier"
                                  >
                                    -0.2
                                  </button>
                                  <button
                                    type="button"
                                    class="row-nudge-btn"
                                    onClick={() => handleNudgeLine(line.id, 0.2)}
                                    title="Shift 0.2s later"
                                  >
                                    +0.2
                                  </button>
                                </div>

                                <div class="col-text">
                                  <input
                                    type="text"
                                    class="row-text-input"
                                    value={line.text}
                                    placeholder="Enter lyric text here..."
                                    onInput={(e) => handleUpdateLineText(line.id, e.currentTarget.value)}
                                  />
                                </div>

                                <div class="col-actions">
                                  <button
                                    type="button"
                                    class="row-act-btn play"
                                    title="Play and listen from this timestamp"
                                    onClick={() => handlePlayLine(line.startSec)}
                                  >
                                    <i class="ph-bold ph-play" />
                                  </button>
                                  <button
                                    type="button"
                                    class="row-act-btn stamp"
                                    title="Stamp with current video playhead"
                                    onClick={() => handleStampLine(line.id)}
                                  >
                                    <i class="ph-bold ph-clock" />
                                  </button>
                                  <button
                                    type="button"
                                    class="row-act-btn insert"
                                    title="Insert line below"
                                    onClick={() => handleInsertLineBelow(idx())}
                                  >
                                    <i class="ph-bold ph-plus" />
                                  </button>
                                  <button
                                    type="button"
                                    class="row-act-btn delete"
                                    title="Delete this line"
                                    onClick={() => handleDeleteLine(line.id)}
                                  >
                                    <i class="ph-bold ph-trash" />
                                  </button>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>

                    <div class="editor-table-footer">
                      <button
                        type="button"
                        class="footer-add-line-btn"
                        onClick={handleAddLineAtPlayhead}
                      >
                        <i class="ph-bold ph-plus" />
                        <span>Add Lyric Line at Playhead ({formatTime(currentTime())})</span>
                      </button>
                      <span class="footer-stats-text">
                        {visualLines().length} lyric lines total
                      </span>
                    </div>
                  </div>
                </Show>

                {/* RAW CODE VIEW */}
                <Show when={editorMode() === "raw"}>
                  <div class={`editor-raw-wrap font-${editorFont()} size-${editorFontSize()}`}>
                    <div class="raw-editor-toolbar">
                      <span class="raw-hint">
                        Format: [mm:ss.xx] Lyric text. You can copy/paste standard LRC or edit directly.
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
                  <CustomSelect
                    size="sm"
                    value={pickerSort()}
                    onChange={(val) => setPickerSort(val as any)}
                    options={[
                      { value: "date_desc", label: "Recently Added", icon: "ph-bold ph-clock-counter-clockwise" },
                      { value: "date_asc", label: "Oldest First", icon: "ph-bold ph-clock" },
                      { value: "title_asc", label: "Title (A-Z)", icon: "ph-bold ph-sort-ascending" },
                      { value: "channel", label: "Channel / Artist", icon: "ph-bold ph-user" },
                      { value: "duration", label: "Duration", icon: "ph-bold ph-hourglass-medium" },
                    ]}
                  />
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
                              <button
                                type="button"
                                class="picker-card-delete-btn"
                                title="Delete lyrics for this track"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const confirmed = await showConfirmDialog(
                                    `Are you sure you want to permanently delete lyrics for "${vid.title}"?`,
                                    "Delete Lyrics",
                                    "warning"
                                  );
                                  if (!confirmed) return;
                                  const ok = await deleteLyricsForTrack(vid.id);
                                  if (ok) {
                                    if (selectedVideo()?.id === vid.id) {
                                      setResult(null);
                                      setEditableLrc("");
                                    }
                                    await fetchHistory();
                                  }
                                }}
                              >
                                <i class="ph-bold ph-trash" />
                              </button>
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
