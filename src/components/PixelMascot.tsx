import { Component, createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import {
  showPixelMascot,
  togglePixelMascot,
  pixelMascotCharacter,
  updatePixelMascotCharacter,
  PixelMascotCharacter,
  activeVideo,
  isPlaying,
  appPalette,
  miniplayerDismissed,
} from "../store";
import "./PixelMascot.css";

/* ==========================================================================
   PIXEL CHARACTER 1: SAKURA-CHAN (90s City Pop / Anime Idol)
   ========================================================================== */
export const SakuraPixelSvg: Component<{ isBlinking?: boolean }> = (props) => {
  return (
    <svg
      viewBox="0 0 24 24"
      class="pixel-character-canvas"
      shape-rendering="crispEdges"
      aria-label="Sakura-chan Pixel Mascot"
    >
      {/* Background / Aura Sparkle */}
      <rect x="3" y="2" width="1" height="1" fill="#ffb3d1" />
      <rect x="20" y="3" width="1" height="1" fill="#ffb3d1" />
      <rect x="2" y="16" width="1" height="1" fill="#ffd6e8" />
      <rect x="21" y="15" width="1" height="1" fill="#ffd6e8" />

      {/* Cat-Ear Headphones Outer */}
      <rect x="5" y="1" width="3" height="3" fill="#2d123b" />
      <rect x="6" y="2" width="1" height="1" fill="#ff5c93" />
      <rect x="16" y="1" width="3" height="3" fill="#2d123b" />
      <rect x="17" y="2" width="1" height="1" fill="#ff5c93" />
      <rect x="7" y="3" width="10" height="1" fill="#2d123b" />

      {/* Twin Tails Hair (Back & Sides) */}
      <rect x="3" y="6" width="3" height="7" fill="#ff5c93" />
      <rect x="2" y="9" width="2" height="6" fill="#e02266" />
      <rect x="18" y="6" width="3" height="7" fill="#ff5c93" />
      <rect x="20" y="9" width="2" height="6" fill="#e02266" />

      {/* Hair Main Mass */}
      <rect x="6" y="3" width="12" height="4" fill="#ff70a5" />
      <rect x="5" y="4" width="14" height="4" fill="#ff5c93" />
      {/* Hair Highlights */}
      <rect x="7" y="4" width="4" height="1" fill="#ffb3d1" />
      <rect x="13" y="4" width="4" height="1" fill="#ffb3d1" />

      {/* Face Skin Tone */}
      <rect x="6" y="7" width="12" height="7" fill="#ffebdb" />
      <rect x="7" y="14" width="10" height="1" fill="#ffebdb" />
      <rect x="8" y="15" width="8" height="1" fill="#fedec7" />

      {/* Hair Bangs Framing Face */}
      <rect x="6" y="6" width="2" height="4" fill="#ff5c93" />
      <rect x="16" y="6" width="2" height="4" fill="#ff5c93" />
      <rect x="10" y="6" width="4" height="3" fill="#ff5c93" />

      {/* Blush Cheeks */}
      <rect x="6" y="11" width="2" height="1" fill="#ff8aa8" />
      <rect x="16" y="11" width="2" height="1" fill="#ff8aa8" />

      {/* Eyes (Open vs Blink) */}
      <Show
        when={!props.isBlinking}
        fallback={
          <>
            {/* Blinking Cute Curved Eye Slits */}
            <rect x="8" y="10" width="3" height="1" fill="#2d123b" />
            <rect x="13" y="10" width="3" height="1" fill="#2d123b" />
          </>
        }
      >
        {/* Big Sparkling Anime Eyes */}
        <rect x="8" y="9" width="3" height="3" fill="#2d123b" />
        <rect x="13" y="9" width="3" height="3" fill="#2d123b" />
        {/* Iris Glow (Neon Violet / Blue) */}
        <rect x="9" y="10" width="2" height="2" fill="#8a44bb" />
        <rect x="14" y="10" width="2" height="2" fill="#8a44bb" />
        {/* Eye Catch / Highlights */}
        <rect x="8" y="9" width="1" height="1" fill="#ffffff" />
        <rect x="13" y="9" width="1" height="1" fill="#ffffff" />
      </Show>

      {/* Cute Mouth Smile */}
      <rect x="11" y="13" width="2" height="1" fill="#d92468" />

      {/* Earphone Cuffs on Sides */}
      <rect x="4" y="8" width="2" height="3" fill="#2d123b" />
      <rect x="4" y="9" width="1" height="1" fill="#00f0ff" />
      <rect x="18" y="8" width="2" height="3" fill="#2d123b" />
      <rect x="19" y="9" width="1" height="1" fill="#00f0ff" />

      {/* Outfit / Sailor Collar & Heart Ribbon */}
      <rect x="8" y="16" width="8" height="4" fill="#2d123b" />
      <rect x="9" y="16" width="6" height="2" fill="#ffffff" />
      <rect x="11" y="17" width="2" height="2" fill="#ff3377" />
      {/* Arms / Hands holding micro player */}
      <rect x="6" y="17" width="2" height="3" fill="#ffebdb" />
      <rect x="16" y="17" width="2" height="3" fill="#ffebdb" />
      <rect x="9" y="20" width="6" height="2" fill="#1c0a27" />
      <rect x="7" y="22" width="3" height="1" fill="#ff5c93" />
      <rect x="14" y="22" width="3" height="1" fill="#ff5c93" />
    </svg>
  );
};

/* ==========================================================================
   PIXEL CHARACTER 2: NEKO-DJ (Cyberpunk Retro Arcade DJ Cat)
   ========================================================================== */
export const NekoPixelSvg: Component<{ isBlinking?: boolean }> = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      class="pixel-character-canvas"
      shape-rendering="crispEdges"
      aria-label="Neko-DJ Pixel Mascot"
    >
      {/* Cat Ears */}
      <rect x="4" y="2" width="4" height="4" fill="#1e182e" />
      <rect x="5" y="3" width="2" height="2" fill="#ff5c93" />
      <rect x="16" y="2" width="4" height="4" fill="#1e182e" />
      <rect x="17" y="3" width="2" height="2" fill="#ff5c93" />

      {/* Headband of DJ Headphones */}
      <rect x="7" y="4" width="10" height="2" fill="#05d554" />

      {/* Cat Head Base */}
      <rect x="5" y="5" width="14" height="11" fill="#28203c" />
      {/* Earphone Cuffs */}
      <rect x="3" y="7" width="3" height="5" fill="#05d554" />
      <rect x="3" y="8" width="1" height="3" fill="#ffea00" />
      <rect x="18" y="7" width="3" height="5" fill="#05d554" />
      <rect x="20" y="8" width="1" height="3" fill="#ffea00" />

      {/* Cyber Visor / Neon Shades */}
      <rect x="6" y="8" width="12" height="4" fill="#ff007f" />
      <rect x="7" y="9" width="10" height="2" fill="#00f0ff" />
      <rect x="8" y="9" width="3" height="1" fill="#ffffff" />
      <rect x="14" y="9" width="2" height="1" fill="#ffffff" />

      {/* Cat Snout / Nose / Mouth */}
      <rect x="10" y="13" width="4" height="3" fill="#f8e7f6" />
      <rect x="11" y="13" width="2" height="1" fill="#ff5c93" />
      {/* Whisker details */}
      <rect x="4" y="13" width="2" height="1" fill="#ffffff" />
      <rect x="3" y="14" width="2" height="1" fill="#ffffff" />
      <rect x="18" y="13" width="2" height="1" fill="#ffffff" />
      <rect x="19" y="14" width="2" height="1" fill="#ffffff" />

      {/* DJ Turntable Body / Jacket */}
      <rect x="6" y="16" width="12" height="5" fill="#120c22" />
      <rect x="7" y="17" width="10" height="2" fill="#00f0ff" />
      <rect x="8" y="18" width="8" height="1" fill="#ff007f" />

      {/* Paws on Decks */}
      <rect x="5" y="18" width="3" height="3" fill="#f8e7f6" />
      <rect x="16" y="18" width="3" height="3" fill="#f8e7f6" />

      {/* Animated Swishing Tail */}
      <rect x="2" y="16" width="2" height="2" fill="#28203c" />
      <rect x="1" y="14" width="2" height="3" fill="#28203c" />
      <rect x="2" y="13" width="2" height="2" fill="#ff5c93" />

      {/* Bottom Feet */}
      <rect x="8" y="21" width="3" height="2" fill="#1e182e" />
      <rect x="13" y="21" width="3" height="2" fill="#1e182e" />
    </svg>
  );
};

