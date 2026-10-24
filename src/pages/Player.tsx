import {
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  untrack,
  on,
  For,
  Show,
} from "solid-js";
import { useParams, useNavigate, useSearchParams } from "@solidjs/router";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  VideoEntry,
  setShowShortcutsModal,
  showArcadeModal,
  setShowArcadeModal,
  activeVideo,
  setActiveVideo,
  isPlaying,
  setIsPlaying,
  currentTime,
  setCurrentTime,
  duration,
  setDuration,
  volume,
  setVolume,
  isMuted,
  setIsMuted,
  playbackRate,
  setPlaybackRate,
  isLooping,
  setIsLooping,
  subtitlesEnabled,
  setSubtitlesEnabled,
  playerQueue,
  setPlayerQueue,
  setMiniplayerDismissed,
  theaterMode,
  setTheaterMode,
  playerAmbientMode,
  togglePlayerAmbientMode,
  playerAmbientType,
  togglePlayerAmbientType,
  playerAmbientColor,
  updatePlayerAmbientColor,
  playerAmbientIntensity,
  playerAmbientBlur,
  playerAmbientAudioReactive,
  togglePlayerAmbientAudioReactive,
  playerAmbientAudioSensitivity,
  updatePlayerAmbientAudioSensitivity,
  setPlayerContextParams,
  setGlobalVideoRef,
  isSearchOpen,
  getThumbnailUrl,
} from "../store";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import {
  extractDominantVideoColors,
  hexToRgb,
  rgbToHex,
  lerpColor,
  logAmbient,
  getSharedAudioReactiveEngine,
} from "../utils/ambientLighting";
import "./Player.css";

const PRESET_AURA_COLORS = [
  "#f25c54",
  "#ef233c",
  "#00f0ff",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#f8fafc",
];

