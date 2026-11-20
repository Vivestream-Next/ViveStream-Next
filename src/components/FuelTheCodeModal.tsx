import { Component, createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import {
  showFuelModal,
  setShowFuelModal,
  supporterWatchSeconds,
  supporterAdsCompleted,
  supporterAutoLoop,
  supporterMuted,
  supporterTier,
  SUPPORTER_BADGES,
  SupporterTierId,
  addSupporterWatchSeconds,
  recordCompletedAd,
  updateSupporterAutoLoop,
  updateSupporterMuted,
} from "../store";
import "./FuelTheCodeModal.css";

// Royalty-free community developer / tech clips for the voluntary stream
const COMMUNITY_CLIPS = [
  {
    title: "Rust & High-Performance Audio Processing",
    sponsor: "Open Source Audio Community",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    duration: 15,
  },
  {
    title: "Vulkan GPU Acceleration for Whisper",
    sponsor: "ViveStream Neural Research",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    duration: 15,
  },
  {
    title: "Material You Dynamic Acoustics",
    sponsor: "Acoustic Design Lab",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    duration: 15,
  },
];

export const FuelTheCodeModal: Component = () => {
  let videoRef: HTMLVideoElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentClipIndex, setCurrentClipIndex] = createSignal(0);
  const [clipSecondsLeft, setClipSecondsLeft] = createSignal(15);

  const currentBadge = () => SUPPORTER_BADGES[supporterTier()];

  // Close with Escape key
  createEffect(() => {
    if (!showFuelModal()) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowFuelModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  // Watch timer heartbeat
  createEffect(() => {
    if (!showFuelModal() || !isPlaying()) return;

    const interval = setInterval(() => {
      addSupporterWatchSeconds(1);
      setClipSecondsLeft((prev) => (prev > 1 ? prev - 1 : 15));
    }, 1000);

    onCleanup(() => clearInterval(interval));
  });

  const handlePlayToggle = () => {
    if (!videoRef) return;
    if (isPlaying()) {
      videoRef.pause();
      setIsPlaying(false);
    } else {
      videoRef.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleMuteToggle = () => {
    const next = !supporterMuted();
    updateSupporterMuted(next);
    if (videoRef) {
      videoRef.muted = next;
    }
  };

  const handleVideoEnded = () => {
    recordCompletedAd();
    if (supporterAutoLoop()) {
      const nextIndex = (currentClipIndex() + 1) % COMMUNITY_CLIPS.length;
      setCurrentClipIndex(nextIndex);
      setClipSecondsLeft(COMMUNITY_CLIPS[nextIndex].duration);
      if (videoRef) {
        videoRef.src = COMMUNITY_CLIPS[nextIndex].src;
        videoRef.play().catch(() => {});
      }
    } else {
      setIsPlaying(false);
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  // Next tier progress calculation
  const nextTierInfo = () => {
    const tier = supporterTier();
    if (tier === "none") return { target: 60, name: "Code Spark" };
    if (tier === "spark") return { target: 300, name: "Copper Booster" };
    if (tier === "copper") return { target: 900, name: "Silver Catalyst" };
    if (tier === "silver") return { target: 1800, name: "Gold Patron" };
    if (tier === "gold") return { target: 3600, name: "Obsidian Legend" };
    return { target: 3600, name: "Maximum Honor Reached!" };
  };

  const progressPercent = () => {
    const current = supporterWatchSeconds();
    const next = nextTierInfo().target;
    if (supporterTier() === "obsidian") return 100;
    return Math.min(100, Math.round((current / next) * 100));
  };

  return (
    <Show when={showFuelModal()}>
      <div
        class="fuel-modal-backdrop"
        onClick={() => setShowFuelModal(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Fuel the Code Community Supporter Lounge"
      >
        <div class="fuel-modal-window" onClick={(e) => e.stopPropagation()}>
          {/* Top Bar */}
          <div class="fuel-modal-header">
            <div class="fuel-header-left">
              <i class="ph-fill ph-fire fuel-header-icon"></i>
              <div>
                <h3 class="fuel-header-title">Fuel the Code • Supporter Lounge</h3>
                <div class="fuel-header-subtitle">
                  Voluntary developer patronage — Support continuous development without spending a dime
                </div>
              </div>
            </div>
            <button
              type="button"
              class="fuel-close-btn"
              onClick={() => setShowFuelModal(false)}
              aria-label="Close Supporter Lounge"
            >
              <i class="ph-bold ph-x"></i>
            </button>
          </div>

          {/* Modal Content */}
          <div class="fuel-modal-body">
            {/* Transparency Manifesto */}
            <div class="fuel-manifesto-box">
              <div class="manifesto-icon-wrap">
                <i class="ph-fill ph-heart-handshake"></i>
              </div>
              <div class="manifesto-text">
                <h4>Why We Show Voluntary Ads</h4>
                <p>
                  ViveStream is an independent, non-corporate open-source project. We refuse to force annoying
                  popups, intrusive banners, or lock core player features behind paywalls. Instead, this lounge
                  lets you voluntarily fuel server bandwidth, Whisper compute, and ongoing feature development.
                  Leave this player looping on mute while you study or code to level up your Supporter Badge!
                </p>
              </div>
            </div>

            {/* Main Stage Grid */}
            <div class="fuel-stage-grid">
              {/* Ad Player Card (Left) */}
              <div class="fuel-player-card">
                <div class="fuel-video-container">
                  <span class="fuel-ad-badge">
                    <i class="ph-bold ph-broadcast"></i> Voluntary Ad Stream
                  </span>
                  <span class="fuel-timer-badge">
                    {clipSecondsLeft()}s remaining
                  </span>

                  <video
                    ref={videoRef}
                    class="fuel-video-el"
                    src={COMMUNITY_CLIPS[currentClipIndex()].src}
                    muted={supporterMuted()}
                    playsinline
                    onEnded={handleVideoEnded}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                </div>

                {/* Player Controls */}
                <div class="fuel-player-controls">
                  <div class="fuel-btn-group">
                    <button
                      type="button"
                      class={`fuel-ctrl-btn ${isPlaying() ? "active" : ""}`}
                      onClick={handlePlayToggle}
                    >
                      <i class={`ph-bold ${isPlaying() ? "ph-pause" : "ph-play"}`}></i>
                      {isPlaying() ? "Pause Stream" : "Play & Fuel Code"}
                    </button>
                    <button
                      type="button"
                      class="fuel-ctrl-btn"
                      onClick={handleMuteToggle}
                      title={supporterMuted() ? "Unmute Ad Sound" : "Mute Ad Sound (Recommended)"}
                    >
                      <i class={`ph-bold ${supporterMuted() ? "ph-speaker-simple-slash" : "ph-speaker-simple-high"}`}></i>
                      {supporterMuted() ? "Muted" : "Sound On"}
                    </button>
                  </div>

                  <label class="fuel-loop-toggle" title="Keep stream looping continuously in background">
                    <input
                      type="checkbox"
                      checked={supporterAutoLoop()}
                      onChange={(e) => updateSupporterAutoLoop(e.currentTarget.checked)}
                    />
                    <span>Continuous Loop Mode</span>
                  </label>
                </div>
              </div>

              {/* Supporter Status & Stats (Right) */}
              <div class="fuel-status-card">
                <div
                  class="active-badge-hero"
                  style={{
                    background: supporterTier() === "none" ? "var(--tertiary-background)" : currentBadge().bgGradient,
                    "border-color": supporterTier() === "none" ? "var(--border-color)" : currentBadge().color,
                  }}
                >
                  <div
                    class="active-badge-icon-box"
                    style={{ color: supporterTier() === "none" ? "var(--primary-accent)" : currentBadge().color }}
                  >
                    <i class={`ph-fill ${currentBadge().icon}`}></i>
                  </div>
                  <div class="active-badge-details">
                    <h3>{currentBadge().name}</h3>
                    <span
                      class="active-badge-tag"
                      style={{ color: supporterTier() === "none" ? "var(--primary-text)" : currentBadge().color }}
                    >
                      {currentBadge().respectTag}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div class="fuel-metrics-grid">
                  <div class="fuel-metric-box">
                    <span class="metric-label">Support Time Fueled</span>
                    <span class="metric-val">{formatTime(supporterWatchSeconds())}</span>
                  </div>
                  <div class="fuel-metric-box">
                    <span class="metric-label">Completed Clips</span>
                    <span class="metric-val">{supporterAdsCompleted()}</span>
                  </div>
                </div>

                {/* Progress toward next level */}
                <div class="fuel-progress-section">
                  <div class="fuel-progress-header">
                    <span>Next Rank: <strong>{nextTierInfo().name}</strong></span>
                    <span>{progressPercent()}%</span>
                  </div>
                  <div class="fuel-progress-bar-track">
                    <div
                      class="fuel-progress-bar-fill"
                      style={{ width: `${progressPercent()}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Supporter Badge Hierarchy Grid */}
            <div class="fuel-badges-section">
              <div class="fuel-section-label">
                <i class="ph-bold ph-medal"></i> Community Supporter Badge Hierarchy
              </div>
              <div class="fuel-badges-grid">
                <For each={(["spark", "copper", "silver", "gold", "obsidian"] as SupporterTierId[])}>
                  {(tierKey) => {
                    const badge = SUPPORTER_BADGES[tierKey];
                    const isUnlocked = () =>
                      supporterWatchSeconds() >= badge.minSeconds ||
                      supporterAdsCompleted() >= badge.minAds;
                    const isActive = () => supporterTier() === tierKey;

                    return (
                      <div
                        class={`badge-card ${isUnlocked() ? "unlocked" : "locked"} ${isActive() ? "active-tier" : ""}`}
                        style={{
                          "border-color": isUnlocked() ? badge.color : undefined,
                        }}
                      >
                        <div class="badge-top">
                          <i class={`ph-fill ${badge.icon}`} style={{ color: badge.color }}></i>
                          <span
                            class="badge-status-chip"
                            style={{
                              color: isUnlocked() ? badge.color : "inherit",
                              background: isUnlocked() ? "rgba(255,255,255,0.08)" : undefined,
                            }}
                          >
                            {isActive() ? "Active" : isUnlocked() ? "Earned" : "Locked"}
                          </span>
                        </div>
                        <div class="badge-name">{badge.name}</div>
                        <div class="badge-req">{badge.minSeconds / 60}m or {badge.minAds} ads</div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default FuelTheCodeModal;