/* ==========================================================================
   PIXEL CHARACTER 3: BYTE-KUN (Chibi 8-Bit Arcade Console Robot)
   ========================================================================== */
export const BytePixelSvg: Component<{ isBlinking?: boolean }> = (props) => {
  return (
    <svg
      viewBox="0 0 24 24"
      class="pixel-character-canvas"
      shape-rendering="crispEdges"
      aria-label="Byte-kun Pixel Mascot"
    >
      {/* Antenna & Beacon Light */}
      <rect x="11" y="1" width="2" height="2" fill="#ffcc00" />
      <rect x="11" y="3" width="2" height="2" fill="#7c5295" />

      {/* Main Handheld Case (Pastel Lavender Neo-Retro) */}
      <rect x="4" y="5" width="16" height="16" fill="#8a5eb5" />
      <rect x="5" y="6" width="14" height="14" fill="#a475d6" />

      {/* Screen Bezel (Dark Arcade Plum) */}
      <rect x="6" y="7" width="12" height="8" fill="#1c1228" />
      {/* Screen Matrix Surface */}
      <rect x="7" y="8" width="10" height="6" fill="#2b1a3e" />

      {/* Expressive Pixel Screen Face */}
      <Show
        when={!props.isBlinking}
        fallback={
          <>
            {/* Happy Wink (> <) */}
            <rect x="8" y="10" width="2" height="1" fill="#00ffcc" />
            <rect x="9" y="9" width="1" height="1" fill="#00ffcc" />
            <rect x="9" y="11" width="1" height="1" fill="#00ffcc" />
            <rect x="14" y="10" width="2" height="1" fill="#00ffcc" />
            <rect x="14" y="9" width="1" height="1" fill="#00ffcc" />
            <rect x="14" y="11" width="1" height="1" fill="#00ffcc" />
          </>
        }
      >
        {/* Pixel Eyes */}
        <rect x="8" y="9" width="2" height="2" fill="#00ffcc" />
        <rect x="14" y="9" width="2" height="2" fill="#00ffcc" />
        {/* Animated Equalizer Smile Bar */}
        <rect x="10" y="12" width="4" height="1" fill="#ff5c93" />
        <rect x="11" y="11" width="2" height="1" fill="#ffcc00" />
      </Show>

      {/* GamePad D-Pad Controller */}
      <rect x="7" y="16" width="3" height="1" fill="#2b1a3e" />
      <rect x="8" y="15" width="1" height="3" fill="#2b1a3e" />

      {/* Action Buttons A & B */}
      <rect x="14" y="16" width="2" height="2" fill="#ff5c93" />
      <rect x="16" y="15" width="2" height="2" fill="#00ffcc" />

      {/* Mini Speaker Grille */}
      <rect x="11" y="18" width="1" height="1" fill="#2b1a3e" />
      <rect x="13" y="18" width="1" height="1" fill="#2b1a3e" />

      {/* Little Robot Feet */}
      <rect x="7" y="21" width="3" height="2" fill="#693c94" />
      <rect x="14" y="21" width="3" height="2" fill="#693c94" />
    </svg>
  );
};

