import {
  Component,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  untrack,
  Show,
} from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import {
  activeVideo,
  setActiveVideo,
  isPlaying,
  setIsPlaying,
  currentTime,
  setCurrentTime,
  duration,
  setDuration,
  volume,
  isMuted,
  playerQueue,
  miniplayerDismissed,
  playerContextParams,
  setGlobalVideoRef,
  toggleGlobalPlay,
  toggleGlobalMute,
  toggleGlobalPiP,
  closeGlobalMiniplayer,
  seekGlobalPlay,
  playerAmbientMode,
  playerAmbientColor,
  playerAmbientType,
  playerAmbientIntensity,
  playerAmbientBlur,
  playerAmbientAudioReactive,
  playerAmbientAudioSensitivity,
} from "../store";
import {
  extractDominantVideoColors,
  hexToRgb,
  rgbToHex,
  lerpColor,
  logAmbient,
  getSharedAudioReactiveEngine,
} from "../utils/ambientLighting";
import "./Miniplayer.css";

const formatTime = (timeInSeconds: number) => {
  if (isNaN(timeInSeconds) || timeInSeconds < 0) return "0:00";
  const h = Math.floor(timeInSeconds / 3600);
  const m = Math.floor((timeInSeconds % 3600) / 60);
  const s = Math.floor(timeInSeconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const Miniplayer: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isHovered, setIsHovered] = createSignal(false);
  const [isSeeking, setIsSeeking] = createSignal(false);
  const [seekTime, setSeekTime] = createSignal(0);
  const [currentDominantColor, setCurrentDominantColor] =
    createSignal("#f25c54");
  const [, setExtractedVideoColors] = createSignal<string[]>([]);

  let videoRef: HTMLVideoElement | undefined;
  let ambientCanvasRef: HTMLCanvasElement | undefined;
  let ambientGlowRef: HTMLDivElement | undefined;
  let ambientCtx: CanvasRenderingContext2D | null = null;
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;
  let lastAmbientDraw = 0;
  let currentSmoothedRgb = { r: 242, g: 92, b: 84 };

  const isPlayerPage = () => {
    try {
      return location?.pathname
        ? location.pathname.startsWith("/player")
        : false;
    } catch {
      return typeof window !== "undefined"
        ? window.location.pathname.startsWith("/player")
        : false;
    }
  };

  const shouldShow = () => {
    return !isPlayerPage() && activeVideo() !== null && !miniplayerDismissed();
  };

  let isFetchingRustColors = false;
  let lastRustFetchTime = -10;

  let lastPaletteUpdateTime = 0;
  const arePalettesEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
    }
    return true;
  };

  const fetchRustDominantColors = async (targetId: string, time: number) => {
    if (isFetchingRustColors || !playerAmbientMode()) return;
    if (Math.abs(time - lastRustFetchTime) < 1.0) return;
    isFetchingRustColors = true;
    lastRustFetchTime = time;
    try {
      logAmbient("Mini:RustFetchStart", { targetId, timestamp: time }, 0);
      const res = await invoke<{ dominant: string; palette: string[] }>(
        "extract_video_dominant_colors",
        {
          videoId: targetId,
          timestamp: time,
        },
      );
      if (res && res.dominant) {
        logAmbient("Mini:RustFetchSuccess", res, 0);
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
      logAmbient("Mini:RustFetchError", err, 0);
    } finally {
      isFetchingRustColors = false;
    }
  };

  let ambientLoopActive = false;
  let ambientRafId: number | null = null;
  let ambientSampleCount = 0;

  const stopAmbientLoop = () => {
    ambientLoopActive = false;
    if (ambientRafId !== null) {
      cancelAnimationFrame(ambientRafId);
      ambientRafId = null;
    }
  };

  const drawAmbientFrame = (now?: number, force = false) => {
    if (!videoRef || !playerAmbientMode() || !shouldShow()) {
      return;
    }
    const time = now ?? performance.now();
    const isDynamic = playerAmbientType() === "dynamic";

    if (force || time - lastAmbientDraw >= 33) {
      lastAmbientDraw = time;

      if (videoRef.readyState >= 2 && videoRef.videoWidth > 0) {
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
              logAmbient("Mini:CanvasDrawError", canvasErr);
            }
          }
        }

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
            logAmbient("Mini:DynamicSample", {
              sample: ambientSampleCount,
              dominant: smoothedHex,
              rawDominant: dominant,
              saturation: saturation ? saturation.toFixed(2) : undefined,
              score: vibranceScore ? Math.round(vibranceScore) : undefined,
              videoTime: `${videoRef.currentTime.toFixed(1)}s`,
            });
          } catch (extractErr) {
            logAmbient("Mini:OffscreenExtractError", extractErr);
            if (activeVideo()?.id) {
              fetchRustDominantColors(activeVideo()!.id, videoRef.currentTime);
            }
          }
        }
      } else if (activeVideo()?.id) {
        logAmbient("Mini:VideoNotReady", {
          readyState: videoRef.readyState,
          videoWidth: videoRef.videoWidth,
          videoId: activeVideo()!.id,
        });
        fetchRustDominantColors(activeVideo()!.id, videoRef?.currentTime ?? 0);
      }

      // Continuous background sync with Rust backend (every 1.5s) to guarantee accurate colors on all platforms
      if (
        activeVideo()?.id &&
        videoRef &&
        !videoRef.paused &&
        time - lastRustFetchTime >= 1500
      ) {
        fetchRustDominantColors(activeVideo()!.id, videoRef.currentTime);
      }

      // Audio-Reactive Dynamic Glow Modulation for Miniplayer
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
          logAmbient("Mini:AudioPulseError", audioErr, 3000);
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
    if (!ambientLoopActive) return;

    const isActivelyPlaying =
      (isPlaying() || (videoRef && !videoRef.paused && !videoRef.ended)) &&
      playerAmbientMode() &&
      (playerAmbientType() === "dynamic" || playerAmbientAudioReactive()) &&
      shouldShow();

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
    const show = shouldShow();

    if (ambient && show) {
      logAmbient(
        "Mini:EffectTrigger",
        { playing, type, hasVideo: !!activeVideo() },
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

  const handleExpand = (e?: Event) => {
    if (e) e.stopPropagation();
    const vid = activeVideo();
    if (!vid) return;
    if (videoRef) {
      setCurrentTime(videoRef.currentTime);
    }
    const params = playerContextParams();
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    navigate(`/player/${vid.id}${qs ? `?${qs}` : ""}`);
  };

  const handlePlayNext = (e?: Event) => {
    if (e) e.stopPropagation();
    const q = playerQueue();
    if (q.length > 0) {
      const nextVid = q[0];
      setPlayerQueue(q.slice(1));
      setCurrentTime(0);
      setIsPlaying(true);
      setActiveVideo(nextVid);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const handlePlayPrev = async (e?: Event) => {
    if (e) e.stopPropagation();
    const vid = activeVideo();
    if (!vid) return;
    try {
      const db = await invoke<any[]>("get_downloaded_videos");
      const currentIndex = db.findIndex((v) => v.id === vid.id);
      let prevVid = null;
      if (currentIndex > 0) {
        prevVid = db[currentIndex - 1];
      } else if (db.length > 0) {
        prevVid = db[db.length - 1];
      }
      if (prevVid) {
        setCurrentTime(0);
        setIsPlaying(true);
        setActiveVideo(prevVid);
      }
    } catch (err) {
      console.error("Failed to play previous:", err);
    }
  };

  const handleSliderInput = (e: Event) => {
    e.stopPropagation();
    setIsSeeking(true);
    const val = parseFloat((e.target as HTMLInputElement).value);
    setSeekTime(val);
  };

  const handleSliderChange = (e: Event) => {
    e.stopPropagation();
    setIsSeeking(false);
    const val = parseFloat((e.target as HTMLInputElement).value);
    seekGlobalPlay(val);
  };

  createEffect(() => {
    if (shouldShow() && videoRef) {
      setGlobalVideoRef(videoRef);
      videoRef.volume = volume();
      videoRef.muted = isMuted();

      const initialTime = untrack(() => currentTime());
      if (
        initialTime > 0 &&
        Math.abs(videoRef.currentTime - initialTime) > 0.5
      ) {
        videoRef.currentTime = initialTime;
      }
      const initialPlaying = untrack(() => isPlaying());
      if (initialPlaying && videoRef.paused) {
        videoRef
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsPlaying(false);
          });
      }
    } else if (!shouldShow() && videoRef) {
      try {
        videoRef.pause();
        videoRef.removeAttribute("src");
        videoRef.load();
      } catch {}
    }
  });

  createEffect(() => {
    if (videoRef) {
      videoRef.volume = volume();
      videoRef.muted = isMuted();
    }
  });

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (shouldShow()) {
        if (e.key === "i" || e.key === "I") {
          e.preventDefault();
          handleExpand();
        }
        if (e.code === "Space" || e.key === "k" || e.key === "K") {
          e.preventDefault();
          toggleGlobalPlay();
        }
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleGlobalMute();
        }
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          handlePlayNext();
        }
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          handlePlayPrev();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      if (ambientRafId) {
        cancelAnimationFrame(ambientRafId);
        ambientRafId = null;
      }
    });
  });

  const seekProgress = () => {
    const total = duration();
    if (total <= 0) return 0;
    const current = isSeeking() ? seekTime() : currentTime();
    return (current / total) * 100;
  };

  const effectiveAmbientColor = () => {
    if (playerAmbientType() === "static") {
      return playerAmbientColor();
    }
    return currentDominantColor() || playerAmbientColor() || "#f25c54";
  };

  return (
    <Show when={shouldShow()}>
      <div
        class="miniplayer-container"
        onClick={handleExpand}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={
          {
            "--mini-ambient-color": effectiveAmbientColor(),
            "--mini-ambient-blur": `${Math.min(50, playerAmbientBlur())}px`,
            "--mini-ambient-opacity": `${playerAmbientIntensity() / 100}`,
          } as any
        }
      >
        <Show when={playerAmbientMode()}>
          <div
            ref={ambientGlowRef}
            class="miniplayer-ambient-glow"
            style={{
              background:
                playerAmbientType() === "dynamic"
                  ? currentDominantColor()
                  : playerAmbientColor(),
              filter: `blur(${Math.min(50, playerAmbientBlur())}px)`,
              opacity: `${playerAmbientIntensity() / 100}`,
            }}
            aria-hidden="true"
          />
          <canvas
            ref={ambientCanvasRef}
            class={`miniplayer-ambient-canvas ${playerAmbientType() !== "dynamic" ? "hidden" : ""}`}
            width="120"
            height="68"
            aria-hidden="true"
          />
        </Show>

        <div class="miniplayer-card" onClick={handleExpand}>
          <div class="miniplayer-media-box" onClick={handleExpand}>
            <video
              ref={videoRef}
              class="miniplayer-video-element"
              src={`http://127.0.0.1:1422/Videos/${activeVideo()!.id}.${activeVideo()?.video_path ? activeVideo()!.video_path.split('.').pop() || 'mp4' : 'mp4'}`}
              preload="auto"
              autoplay
              crossOrigin="anonymous"
              onCanPlay={() => {
                if (videoRef) {
                  const savedTime = untrack(currentTime);
                  if (
                    savedTime > 0 &&
                    Math.abs(videoRef.currentTime - savedTime) > 0.5
                  ) {
                    videoRef.currentTime = savedTime;
                  }
                  if (untrack(isPlaying) && videoRef.paused) {
                    videoRef
                      .play()
                      .then(() => setIsPlaying(true))
                      .catch(() => setIsPlaying(false));
                  }
                }
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                if (videoRef) {
                  const savedTime = untrack(currentTime);
                  if (savedTime > 0) {
                    videoRef.currentTime = savedTime;
                  }
                  if (untrack(isPlaying) && videoRef.paused) {
                    videoRef
                      .play()
                      .then(() => setIsPlaying(true))
                      .catch(() => setIsPlaying(false));
                  }
                }
              }}
              onSeeked={() => {
                if (videoRef && untrack(isPlaying) && videoRef.paused) {
                  videoRef
                    .play()
                    .then(() => setIsPlaying(true))
                    .catch(() => setIsPlaying(false));
                }
                drawAmbientFrame(undefined, true);
                if (videoRef && !videoRef.paused && !videoRef.ended) {
                  startAmbientLoop();
                }
              }}
              onPlay={() => {
                if (!shouldShow()) return;
                setIsPlaying(true);
                startAmbientLoop();
                invoke("update_playback_status", { playing: true }).catch(
                  () => {},
                );
              }}
              onPause={() => {
                if (!shouldShow() || (videoRef && videoRef.seeking)) return;
                setIsPlaying(false);
                stopAmbientLoop();
                drawAmbientFrame(undefined, true);
                invoke("update_playback_status", { playing: false }).catch(
                  () => {},
                );
              }}
              onTimeUpdate={(e) => {
                if (!isSeeking() && shouldShow()) {
                  setCurrentTime(e.currentTarget.currentTime);
                  if (
                    videoRef &&
                    videoRef.paused &&
                    isPlaying() &&
                    !videoRef.seeking
                  ) {
                    setIsPlaying(false);
                  }
                  if (!ambientLoopActive && !e.currentTarget.paused && !e.currentTarget.ended) {
                    startAmbientLoop();
                  }
                }
              }}
              onEnded={handlePlayNext}
            />

            <div class="miniplayer-top-row">
              <div
                class="miniplayer-badge"
                onClick={handleExpand}
                title="Expand to Full Player"
              >
                <i class="ph-fill ph-airplay"></i>
                <span>Miniplayer</span>
              </div>
              <div class="miniplayer-top-actions">
                <button
                  type="button"
                  class="miniplayer-icon-btn"
                  onClick={handleExpand}
                  title="Expand (I)"
                >
                  <i class="ph-bold ph-corners-out"></i>
                </button>
                <button
                  type="button"
                  class="miniplayer-icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGlobalPiP();
                  }}
                  title="Picture-in-Picture"
                >
                  <i class="ph-bold ph-picture-in-picture"></i>
                </button>
                <button
                  type="button"
                  class="miniplayer-icon-btn close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeGlobalMiniplayer();
                  }}
                  title="Close Miniplayer"
                >
                  <i class="ph-bold ph-x"></i>
                </button>
              </div>
            </div>

            <div
              class={`miniplayer-overlay ${isHovered() || isSeeking() ? "visible" : ""}`}
            >
              <div class="miniplayer-center-controls">
                <button
                  type="button"
                  class="miniplayer-ctrl-btn"
                  onClick={handlePlayPrev}
                  title="Previous Video (P)"
                >
                  <i class="ph-fill ph-skip-back"></i>
                </button>
                <button
                  type="button"
                  class="miniplayer-ctrl-btn play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGlobalPlay();
                  }}
                  title={isPlaying() ? "Pause (Space)" : "Play (Space)"}
                >
                  <i class={`ph-fill ph-${isPlaying() ? "pause" : "play"}`}></i>
                </button>
                <button
                  type="button"
                  class="miniplayer-ctrl-btn"
                  onClick={handlePlayNext}
                  title="Next Video (N)"
                >
                  <i class="ph-fill ph-skip-forward"></i>
                </button>
              </div>

              <div
                class="miniplayer-bottom-slider"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="range"
                  class="custom-slider mini-slider"
                  min="0"
                  max={duration() || 100}
                  step="0.1"
                  value={isSeeking() ? seekTime() : currentTime()}
                  onInput={handleSliderInput}
                  onChange={handleSliderChange}
                  style={{ "--progress": `${seekProgress()}%` } as any}
                  aria-label="Seek Video"
                />
              </div>
            </div>
          </div>

          <div class="miniplayer-meta-bar" onClick={handleExpand}>
            <div class="miniplayer-text-wrap">
              <span class="miniplayer-title" title={activeVideo()?.title}>
                {activeVideo()?.title || "Playing Media"}
              </span>
              <span class="miniplayer-channel" title={activeVideo()?.channel}>
                {activeVideo()?.channel || "Unknown Channel"}
              </span>
            </div>
            <span class="miniplayer-time">
              {formatTime(currentTime())} / {formatTime(duration())}
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default Miniplayer;