const formatTime = (timeInSeconds: number) => {
  if (isNaN(timeInSeconds)) return "0:00";
  const h = Math.floor(timeInSeconds / 3600);
  const m = Math.floor((timeInSeconds % 3600) / 60);
  const s = Math.floor(timeInSeconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function Player() {
  const params = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = createSignal<VideoEntry | null>(
    activeVideo()?.id === params.id ? activeVideo() : null,
  );
  const [queue, setQueue] = createSignal<VideoEntry[]>(playerQueue());
  const [description, setDescription] = createSignal<string>("");
  const [descExpanded, setDescExpanded] = createSignal(false);
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [showControls, setShowControls] = createSignal(true);
  const [isVolumeHovered, setIsVolumeHovered] = createSignal(false);
  const [isSeeking, setIsSeeking] = createSignal(false);
  const [isFavorite, setIsFavorite] = createSignal(false);
  const [showSettingsMenu, setShowSettingsMenu] = createSignal(false);
  const [showCCMenu, setShowCCMenu] = createSignal(false);
  const [hoverTime, setHoverTime] = createSignal(0);
  const [hoverX, setHoverX] = createSignal(0);
  const [showHoverTooltip, setShowHoverTooltip] = createSignal(false);
  const [bufferedPercent, setBufferedPercent] = createSignal(0);

  const [searchParams] = useSearchParams();
  const [showAddToModal, setShowAddToModal] = createSignal(false);
  const [isEditingMeta, setIsEditingMeta] = createSignal(false);
  const [editTitle, setEditTitle] = createSignal("");
  const [editChannel, setEditChannel] = createSignal("");
  const [currentDominantColor, setCurrentDominantColor] =
    createSignal("#f25c54");
  const [extractedVideoColors, setExtractedVideoColors] = createSignal<
    string[]
  >(["#f25c54", "#ef233c", "#3b82f6", "#10b981", "#a855f7"]);

  let videoRef: HTMLVideoElement | undefined;
  let timelineContainerRef: HTMLDivElement | undefined;
  let playerContainerRef: HTMLDivElement | undefined;
  let ambientCanvasRef: HTMLCanvasElement | undefined;
  let ambientGlowRef: HTMLDivElement | undefined;
  let ambientCtx: CanvasRenderingContext2D | null = null;
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;
  let lastAmbientDraw = 0;
  let currentSmoothedRgb = { r: 242, g: 92, b: 84 };
  let settingsMenuRef: HTMLDivElement | undefined;
  let settingsBtnRef: HTMLButtonElement | undefined;
  let ccMenuRef: HTMLDivElement | undefined;
  let ccBtnRef: HTMLButtonElement | undefined;
  let controlsTimeout: number | undefined;
  let unlistenPlay: UnlistenFn | undefined;
  let unlistenPause: UnlistenFn | undefined;
  let unlistenNext: UnlistenFn | undefined;
  let unlistenPrev: UnlistenFn | undefined;
  let currentLoadingId: string | null = null;
  let isUnmounting = false;

  let isFetchingRustColors = false;
  let lastRustFetchTime = -10;

  const fetchRustDominantColors = async (targetId: string, time: number) => {
    if (isFetchingRustColors || !playerAmbientMode()) return;
    if (Math.abs(time - lastRustFetchTime) < 1.0) return;
    isFetchingRustColors = true;
    lastRustFetchTime = time;
    try {
      logAmbient("RustFetchStart", { targetId, timestamp: time }, 0);
      const res = await invoke<{ dominant: string; palette: string[] }>(
        "extract_video_dominant_colors",
        {
          videoId: targetId,
          timestamp: time,
        },
      );
      if (res && res.dominant) {
        logAmbient("RustFetchSuccess", res, 0);
        const targetRgb = hexToRgb(res.dominant);
        currentSmoothedRgb = lerpColor(currentSmoothedRgb, targetRgb, 0.4);
        const smoothed = rgbToHex(
          currentSmoothedRgb.r,
          currentSmoothedRgb.g,
          currentSmoothedRgb.b,
        );
        setCurrentDominantColor(smoothed);
        if (res.palette && res.palette.length > 0) {
          if (!arePalettesEqual(extractedVideoColors(), res.palette)) {
            setExtractedVideoColors(res.palette);
          }
        }
      }
    } catch (err) {
      logAmbient("RustFetchError", err, 0);
    } finally {
      isFetchingRustColors = false;
    }
  };

  let ambientLoopActive = false;
  let ambientRafId: number | null = null;
  let ambientSampleCount = 0;

  let lastPaletteUpdateTime = 0;
  const arePalettesEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
    }
    return true;
  };

  const stopAmbientLoop = () => {
    ambientLoopActive = false;
    if (ambientRafId !== null) {
      cancelAnimationFrame(ambientRafId);
      ambientRafId = null;
    }
  };

  const drawAmbientFrame = (now?: number, force = false) => {
    if (!videoRef || !playerAmbientMode() || isFullscreen() || isUnmounting) {
      return;
    }
    const time = now ?? performance.now();
    const isDynamic = playerAmbientType() === "dynamic";

    if (force || time - lastAmbientDraw >= 33) {
      lastAmbientDraw = time;

      if (videoRef.readyState >= 2 && videoRef.videoWidth > 0) {
        // 1. Render dynamic canvas frame
        if (isDynamic && ambientCanvasRef) {
          if (!ambientCtx || ambientCtx.canvas !== ambientCanvasRef) {
            ambientCtx = ambientCanvasRef.getContext("2d", {
              alpha: true,
            });
            if (ambientCtx) {
              ambientCtx.imageSmoothingEnabled = true;
            }
          }
          if (ambientCtx) {
            try {
              ambientCtx.drawImage(
                videoRef,
                0,
                0,
                ambientCanvasRef.width,
                ambientCanvasRef.height,
              );
            } catch (canvasErr) {
              logAmbient("CanvasDrawError", canvasErr);
            }
          }
        }

        // 2. Extract colors using offscreen sampling canvas
        if (!offscreenCanvas) {
          offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = 32;
          offscreenCanvas.height = 18;
          offscreenCtx = offscreenCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (offscreenCtx) {
            offscreenCtx.imageSmoothingEnabled = true;
          }
        }

        if (offscreenCtx) {
          try {
            offscreenCtx.drawImage(videoRef, 0, 0, 32, 18);
            const { dominant, palette, saturation, vibranceScore } =
              extractDominantVideoColors(offscreenCtx, 32, 18);
            const targetRgb = hexToRgb(dominant);
            currentSmoothedRgb = lerpColor(
              currentSmoothedRgb,
              targetRgb,
              force ? 1.0 : 0.25,
            );
            const smoothedHex = rgbToHex(
              currentSmoothedRgb.r,
              currentSmoothedRgb.g,
              currentSmoothedRgb.b,
            );

            setCurrentDominantColor(smoothedHex);

            // Throttle palette updates to avoid thrashing settings swatches and breaking clicks during playback
            const nowTs = performance.now();
            if (
              palette.length > 0 &&
              (force || nowTs - lastPaletteUpdateTime >= 2000)
            ) {
              if (!arePalettesEqual(extractedVideoColors(), palette)) {
                setExtractedVideoColors(palette);
                lastPaletteUpdateTime = nowTs;
              }
            }

            ambientSampleCount++;
            logAmbient("DynamicSample", {
              sample: ambientSampleCount,
              dominant: smoothedHex,
              rawDominant: dominant,
              saturation: saturation ? saturation.toFixed(2) : undefined,
              score: vibranceScore ? Math.round(vibranceScore) : undefined,
              videoTime: `${videoRef.currentTime.toFixed(1)}s`,
            });
          } catch (extractErr) {
            logAmbient("OffscreenExtractError", extractErr);
            if (video()?.id) {
              fetchRustDominantColors(video()!.id, videoRef.currentTime);
            }
          }
        }
      } else if (video()?.id) {
        logAmbient("VideoNotReady", {
          readyState: videoRef.readyState,
          videoWidth: videoRef.videoWidth,
          videoId: video()!.id,
        });
        fetchRustDominantColors(video()!.id, videoRef?.currentTime ?? 0);
      }

      // Continuous background sync with Rust backend (every 1.5s) to guarantee accurate colors on all platforms
      if (
        video()?.id &&
        videoRef &&
        !videoRef.paused &&
        time - lastRustFetchTime >= 1500
      ) {
        fetchRustDominantColors(video()!.id, videoRef.currentTime);
      }

      // 3. Audio-Reactive Dynamic Glow Modulation
      if (
        playerAmbientAudioReactive() &&
        videoRef &&
        !videoRef.paused &&
        !videoRef.ended
      ) {
        try {
          const audioEngine = getSharedAudioReactiveEngine();
          audioEngine.connect(videoRef);
          audioEngine.resume();
          const pulse = audioEngine.getPulseMetrics(
            playerAmbientAudioSensitivity(),
          );
          const scaleVal = pulse.scale;
          const opacityVal = pulse.opacityMultiplier;
          if (ambientCanvasRef) {
            ambientCanvasRef.style.setProperty(
              "--ambient-audio-scale",
              String(scaleVal),
            );
            ambientCanvasRef.style.setProperty(
              "--ambient-audio-opacity",
              String(opacityVal),
            );
          }
          if (ambientGlowRef) {
            ambientGlowRef.style.setProperty(
              "--ambient-audio-scale",
              String(scaleVal),
            );
            ambientGlowRef.style.setProperty(
              "--ambient-audio-opacity",
              String(opacityVal),
            );
          }
        } catch (audioErr) {
          logAmbient("AudioPulseError", audioErr, 3000);
        }
      } else {
        if (ambientCanvasRef) {
          ambientCanvasRef.style.removeProperty("--ambient-audio-scale");
          ambientCanvasRef.style.removeProperty("--ambient-audio-opacity");
        }
        if (ambientGlowRef) {
          ambientGlowRef.style.removeProperty("--ambient-audio-scale");
          ambientGlowRef.style.removeProperty("--ambient-audio-opacity");
        }
      }
    }
  };

  const scheduleNextAmbientFrame = () => {
    if (!ambientLoopActive || isUnmounting) return;

    const isActivelyPlaying =
      (isPlaying() || (videoRef && !videoRef.paused && !videoRef.ended)) &&
      playerAmbientMode() &&
      (playerAmbientType() === "dynamic" || playerAmbientAudioReactive()) &&
      !isFullscreen();

    if (!isActivelyPlaying) {
      ambientLoopActive = false;
      return;
    }

    ambientRafId = requestAnimationFrame((ts) => {
      ambientRafId = null;
      drawAmbientFrame(ts, false);
      scheduleNextAmbientFrame();
    });
  };

  const startAmbientLoop = () => {
    if (ambientLoopActive) return;
    ambientLoopActive = true;
    scheduleNextAmbientFrame();
  };

  createEffect(() => {
    const playing = isPlaying();
    const ambient = playerAmbientMode();
    const type = playerAmbientType();
    const full = isFullscreen();
    video();

    if (ambient && !full && !isUnmounting) {
      logAmbient(
        "EffectTrigger",
        { playing, type, hasVideo: !!video() },
        0,
      );
      if (type === "dynamic" || playerAmbientAudioReactive()) {
        if (playing || (videoRef && !videoRef.paused && !videoRef.ended)) {
          startAmbientLoop();
        } else if (videoRef && videoRef.readyState >= 2) {
          drawAmbientFrame(undefined, true);
        }
      } else {
        stopAmbientLoop();
      }
    } else {
      stopAmbientLoop();
    }
  });

  const toggleMiniplayerMode = () => {
    isUnmounting = true;
    const playState = isPlaying();
    setMiniplayerDismissed(false);
    if (videoRef) {
      setCurrentTime(videoRef.currentTime);
    }
    setIsPlaying(playState);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const loadVideoData = async (targetId?: string) => {
    if (!targetId) return;
    currentLoadingId = targetId;
    setMiniplayerDismissed(false);
    setPlayerContextParams({
      context: Array.isArray(searchParams.context)
        ? searchParams.context[0]
        : searchParams.context,
      id: Array.isArray(searchParams.id) ? searchParams.id[0] : searchParams.id,
      name: Array.isArray(searchParams.name)
        ? searchParams.name[0]
        : searchParams.name,
    });

    // Instant sync if already in memory
    if (activeVideo()?.id === targetId) {
      setVideo(activeVideo());
    }

    try {
      const db = await invoke<VideoEntry[]>("get_downloaded_videos");
      if (currentLoadingId !== targetId) return;
      let currentVideo = db.find((v) => v.id === targetId);

      if (currentVideo) {
        const isSameVideo = activeVideo()?.id === targetId;

        if (!isSameVideo) {
          setCurrentTime(0);
          setIsPlaying(true);
          if (videoRef) {
            videoRef.currentTime = 0;
          }
        }

        setVideo(currentVideo);
        setActiveVideo(currentVideo);
        setDescExpanded(false);

        const favStatus = await invoke<boolean>("check_favorite", {
          id: targetId,
        });
        if (currentLoadingId !== targetId) return;
        setIsFavorite(favStatus);

        try {
          const descRes = await fetch(
            `http://127.0.0.1:1422/Descriptions/${targetId}.txt`,
          );
          if (currentLoadingId === targetId) {
            if (descRes.ok) {
              setDescription(await descRes.text());
            } else {
              setDescription("No description available.");
            }
          }
        } catch {
          if (currentLoadingId === targetId) {
            setDescription("No description available.");
          }
        }

        let queueVideos = db;
        const context = searchParams.context;
        if (context === "artist" && searchParams.name) {
          queueVideos = await invoke<VideoEntry[]>("get_videos_by_artist", {
            name: searchParams.name,
          });
        } else if (context === "playlist" && searchParams.id) {
          queueVideos = await invoke<VideoEntry[]>("get_playlist_videos", {
            playlistId: searchParams.id,
          });
        }
        if (currentLoadingId !== targetId) return;

        const qIndex = queueVideos.findIndex((v) => v.id === targetId);
        if (qIndex !== -1) {
          const nextVideos: VideoEntry[] = [];
          for (let i = 1; i <= 15; i++) {
            if (queueVideos[(qIndex + i) % queueVideos.length]) {
              nextVideos.push(queueVideos[(qIndex + i) % queueVideos.length]);
            }
          }

          const uniqueQueue = Array.from(
            new Set(nextVideos.map((a) => a.id)),
          ).map((id) => nextVideos.find((a) => a.id === id)!);

          const filteredQueue = uniqueQueue.filter((v) => v.id !== targetId);
          setQueue(filteredQueue);
          setPlayerQueue(filteredQueue);
        }
      }
    } catch (e) {
      console.error("Could not load video library", e);
    }
  };

  const handleSaveMetadata = async () => {
    if (!video()) return;
    try {
      await invoke("update_video_details", {
        id: video()!.id,
        title: editTitle().trim(),
        channel: editChannel().trim(),
      });
      setVideo({
        ...video()!,
        title: editTitle().trim(),
        channel: editChannel().trim(),
      });
      setIsEditingMeta(false);
    } catch (e) {
      console.error("Failed to update metadata", e);
    }
  };

  const toggleFavoriteStatus = async () => {
    if (!video()) return;
    try {
      const newStatus = !isFavorite();
      await invoke("toggle_favorite", {
        id: video()!.id,
        isFavorite: newStatus,
      });
      setIsFavorite(newStatus);
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  };

  const handlePlay = () => {
    if (videoRef) {
      const playPromise = videoRef.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((e) => {
            if (e.name !== "AbortError") console.error("Playback error:", e);
          });
      }
    }
  };

  const handlePause = () => {
    if (videoRef) {
      videoRef.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => (isPlaying() ? handlePause() : handlePlay());

  const toggleMute = () => {
    if (videoRef) {
      videoRef.muted = !videoRef.muted;
      setIsMuted(videoRef.muted);
      if (!videoRef.muted && volume() === 0) {
        setVolume(0.5);
        videoRef.volume = 0.5;
      }
    }
  };

  const handleVolumeChange = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setVolume(val);
    if (videoRef) {
      videoRef.volume = val;
      if (val > 0 && isMuted()) {
        videoRef.muted = false;
        setIsMuted(false);
      } else if (val === 0 && !isMuted()) {
        videoRef.muted = true;
        setIsMuted(true);
      }
    }
  };

  const handleSeek = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setCurrentTime(val);
    if (videoRef) videoRef.currentTime = val;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef
        ?.requestFullscreen()
        .catch((err) => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  const handleVideoEnd = () => {
    if (isLooping() && videoRef) {
      videoRef.currentTime = 0;
      handlePlay();
      return;
    }
    const nextVideo = queue()[0];
    if (nextVideo) navigate(`/player/${nextVideo.id}`);
  };

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  const playPrev = async () => {
    if (!video()) return;
    try {
      const db = await invoke<VideoEntry[]>("get_downloaded_videos");
      const currentIndex = db.findIndex((v) => v.id === video()!.id);
      if (currentIndex > 0) {
        navigate(`/player/${db[currentIndex - 1].id}`);
      } else if (db.length > 0) {
        navigate(`/player/${db[db.length - 1].id}`);
      }
    } catch (e) {
      console.error("Failed to navigate to previous video:", e);
    }
  };

  const playNext = () => {
    const nextVideo = queue()[0];
    if (nextVideo) navigate(`/player/${nextVideo.id}`);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeout);
    if (isPlaying()) {
      controlsTimeout = window.setTimeout(() => {
        if (!showSettingsMenu() && !showCCMenu()) {
          setShowControls(false);
        }
      }, 2500);
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        const currentPip = document.pictureInPictureElement;
        await document.exitPictureInPicture();
        // If the active PiP belonged to a different/stale video element, enter PiP on our current videoRef
        if (currentPip !== videoRef && videoRef) {
          await videoRef.requestPictureInPicture();
        }
      } else if (videoRef) {
        await videoRef.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP failed", err);
    }
  };

  const toggleCC = () => {
    if (videoRef && videoRef.textTracks.length > 0) {
      const state = !subtitlesEnabled();
      setSubtitlesEnabled(state);
      for (let i = 0; i < videoRef.textTracks.length; i++) {
        videoRef.textTracks[i].mode = state ? "showing" : "hidden";
      }
    }
    setShowCCMenu(false);
  };

  const changeSpeed = (rate: number) => {
    if (videoRef) {
      videoRef.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSettingsMenu(false);
  };

  const [osdMessage, setOsdMessage] = createSignal<{
    icon: string;
    text: string;
  } | null>(null);
  let osdTimeout: number | undefined;

  const showOsd = (icon: string, text: string) => {
    setOsdMessage({ icon, text });
    clearTimeout(osdTimeout);
    osdTimeout = window.setTimeout(() => setOsdMessage(null), 900);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      isSearchOpen() ||
      (target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable))
    ) {
      return;
    }

    // Guard: ignore player single-key shortcuts if Ctrl, Meta, or Alt is pressed
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Space or K: Play / Pause
    if (e.code === "Space" || e.key === "k" || e.key === "K") {
      e.preventDefault();
      if (isPlaying()) {
        handlePause();
        showOsd("ph-pause", "Paused");
      } else {
        handlePlay();
        showOsd("ph-play", "Playing");
      }
      handleMouseMove();
      return;
    }

    // M: Mute / Unmute
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMute();
      showOsd(
        isMuted() ? "ph-speaker-high" : "ph-speaker-slash",
        isMuted() ? `${Math.round(volume() * 100)}%` : "Muted",
      );
      handleMouseMove();
      return;
    }

    // F: Toggle Fullscreen
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFullscreen();
      showOsd(
        isFullscreen() ? "ph-corners-in" : "ph-corners-out",
        isFullscreen() ? "Exit Fullscreen" : "Fullscreen",
      );
      return;
    }

    // T: Toggle Theater Mode
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      const nextTheater = !theaterMode();
      setTheaterMode(nextTheater);
      showOsd("ph-television", nextTheater ? "Theater Mode" : "Default View");
      return;
    }

    // I: Toggle Custom Miniplayer
    if (e.key === "i" || e.key === "I") {
      e.preventDefault();
      toggleMiniplayerMode();
      return;
    }

    // G: Toggle Arcade Minigame
    if (e.key === "g" || e.key === "G") {
      e.preventDefault();
      setShowArcadeModal(!showArcadeModal());
      return;
    }

    // ArrowLeft: Seek Back 5s
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (videoRef) {
        const newTime = Math.max(0, videoRef.currentTime - 5);
        videoRef.currentTime = newTime;
        setCurrentTime(newTime);
        showOsd("ph-arrow-counter-clockwise", "-5s");
        handleMouseMove();
      }
      return;
    }

    // ArrowRight: Seek Forward 5s
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (videoRef) {
        const newTime = Math.min(duration(), videoRef.currentTime + 5);
        videoRef.currentTime = newTime;
        setCurrentTime(newTime);
        showOsd("ph-arrow-clockwise", "+5s");
        handleMouseMove();
      }
      return;
    }

    // J: Seek Back 10s
    if (e.key === "j" || e.key === "J") {
      e.preventDefault();
      if (videoRef) {
        const newTime = Math.max(0, videoRef.currentTime - 10);
        videoRef.currentTime = newTime;
        setCurrentTime(newTime);
        showOsd("ph-arrow-counter-clockwise", "-10s");
        handleMouseMove();
      }
      return;
    }

    // L: Seek Forward 10s
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      if (videoRef) {
        const newTime = Math.min(duration(), videoRef.currentTime + 10);
        videoRef.currentTime = newTime;
        setCurrentTime(newTime);
        showOsd("ph-arrow-clockwise", "+10s");
        handleMouseMove();
      }
      return;
    }

    // ArrowUp: Volume Up 5%
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newVol = Math.min(1, Math.round((volume() + 0.05) * 100) / 100);
      setVolume(newVol);
      if (videoRef) {
        videoRef.volume = newVol;
        if (isMuted() && newVol > 0) {
          videoRef.muted = false;
          setIsMuted(false);
        }
      }
      showOsd("ph-speaker-high", `${Math.round(newVol * 100)}%`);
      handleMouseMove();
      return;
    }

    // ArrowDown: Volume Down 5%
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const newVol = Math.max(0, Math.round((volume() - 0.05) * 100) / 100);
      setVolume(newVol);
      if (videoRef) {
        videoRef.volume = newVol;
        if (newVol === 0 && !isMuted()) {
          videoRef.muted = true;
          setIsMuted(true);
        }
      }
      showOsd(
        newVol === 0 ? "ph-speaker-slash" : "ph-speaker-low",
        `${Math.round(newVol * 100)}%`,
      );
      handleMouseMove();
      return;
    }

    // N: Play Next Media
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      showOsd("ph-skip-forward", "Next Video");
      playNext();
      return;
    }

    // P: Play Previous Media
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      showOsd("ph-skip-back", "Previous Video");
      playPrev();
      return;
    }

    // C: Toggle Captions
    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      toggleCC();
      showOsd(
        "ph-subtitles",
        !subtitlesEnabled() ? "Captions On" : "Captions Off",
      );
      return;
    }

    // R: Toggle Repeat / Loop
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      const nextLoop = !isLooping();
      setIsLooping(nextLoop);
      showOsd("ph-repeat", nextLoop ? "Loop On" : "Loop Off");
      return;
    }

    // 0 - 9: Jump to percentage
    if (e.key >= "0" && e.key <= "9" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (videoRef && duration() > 0) {
        const fraction = parseInt(e.key, 10) / 10;
        const targetTime = duration() * fraction;
        videoRef.currentTime = targetTime;
        setCurrentTime(targetTime);
        showOsd("ph-fast-forward", `${parseInt(e.key, 10) * 10}%`);
        handleMouseMove();
      }
      return;
    }

    // < or , (decrease speed) and > or . (increase speed)
    if (e.key === "<" || (e.shiftKey && e.key === ",")) {
      e.preventDefault();
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      const idx = speeds.indexOf(playbackRate());
      const newIdx = idx > 0 ? idx - 1 : idx === -1 ? 2 : 0;
      changeSpeed(speeds[newIdx]);
      showOsd("ph-gauge", `${speeds[newIdx]}x`);
      return;
    }
    if (e.key === ">" || (e.shiftKey && e.key === ".")) {
      e.preventDefault();
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      const idx = speeds.indexOf(playbackRate());
      const newIdx =
        idx < speeds.length - 1
          ? idx === -1
            ? 4
            : idx + 1
          : speeds.length - 1;
      changeSpeed(speeds[newIdx]);
      showOsd("ph-gauge", `${speeds[newIdx]}x`);
      return;
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (
      settingsMenuRef &&
      !settingsMenuRef.contains(target) &&
      (!settingsBtnRef || !settingsBtnRef.contains(target))
    ) {
      setShowSettingsMenu(false);
    }
    if (
      ccMenuRef &&
      !ccMenuRef.contains(target) &&
      (!ccBtnRef || !ccBtnRef.contains(target))
    ) {
      setShowCCMenu(false);
    }
  };

  onMount(async () => {
    if (videoRef) {
      setGlobalVideoRef(videoRef);
      videoRef.volume = untrack(volume);
      videoRef.muted = untrack(isMuted);
      videoRef.playbackRate = untrack(playbackRate);
      if (activeVideo()?.id === params.id) {
        const savedTime = untrack(currentTime);
        if (savedTime > 0) {
          videoRef.currentTime = savedTime;
        }
        if (untrack(isPlaying)) {
          handlePlay();
        }
      } else {
        videoRef.currentTime = 0;
        setCurrentTime(0);
        setIsPlaying(true);
        handlePlay();
      }
    }
    unlistenPlay = await listen("media-play", () => handlePlay());
    unlistenPause = await listen("media-pause", () => handlePause());
    unlistenNext = await listen("media-next", () => handleVideoEnd());
    unlistenPrev = await listen("media-prev", () => {
      if (videoRef) videoRef.currentTime = 0;
    });
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    isUnmounting = true;
    if (ambientRafId) {
      cancelAnimationFrame(ambientRafId);
      ambientRafId = null;
    }
    window.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (osdTimeout) clearTimeout(osdTimeout);
    if (unlistenPlay) unlistenPlay();
    if (unlistenPause) unlistenPause();
    if (unlistenNext) unlistenNext();
    if (unlistenPrev) unlistenPrev();
    if (videoRef) {
      setCurrentTime(videoRef.currentTime);
    }
  });

  createEffect(
    on(
      () => params.id,
      (targetId) => {
        if (targetId) {
          loadVideoData(targetId);
        }
      },
    ),
  );

  createEffect(
    on(
      () => video()?.id,
      (currentId) => {
        if (currentId && video() && videoRef) {
          setGlobalVideoRef(videoRef);
          invoke("update_media_metadata", {
            title: video()!.title,
            artist: video()!.channel,
          }).catch(() => {});
          videoRef.volume = untrack(volume);
          videoRef.muted = untrack(isMuted);
          videoRef.playbackRate = untrack(playbackRate);

          if (activeVideo()?.id === currentId && untrack(currentTime) > 0) {
            videoRef.currentTime = untrack(currentTime);
          } else {
            videoRef.currentTime = 0;
            setCurrentTime(0);
          }

          if (untrack(isPlaying)) {
            handlePlay();
          }
        }
      },
      { defer: true },
    ),
  );

  const seekProgress = () =>
    duration() > 0 ? (currentTime() / duration()) * 100 : 0;
  const volProgress = () => (isMuted() ? 0 : volume() * 100);

  return (
    <div
      classList={{
        "player-page-container": true,
        "is-theater": theaterMode(),
        "is-fullscreen": isFullscreen(),
      }}
    >
      <div class="player-main-col">
        <Show
          when={video()}
          fallback={<div class="flex-row-gap">Loading engine...</div>}
        >
          <div
            class="player-video-outer"
            style={
              {
                "--ambient-blur": `${playerAmbientBlur()}px`,
                "--ambient-opacity": `${playerAmbientIntensity() / 100}`,
                "--ambient-dominant-color": currentDominantColor(),
                "--ambient-static-color": playerAmbientColor(),
              } as any
            }
          >
            {/* Ambient aura color glow layer */}
            <div
              ref={ambientGlowRef}
              class={`player-ambient-glow ${!playerAmbientMode() || isFullscreen() ? "hidden" : ""}`}
              style={{
                background:
                  playerAmbientType() === "dynamic"
                    ? currentDominantColor()
                    : playerAmbientColor(),
                filter: `blur(${Math.min(36, playerAmbientBlur() * 0.5)}px)`,
                opacity: `${(playerAmbientIntensity() / 100) * 0.85}`,
              }}
              aria-hidden="true"
            />

            {/* Dynamic spatial canvas light bleed */}
            <canvas
              ref={ambientCanvasRef}
              class={`player-ambient-canvas ${!playerAmbientMode() || isFullscreen() || playerAmbientType() !== "dynamic" ? "hidden" : ""}`}
              width="160"
              height="90"
              aria-hidden="true"
            />

            <div
              class="player-video-wrapper"
              ref={playerContainerRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() =>
                isPlaying() &&
                !showSettingsMenu() &&
                !showCCMenu() &&
                setShowControls(false)
              }
            >
              <video
                class="player-video-element"
                ref={videoRef}
                preload="auto"
                crossOrigin="anonymous"
                autoplay
                onEnded={handleVideoEnd}
                onPlay={() => {
                  if (isUnmounting) return;
                  invoke("update_playback_status", { playing: true });
                  setIsPlaying(true);
                  if (videoRef) {
                    getSharedAudioReactiveEngine().connect(videoRef);
                    getSharedAudioReactiveEngine().resume();
                  }
                  startAmbientLoop();
                }}
                onPause={() => {
                  if (isUnmounting || (videoRef && videoRef.seeking)) return;
                  invoke("update_playback_status", { playing: false });
                  setIsPlaying(false);
                  stopAmbientLoop();
                  drawAmbientFrame(undefined, true);
                }}
                onLoadedData={() => {
                  drawAmbientFrame(undefined, true);
                  if (videoRef && !videoRef.paused && !videoRef.ended) {
                    startAmbientLoop();
                  }
                }}
                onSeeked={() => {
                  if (
                    (isPlaying() || untrack(isPlaying)) &&
                    videoRef &&
                    videoRef.paused
                  ) {
                    handlePlay();
                  }
                  drawAmbientFrame(undefined, true);
                  if (videoRef && !videoRef.paused && !videoRef.ended) {
                    startAmbientLoop();
                  }
                }}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  if (activeVideo()?.id === params.id) {
                    const savedTime = untrack(currentTime);
                    if (
                      savedTime > 0 &&
                      Math.abs(e.currentTarget.currentTime - savedTime) > 0.5
                    ) {
                      e.currentTarget.currentTime = savedTime;
                    }
                  }
                  if (isPlaying() || untrack(isPlaying)) {
                    handlePlay();
                  }
                  drawAmbientFrame(undefined, true);
                }}
                onCanPlay={() => {
                  if (isPlaying() || untrack(isPlaying)) {
                    handlePlay();
                  }
                  drawAmbientFrame(undefined, true);
                }}
                onTimeUpdate={(e) => {
                  if (!isSeeking() && !isUnmounting) {
                    setCurrentTime(e.currentTarget.currentTime);
                    if (!ambientLoopActive && !e.currentTarget.paused && !e.currentTarget.ended) {
                      startAmbientLoop();
                    } else if (e.currentTarget.paused) {
                      drawAmbientFrame(undefined, true);
                    }
                  }
                }}
                onProgress={() => {
                  if (
                    videoRef &&
                    videoRef.buffered.length > 0 &&
                    duration() > 0
                  ) {
                    const end = videoRef.buffered.end(
                      videoRef.buffered.length - 1,
                    );
                    setBufferedPercent(Math.min(100, (end / duration()) * 100));
                  }
                }}
                onClick={() => {
                  setShowSettingsMenu(false);
                  setShowCCMenu(false);
                  togglePlay();
                }}
                src={`http://127.0.0.1:1422/Videos/${video()!.id}.mp4`}
              >
                <track
                  kind="captions"
                  src={`http://127.0.0.1:1422/Videos/${video()!.id}.vtt`}
                  default={subtitlesEnabled()}
                />
              </video>

              <Show when={osdMessage()}>
                <div class="player-osd-badge">
                  <i
                    class={`ph-fill ${osdMessage()!.icon}`}
                    aria-hidden="true"
                  ></i>
                  <span>{osdMessage()!.text}</span>
                </div>
              </Show>

              <div
                class={
                  showControls() || !isPlaying()
                    ? "player-controls-overlay visible"
                    : "player-controls-overlay"
                }
              >
                <div
                  class="timeline-scrubber-container"
                  ref={timelineContainerRef}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.max(
                      0,
                      Math.min(rect.width, e.clientX - rect.left),
                    );
                    const pct = x / rect.width;
                    setHoverX(x);
                    setHoverTime(pct * (duration() || 0));
                    setShowHoverTooltip(true);
                  }}
                  onMouseLeave={() => setShowHoverTooltip(false)}
                >
                  {/* Buffered track layer */}
                  <div
                    class="timeline-buffered-layer"
                    style={{ width: `${bufferedPercent()}%` }}
                  ></div>

                  {/* Hover time tooltip */}
                  <Show when={showHoverTooltip() && duration() > 0}>
                    <div
                      class="timeline-hover-tooltip"
                      style={{
                        left: `${hoverX()}px`,
                      }}
                    >
                      {formatTime(hoverTime())}
                    </div>
                  </Show>

                  <input
                    class="custom-slider"
                    type="range"
                    min="0"
                    max={duration() || 0}
                    value={currentTime()}
                    step="0.1"
                    onInput={handleSeek}
                    onMouseDown={() => setIsSeeking(true)}
                    onMouseUp={() => setIsSeeking(false)}
                    aria-label="Seek Video Timeline"
                    style={{ "--progress": `${seekProgress()}%` } as any}
                  />
                </div>

                <div class="flex-row-between player-controls-bar">
                  <div class="flex-row-gap gap-4">
                    <button
                      class="control-btn"
                      onClick={playPrev}
                      title="Previous"
                    >
                      <i class="ph-fill ph-skip-back"></i>
                    </button>
                    <button
                      class="control-btn"
                      onClick={togglePlay}
                      title={isPlaying() ? "Pause" : "Play"}
                    >
                      <i
                        class={`ph-fill ph-${isPlaying() ? "pause" : "play"}`}
                      ></i>
                    </button>
                    <button class="control-btn" onClick={playNext} title="Next">
                      <i class="ph-fill ph-skip-forward"></i>
                    </button>

                    <div
                      class="volume-control-group"
                      onMouseEnter={() => setIsVolumeHovered(true)}
                      onMouseLeave={() => setIsVolumeHovered(false)}
                    >
                      <button
                        class="control-btn"
                        onClick={toggleMute}
                        title={isMuted() ? "Unmute" : "Mute"}
                      >
                        <i
                          class={`ph-fill ph-${isMuted() || volume() === 0 ? "speaker-slash" : volume() < 0.5 ? "speaker-low" : "speaker-high"}`}
                        ></i>
                      </button>
                      <div
                        class={
                          isVolumeHovered()
                            ? "volume-slider-wrapper hovered"
                            : "volume-slider-wrapper"
                        }
                      >
                        <input
                          class="custom-slider"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted() ? 0 : volume()}
                          onInput={handleVolumeChange}
                          style={{ "--progress": `${volProgress()}%` } as any}
                        />
                      </div>
                    </div>

                    <span class="player-timecode">
                      {formatTime(currentTime())}{" "}
                      <span class="player-timecode-separator">/</span>{" "}
                      {formatTime(duration())}
                    </span>
                  </div>

                  <div class="flex-row-gap gap-4 relative">
                    <div
                      class={`player-popup-menu ${showCCMenu() ? "visible" : ""}`}
                      ref={ccMenuRef}
                    >
                      <div class="player-popup-header">
                        <i class="ph-fill ph-closed-captioning"></i> Subtitles
                      </div>
                      <button
                        class={`player-popup-item ${subtitlesEnabled() ? "selected" : ""}`}
                        onClick={toggleCC}
                      >
                        <span>English (Auto)</span>
                        <Show when={subtitlesEnabled()}>
                          <i class="ph-fill ph-check-circle"></i>
                        </Show>
                      </button>
                      <button
                        class={`player-popup-item ${!subtitlesEnabled() ? "selected" : ""}`}
                        onClick={toggleCC}
                      >
                        <span>Off</span>
                        <Show when={!subtitlesEnabled()}>
                          <i class="ph-fill ph-check-circle"></i>
                        </Show>
                      </button>
                    </div>

                    <div
                      class={`player-popup-menu ${showSettingsMenu() ? "visible" : ""}`}
                      ref={settingsMenuRef}
                    >
                      <div class="player-popup-header">
                        <i class="ph-fill ph-gauge"></i> Speed
                      </div>
                      {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                        <button
                          class={`player-popup-item ${playbackRate() === rate ? "selected" : ""}`}
                          onClick={() => changeSpeed(rate)}
                        >
                          <span>{rate === 1.0 ? "Normal" : `${rate}x`}</span>
                          <Show when={playbackRate() === rate}>
                            <i class="ph-fill ph-check-circle"></i>
                          </Show>
                        </button>
                      ))}

                      <div class="player-popup-header" style="margin-top: 8px;">
                        <i class="ph-fill ph-nut"></i> Ambient Lighting
                      </div>
                      <button
                        class={`player-popup-item ${playerAmbientMode() ? "selected" : ""}`}
                        onClick={() => {
                          togglePlayerAmbientMode();
                        }}
                      >
                        <span>Enable Glow</span>
                        <i
                          class={`ph-fill ph-toggle-${playerAmbientMode() ? "right" : "left"}`}
                        ></i>
                      </button>
                      <Show when={playerAmbientMode()}>
                        <div class="player-ambient-menu-group">
                          <div class="player-ambient-mode-row">
                            <button
                              class={`player-ambient-mode-btn ${playerAmbientType() === "dynamic" ? "active" : ""}`}
                              onClick={() => togglePlayerAmbientType("dynamic")}
                            >
                              <i class="ph-bold ph-video-camera"></i>
                              <span>Auto Dynamic</span>
                            </button>
                            <button
                              class={`player-ambient-mode-btn ${playerAmbientType() === "static" ? "active" : ""}`}
                              onClick={() => togglePlayerAmbientType("static")}
                            >
                              <i class="ph-bold ph-palette"></i>
                              <span>Static Aura</span>
                            </button>
                          </div>

                          {/* Preset Aura Color Swatches */}
                          <div class="player-ambient-palette-section">
                            <div class="player-ambient-palette-label">
                              <span>Preset Aura Colors</span>
                            </div>
                            <div class="player-ambient-palette-swatches">
                              {PRESET_AURA_COLORS.map((col) => (
                                <button
                                  type="button"
                                  class={`player-video-color-swatch ${playerAmbientType() === "static" && playerAmbientColor().toLowerCase() === col.toLowerCase() ? "selected" : ""}`}
                                  style={{ background: col }}
                                  onClick={() => {
                                    updatePlayerAmbientColor(col);
                                    togglePlayerAmbientType("static");
                                  }}
                                  title={`Set ambient color to ${col}`}
                                >
                                  <Show
                                    when={
                                      playerAmbientType() === "static" &&
                                      playerAmbientColor().toLowerCase() ===
                                        col.toLowerCase()
                                    }
                                  >
                                    <i class="ph-bold ph-check"></i>
                                  </Show>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Extracted Video Color Swatches */}
                          <Show when={extractedVideoColors().length > 0}>
                            <div class="player-ambient-palette-section">
                              <div class="player-ambient-palette-label">
                                <span>Video Frame Colors</span>
                              </div>
                              <div class="player-ambient-palette-swatches">
                                {extractedVideoColors().map((col) => (
                                  <button
                                    type="button"
                                    class={`player-video-color-swatch ${playerAmbientType() === "static" && playerAmbientColor().toLowerCase() === col.toLowerCase() ? "selected" : ""}`}
                                    style={{ background: col }}
                                    onClick={() => {
                                      updatePlayerAmbientColor(col);
                                      togglePlayerAmbientType("static");
                                    }}
                                    title={`Set ambient color to ${col}`}
                                  >
                                    <Show
                                      when={
                                        playerAmbientType() === "static" &&
                                        playerAmbientColor().toLowerCase() ===
                                          col.toLowerCase()
                                      }
                                    >
                                      <i class="ph-bold ph-check"></i>
                                    </Show>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </Show>

                          {/* Custom color picker */}
                          <div class="player-ambient-palette-section">
                            <div class="player-ambient-palette-label">
                              <span>Custom Color</span>
                            </div>
                            <div class="player-ambient-palette-swatches">
                              <label
                                class="player-video-color-picker-label"
                                title="Custom color picker"
                              >
                                <input
                                  type="color"
                                  value={playerAmbientColor()}
                                  onInput={(e) => {
                                    updatePlayerAmbientColor(
                                      e.currentTarget.value,
                                    );
                                    togglePlayerAmbientType("static");
                                  }}
                                />
                                <i class="ph-bold ph-plus"></i>
                              </label>
                            </div>
                          </div>

                          {/* Audio-Reactive Dynamic Glow Section */}
                          <div class="player-ambient-palette-section">
                            <div class="player-ambient-audio-row">
                              <button
                                type="button"
                                class={`player-ambient-mode-btn ${playerAmbientAudioReactive() ? "active" : ""}`}
                                onClick={() => togglePlayerAmbientAudioReactive()}
                                title="Pulse ambient glow in real-time with music bass and audio beats"
                              >
                                <i class="ph-bold ph-waveform"></i>
                                <span>Audio Reactive</span>
                              </button>
                            </div>
                            <Show when={playerAmbientAudioReactive()}>
                              <div class="player-ambient-slider-section">
                                <div class="player-ambient-slider-label">
                                  <span>Bass Reactivity</span>
                                  <span>{playerAmbientAudioSensitivity()}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="30"
                                  max="200"
                                  step="5"
                                  value={playerAmbientAudioSensitivity()}
                                  onInput={(e) =>
                                    updatePlayerAmbientAudioSensitivity(
                                      Number(e.currentTarget.value),
                                    )
                                  }
                                  class="player-ambient-range-slider"
                                />
                              </div>
                            </Show>
                          </div>
                        </div>
                      </Show>
                      <button
                        class={`player-popup-item ${isLooping() ? "selected" : ""}`}
                        onClick={() => {
                          setIsLooping(!isLooping());
                          setShowSettingsMenu(false);
                        }}
                      >
                        <span>Loop Video</span>
                        <i
                          class={`ph-fill ph-toggle-${isLooping() ? "right" : "left"}`}
                        ></i>
                      </button>
                      <button
                        class="player-popup-item"
                        onClick={() => {
                          togglePiP();
                          setShowSettingsMenu(false);
                        }}
                      >
                        <span>Picture in Picture</span>
                        <i class="ph-fill ph-picture-in-picture"></i>
                      </button>
                    </div>

                    <button
                      ref={ccBtnRef}
                      class={`control-btn ${subtitlesEnabled() ? "active" : ""}`}
                      title="Subtitles/CC (C)"
                      onClick={() => {
                        setShowCCMenu(!showCCMenu());
                        setShowSettingsMenu(false);
                      }}
                    >
                      <i class="ph-fill ph-closed-captioning"></i>
                    </button>

                    <button
                      ref={settingsBtnRef}
                      class="control-btn"
                      title="Settings"
                      onClick={() => {
                        setShowSettingsMenu(!showSettingsMenu());
                        setShowCCMenu(false);
                      }}
                    >
                      <i class="ph-fill ph-gear"></i>
                    </button>

                    <button
                      class="control-btn"
                      title="Miniplayer (I)"
                      onClick={toggleMiniplayerMode}
                    >
                      <i class="ph-fill ph-picture-in-picture"></i>
                    </button>

                    <button
                      class="control-btn"
                      onClick={() => setTheaterMode(!theaterMode())}
                      title={
                        theaterMode() ? "Default view (T)" : "Theater mode (T)"
                      }
                    >
                      <i
                        class={
                          theaterMode() ? "ph-fill ph-monitor" : "ph ph-monitor"
                        }
                      ></i>
                    </button>

                    <button
                      class="control-btn"
                      onClick={() => setShowArcadeModal(true)}
                      title="Stream Runner Arcade (G)"
                      aria-label="Play Stream Runner Arcade"
                    >
                      <i class="ph-fill ph-game-controller"></i>
                    </button>

                    <button
                      class="control-btn"
                      onClick={() => setShowShortcutsModal(true)}
                      title="Keyboard Shortcuts (?)"
                    >
                      <i class="ph ph-keyboard"></i>
                    </button>

                    <button
                      class="control-btn"
                      onClick={toggleFullscreen}
                      title="Fullscreen (F)"
                    >
                      <i
                        class={`ph-fill ph-${isFullscreen() ? "corners-in" : "corners-out"}`}
                      ></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="player-meta-block">
            <Show
              when={isEditingMeta()}
              fallback={
                <div class="player-title-row">
                  <h1 class="player-title">{video()!.title}</h1>
                  <button
                    class="player-meta-edit-btn"
                    onClick={() => {
                      setEditTitle(video()!.title);
                      setEditChannel(video()!.channel);
                      setIsEditingMeta(true);
                    }}
                    title="Edit Title & Artist"
                  >
                    <i class="ph-fill ph-pencil-simple"></i>
                  </button>
                </div>
              }
            >
              <div class="player-meta-edit-card">
                <div class="player-meta-edit-header">
                  <i class="ph-fill ph-pencil-simple"></i>
                  <span>Edit Video Details</span>
                </div>
                <div class="player-meta-edit-fields">
                  <div class="player-meta-input-group">
                    <label class="player-meta-label">Title</label>
                    <div class="player-meta-input-wrapper">
                      <i class="ph ph-video"></i>
                      <input
                        class="player-meta-input"
                        value={editTitle()}
                        onInput={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveMetadata();
                          if (e.key === "Escape") setIsEditingMeta(false);
                        }}
                        placeholder="Video title..."
                        autofocus
                      />
                    </div>
                  </div>
                  <div class="player-meta-input-group">
                    <label class="player-meta-label">Channel / Artist</label>
                    <div class="player-meta-input-wrapper">
                      <i class="ph ph-user"></i>
                      <input
                        class="player-meta-input"
                        value={editChannel()}
                        onInput={(e) => setEditChannel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveMetadata();
                          if (e.key === "Escape") setIsEditingMeta(false);
                        }}
                        placeholder="Artist or channel..."
                      />
                    </div>
                  </div>
                </div>
                <div class="player-meta-edit-actions">
                  <button
                    class="primary-btn player-meta-save-btn"
                    onClick={handleSaveMetadata}
                  >
                    <i class="ph-bold ph-check"></i> Save Changes
                  </button>
                  <button
                    class="clay-btn player-meta-cancel-btn"
                    onClick={() => setIsEditingMeta(false)}
                  >
                    <i class="ph-bold ph-x"></i> Cancel
                  </button>
                </div>
              </div>
            </Show>

            <div class="flex-row-between player-meta-row">
              <div class="flex-row-gap">
                <img
                  src={`http://127.0.0.1:1422/Avatars/${video()!.channel}.jpg`}
                  onError={(e) => {
                    e.currentTarget.src = "";
                    e.currentTarget.className = "ph-fill ph-user avatar-small";
                  }}
                  class="avatar-small"
                />
                <div>
                  <h3
                    class="player-channel"
                    onClick={() =>
                      navigate(
                        `/artist/${encodeURIComponent(video()!.channel)}`,
                      )
                    }
                  >
                    {video()!.channel}
                  </h3>
                </div>
              </div>

              <div class="player-meta-actions">
                <button
                  class="clay-btn player-add-playlist-btn"
                  onClick={() => setShowAddToModal(true)}
                  title="Add to Playlist"
                >
                  <i class="ph-bold ph-plus-circle"></i>
                  Add to Playlist
                </button>

                <button
                  class={`clay-btn player-favorite-status ${isFavorite() ? "active" : ""}`}
                  onClick={toggleFavoriteStatus}
                  title={
                    isFavorite()
                      ? "Remove from Favourites"
                      : "Add to Favourites"
                  }
                >
                  <i
                    class={isFavorite() ? "ph-fill ph-heart" : "ph ph-heart"}
                  ></i>
                  {isFavorite() ? "Favourited" : "Favourite"}
                </button>
              </div>
            </div>

            <div
              class={`player-desc-box ${descExpanded() ? "expanded" : ""}`}
              onClick={() => {
                if (!descExpanded()) setDescExpanded(true);
              }}
            >
              <div class="desc-meta">
                <span>{formatTime(duration())} length</span>
                <span>•</span>
                <span>Local Hardware Library</span>
              </div>
              <div>{description()}</div>
              <Show when={descExpanded()}>
                <div
                  class="desc-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDescExpanded(false);
                  }}
                >
                  Show less
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <div class="player-sidebar">
        <h3 class="settings-title">Up next</h3>
        <For each={queue()}>
          {(qVideo) => (
            <div
              class="queue-item"
              onClick={() => {
                const qs = new URLSearchParams(
                  searchParams as Record<string, string>,
                ).toString();
                navigate(`/player/${qVideo.id}${qs ? `?${qs}` : ""}`);
              }}
            >
              <div class="queue-thumbnail-wrapper">
                <img
                  src={getThumbnailUrl(qVideo)}
                  class="queue-thumbnail"
                  alt={qVideo.title}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div class="queue-meta">
                <span class="queue-title" title={qVideo.title}>
                  {qVideo.title}
                </span>
                <div class="queue-channel-group">
                  <img
                    src={
                      qVideo.avatar_path
                        ? convertFileSrc(qVideo.avatar_path)
                        : `http://127.0.0.1:1422/Avatars/${encodeURIComponent(qVideo.channel)}.jpg`
                    }
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    class="queue-avatar"
                    alt={qVideo.channel}
                    loading="lazy"
                    decoding="async"
                  />
                  <span class="queue-channel" title={qVideo.channel}>
                    {qVideo.channel}
                  </span>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
      <AddToPlaylistModal
        isOpen={showAddToModal()}
        videoId={video()?.id || null}
        videoTitle={video()?.title}
        onClose={() => setShowAddToModal(false)}
      />
    </div>
  );
}