/* ==========================================================================
   MAIN PIXEL MASCOT COMPONENT
   ========================================================================== */
export const PixelMascot: Component = () => {
  const [isBlinking, setIsBlinking] = createSignal(false);
  const [isMinimized, setIsMinimized] = createSignal(false);
  const [showBubble, setShowBubble] = createSignal(false);
  const [quoteIndex, setQuoteIndex] = createSignal(0);

  // Quote Collections
  const quotes: Record<PixelMascotCharacter, string[]> = {
    sakura: [
      "Sugoi! 90s City Pop beats flowing~ ★",
      "Turn up the volume, senpai! ♡",
      "Cassette tapes & neon Tokyo dreams!",
      "Enjoying your playlist session today?",
      "Sparkle on! Music makes every day magical!",
    ],
    neko: [
      "Nya~ dropping the freshest beats! 🎧",
      "Scratching on the wheels of steel, meow! 🐾",
      "Equalizer looking purr-fect!",
      "Bass boosted and ready to roll! 🔊",
      "Retro waveforms detected in the audio matrix!",
    ],
    byte: [
      "01001100 01001111 01010110 01000101 [BIT CRUSHED]!",
      "System status: 100% MAXIMUM GROOVE! 👾",
      "8-bit sound chip initialized & synced!",
      "Buffering high-voltage melody... COMPLETE!",
      "Insert coin to continue jam session! 🪙",
    ],
  };

  // Blinking loop
  onMount(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200);
    }, 3800);

    onCleanup(() => clearInterval(blinkInterval));
  });

  // Cycle Character
  const cycleCharacter = (e: MouseEvent) => {
    e.stopPropagation();
    const chars: PixelMascotCharacter[] = ["sakura", "neko", "byte"];
    const currentIdx = chars.indexOf(pixelMascotCharacter());
    const nextChar = chars[(currentIdx + 1) % chars.length];
    updatePixelMascotCharacter(nextChar);
  };

  // Click handler on mascot
  const handleMascotClick = () => {
    if (!showBubble()) {
      setShowBubble(true);
    } else {
      setQuoteIndex((prev) => (prev + 1) % quotes[pixelMascotCharacter()].length);
    }
  };

  // Current dialogue text
  const currentText = () => {
    const pal = appPalette();
    if (pal === "fresh-green" && quoteIndex() === 0) {
      return "Frosted mint & woodland breeze feels so refreshing~ 🌿";
    }
    if (pal === "retro-anime" && quoteIndex() === 0) {
      return "Neo-Tokyo City Pop is in full effect! ♡";
    }
    const list = quotes[pixelMascotCharacter()];
    return list[quoteIndex() % list.length];
  };

  const characterName = () => {
    switch (pixelMascotCharacter()) {
      case "sakura":
        return "Sakura-chan ★";
      case "neko":
        return "DJ Neko-kun 🎧";
      case "byte":
        return "Byte-kun 👾";
    }
  };

  const isMiniplayerActive = () => {
    if (typeof window === "undefined") return false;
    const isPlayer = window.location.pathname.startsWith("/player");
    return !isPlayer && activeVideo() !== null && !miniplayerDismissed();
  };

  return (
    <Show when={showPixelMascot()}>
      <div class={`pixel-mascot-container ${isMiniplayerActive() ? "with-miniplayer" : ""}`}>
        <Show
          when={!isMinimized()}
          fallback={
            <button
              type="button"
              class="pixel-mascot-dock-pill"
              onClick={() => setIsMinimized(false)}
              title="Expand Pixel Anime Companion"
              aria-label="Expand Pixel Mascot"
            >
              <i class="ph ph-sparkle"></i>
              <span>{characterName()}</span>
            </button>
          }
        >
          {/* Speech Bubble */}
          <Show when={showBubble()}>
            <div class="pixel-mascot-bubble" role="dialog" aria-label="Mascot message">
              <div class="pixel-bubble-header">
                <span class="pixel-bubble-name">
                  <i class="ph ph-sparkle"></i> {characterName()}
                </span>
                <div class="pixel-bubble-actions">
                  <button
                    type="button"
                    class="pixel-bubble-btn"
                    onClick={cycleCharacter}
                    title="Change Mascot Character"
                    aria-label="Change Mascot Character"
                  >
                    <i class="ph ph-arrows-clockwise"></i>
                  </button>
                  <button
                    type="button"
                    class="pixel-bubble-btn"
                    onClick={() => setIsMinimized(true)}
                    title="Minimize Companion"
                    aria-label="Minimize Companion"
                  >
                    <i class="ph ph-minus"></i>
                  </button>
                  <button
                    type="button"
                    class="pixel-bubble-btn"
                    onClick={() => setShowBubble(false)}
                    title="Close speech bubble"
                    aria-label="Close speech bubble"
                  >
                    <i class="ph ph-x"></i>
                  </button>
                </div>
              </div>

              <p class="pixel-bubble-text">{currentText()}</p>

              <Show when={activeVideo() && isPlaying()}>
                <div class="pixel-bubble-song-tag" title={activeVideo()?.title}>
                  <i class="ph ph-music-notes"></i>
                  <span>Jamming now~</span>
                </div>
              </Show>
            </div>
          </Show>

          {/* Interactive Mascot Body */}
          <div
            class={`pixel-mascot-body ${isPlaying() ? "is-grooving" : ""}`}
            onClick={handleMascotClick}
            title={`${characterName()} (Click to chat / poke)`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleMascotClick();
              }
            }}
          >
            {/* Animated floating music notes when audio is playing */}
            <Show when={isPlaying()}>
              <span class="pixel-note-particle pixel-note-1">♪</span>
              <span class="pixel-note-particle pixel-note-2">♫</span>
              <span class="pixel-note-particle pixel-note-3">★</span>
            </Show>

            {/* Active Character SVG */}
            <Show when={pixelMascotCharacter() === "sakura"}>
              <SakuraPixelSvg isBlinking={isBlinking()} />
            </Show>
            <Show when={pixelMascotCharacter() === "neko"}>
              <NekoPixelSvg isBlinking={isBlinking()} />
            </Show>
            <Show when={pixelMascotCharacter() === "byte"}>
              <BytePixelSvg isBlinking={isBlinking()} />
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default PixelMascot;
