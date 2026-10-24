import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  Component,
} from "solid-js";
import { activeVideo } from "../store";
import "./SetupMinigame.css";

interface SetupMinigameProps {
  downloadProgress?: number;
  isCompleted?: boolean;
  onLaunch?: () => void;
  onClose?: () => void;
  standalone?: boolean;
}

// Procedural Retro Audio Synthesizer (Web Audio API - Zero Asset Overhead)
class SoundFX {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("vivestream_minigame_muted") === "true";
    } catch {
      this.muted = false;
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("vivestream_minigame_muted", String(this.muted));
    } catch {}
    return this.muted;
  }

  public jump(isDouble = false) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      osc.type = "square";
      const startFreq = isDouble ? 340 : 220;
      const endFreq = isDouble ? 680 : 440;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  public collect() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.07, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.09);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.09);
      });
    } catch {}
  }

  public powerup() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.28);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.28);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }

  public crash() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {}
  }
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

interface Collectible {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "wave" | "4k" | "turbo";
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
}

const SetupMinigame: Component<SetupMinigameProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  const sfx = new SoundFX();

  const [gameState, setGameState] = createSignal<
    "ready" | "playing" | "gameover"
  >("ready");
  const [score, setScore] = createSignal<number>(0);
  const [highScore, setHighScore] = createSignal<number>(0);
  const [turboActive, setTurboActive] = createSignal<boolean>(false);
  const [turboRemaining, setTurboRemaining] = createSignal<number>(0);
  const [isMuted, setIsMuted] = createSignal<boolean>(sfx.muted);

  // High score initialization
  onMount(() => {
    try {
      const saved = localStorage.getItem("vivestream_minigame_highscore");
      if (saved) setHighScore(parseInt(saved, 10) || 0);
    } catch {}
  });

  // Game internal variables
  let animId: number = 0;
  let lastTime: number = 0;

  // Player state: Comfortable floaty jump and generous clearance
  const player = {
    x: 60,
    y: 0,
    width: 32,
    height: 32,
    vy: 0,
    jumpForce: -9.6,
    gravity: 0.45,
    groundY: 220,
    isGrounded: false,
    jumpCount: 0,
    maxJumps: 2,
    angle: 0,
    invincibleTimer: 0,
  };

  let speed = 3.6;
  const baseSpeed = 3.6;
  let distance = 0;
  let obstacles: Obstacle[] = [];
  let collectibles: Collectible[] = [];
  let particles: Particle[] = [];
  let nextObstacleDistance = 350;
  let nextCollectibleDistance = 150;

  // Background visualizer equalizer bars
  const eqBars = Array.from({ length: 24 }, (_, i) => ({
    x: i * 36,
    height: 15 + Math.random() * 35,
    speed: 0.8 + Math.random() * 1.4,
  }));

  const resetGame = () => {
    player.y = player.groundY - player.height;
    player.vy = 0;
    player.jumpCount = 0;
    player.isGrounded = true;
    player.invincibleTimer = 0;

    speed = baseSpeed;
    distance = 0;
    obstacles = [];
    collectibles = [];
    particles = [];
    nextObstacleDistance = 350;
    nextCollectibleDistance = 150;

    setScore(0);
    setTurboActive(false);
    setTurboRemaining(0);
    setGameState("playing");
  };

  const spawnParticles = (
    x: number,
    y: number,
    color: string,
    count = 8,
    speedScale = 1,
  ) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = (Math.random() * 3 + 1) * speedScale;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        size: Math.random() * 4 + 2,
        color,
        alpha: 1,
        life: 1,
      });
    }
  };

  const handleJump = () => {
    if (gameState() === "ready" || gameState() === "gameover") {
      resetGame();
      return;
    }

    if (player.jumpCount < player.maxJumps) {
      player.vy = player.jumpForce;
      player.isGrounded = false;
      const isDouble = player.jumpCount > 0;
      player.jumpCount++;
      sfx.jump(isDouble);

      // Jump burst particles
      spawnParticles(
        player.x + player.width / 2,
        player.y + player.height,
        isDouble ? "#f25c54" : "#ffffff",
        isDouble ? 10 : 6,
      );
    }
  };

  const handleToggleMute = () => {
    const muted = sfx.toggleMute();
    setIsMuted(muted);
  };

  // Keyboard controls
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handleJump();
    } else if (e.code === "KeyR" && gameState() === "gameover") {
      e.preventDefault();
      resetGame();
    } else if (e.code === "KeyM") {
      e.preventDefault();
      handleToggleMute();
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);

    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
    const resizeCanvas = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      player.groundY = rect.height - 36;
      if (player.isGrounded) {
        player.y = player.groundY - player.height;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initial loop
    lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        // Clear screen with cyberpunk background
        ctx.fillStyle = "#16171d";
        ctx.fillRect(0, 0, width, height);

        // Draw background equalizer bars
        ctx.fillStyle = "rgba(242, 92, 84, 0.08)";
        eqBars.forEach((bar) => {
          bar.height = 16 + Math.sin(time * 0.003 * bar.speed + bar.x) * 14;
          ctx.fillRect(bar.x % width, height - 36 - bar.height, 22, bar.height);
        });

        // Draw ground platform (Neo-Brutalist grid)
        const groundY = height - 36;
        player.groundY = groundY;

        // Ground base
        ctx.fillStyle = "#25262c";
        ctx.fillRect(0, groundY, width, 36);

        // Ground top border
        ctx.strokeStyle = "#383a45";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(width, groundY);
        ctx.stroke();

        // Scrolling grid stripes on ground
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 2;
        const stripeOffset = (distance * 1.5) % 28;
        for (let x = -stripeOffset; x < width + 30; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, groundY);
          ctx.lineTo(x + 14, height);
          ctx.stroke();
        }

        if (gameState() === "playing") {
          // Update game state
          const currentSpeed = turboActive() ? speed * 1.5 : speed;
          distance += currentSpeed * 60 * dt;
          setScore(Math.floor(distance / 5));

          // Gentle difficulty scaling
          speed = baseSpeed + Math.min(distance / 3200, 3.8);

          // Update Turbo state
          if (turboActive()) {
            player.invincibleTimer -= dt;
            setTurboRemaining(Math.max(0, player.invincibleTimer));
            if (player.invincibleTimer <= 0) {
              setTurboActive(false);
            }
          }

          // Physics: Player update
          player.vy += player.gravity;
          player.y += player.vy;

          if (player.y >= groundY - player.height) {
            player.y = groundY - player.height;
            player.vy = 0;
            player.isGrounded = true;
            player.jumpCount = 0;
            player.angle = 0;
          } else {
            player.isGrounded = false;
            player.angle += 0.08;
          }

          // Spawn obstacles: Single predictable ground hurdle type with generous spacing
          nextObstacleDistance -= currentSpeed;
          if (nextObstacleDistance <= 0) {
            const obsHeight = 22;
            const obsWidth = 22;

            obstacles.push({
              x: width + 20,
              y: groundY - obsHeight,
              width: obsWidth,
              height: obsHeight,
              angle: 0,
            });

            nextObstacleDistance = 340 + Math.random() * 240;
          }

          // Spawn collectibles
          nextCollectibleDistance -= currentSpeed;
          if (nextCollectibleDistance <= 0) {
            const roll = Math.random();
            const colType = roll > 0.85 ? "turbo" : roll > 0.45 ? "4k" : "wave";
            const colY = groundY - 45 - Math.random() * 40;

            collectibles.push({
              x: width + 30,
              y: colY,
              width: 24,
              height: 24,
              type: colType,
              collected: false,
            });

            nextCollectibleDistance = 140 + Math.random() * 180;
          }

          // Runner trail particles
          if (player.isGrounded && Math.random() > 0.4) {
            spawnParticles(
              player.x + 4,
              player.y + player.height - 2,
              turboActive() ? "#f25c54" : "rgba(255, 255, 255, 0.4)",
              1,
              0.5,
            );
          }
        }

        // Draw & Update Obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const obs = obstacles[i];
          if (gameState() === "playing") {
            obs.x -= (turboActive() ? speed * 1.5 : speed);
          }

          // Draw single clean ground hurdle in Neo-Brutalist styling
          ctx.save();
          ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);

          // Hurdle Base
          ctx.fillStyle = "#ef233c";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2;
          ctx.fillRect(
            -obs.width / 2,
            -obs.height / 2,
            obs.width,
            obs.height,
          );
          ctx.strokeRect(
            -obs.width / 2,
            -obs.height / 2,
            obs.width,
            obs.height,
          );

          // Warning hazard stripe
          ctx.fillStyle = "#ffd166";
          ctx.fillRect(-obs.width / 2 + 3, -obs.height / 2 + 3, obs.width - 6, 4);

          // Center exclamation mark
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", 0, 3);

          ctx.restore();

          // Forgiving Collision Detection (6px inner padding for near-miss grace)
          const pad = 6;
          if (
            gameState() === "playing" &&
            player.x + pad < obs.x + obs.width - pad &&
            player.x + player.width - pad > obs.x + pad &&
            player.y + pad < obs.y + obs.height &&
            player.y + player.height > obs.y + pad
          ) {
            if (turboActive()) {
              // Destroy obstacle in turbo mode!
              spawnParticles(
                obs.x + obs.width / 2,
                obs.y + obs.height / 2,
                "#f25c54",
                14,
                1.8,
              );
              sfx.collect();
              obstacles.splice(i, 1);
              setScore((s) => s + 100);
              continue;
            } else {
              // Game Over
              sfx.crash();
              spawnParticles(
                player.x + player.width / 2,
                player.y + player.height / 2,
                "#ef233c",
                25,
                2,
              );
              setGameState("gameover");

              const currentScore = score();
              if (currentScore > highScore()) {
                setHighScore(currentScore);
                try {
                  localStorage.setItem(
                    "vivestream_minigame_highscore",
                    String(currentScore),
                  );
                } catch {}
              }
            }
          }

          // Cleanup offscreen
          if (obs.x < -60) {
            obstacles.splice(i, 1);
          }
        }

        // Draw & Update Collectibles
        for (let i = collectibles.length - 1; i >= 0; i--) {
          const col = collectibles[i];
          if (gameState() === "playing") {
            col.x -= (turboActive() ? speed * 1.5 : speed);
          }

          // Draw Collectible
          const bounce = Math.sin(time * 0.006 + col.x * 0.05) * 4;
          const drawY = col.y + bounce;

          ctx.save();
          ctx.translate(col.x + col.width / 2, drawY + col.height / 2);

          if (col.type === "wave") {
            // Audio wave bars
            ctx.fillStyle = "#48cae4";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1.5;
            [-6, 0, 6].forEach((ox, idx) => {
              const h = 8 + (idx === 1 ? 8 : 4);
              ctx.fillRect(ox - 2, -h / 2, 4, h);
              ctx.strokeRect(ox - 2, -h / 2, 4, h);
            });
          } else if (col.type === "4k") {
            // 4K Token Diamond
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = "#ffd166";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;
            ctx.fillRect(-8, -8, 16, 16);
            ctx.strokeRect(-8, -8, 16, 16);
          } else if (col.type === "turbo") {
            // Turbo Bandwidth Bolt
            ctx.fillStyle = "#f25c54";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(2, -10);
            ctx.lineTo(-6, 0);
            ctx.lineTo(0, 0);
            ctx.lineTo(-2, 10);
            ctx.lineTo(6, -1);
            ctx.lineTo(0, -1);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();

          // Collision with player
          if (
            gameState() === "playing" &&
            player.x < col.x + col.width &&
            player.x + player.width > col.x &&
            player.y < drawY + col.height &&
            player.y + player.height > drawY
          ) {
            if (col.type === "turbo") {
              sfx.powerup();
              setTurboActive(true);
              player.invincibleTimer = 5.0;
              setTurboRemaining(5.0);
              spawnParticles(col.x, drawY, "#f25c54", 16, 1.5);
              setScore((s) => s + 150);
            } else if (col.type === "4k") {
              sfx.collect();
              spawnParticles(col.x, drawY, "#ffd166", 12, 1.2);
              setScore((s) => s + 200);
            } else {
              sfx.collect();
              spawnParticles(col.x, drawY, "#48cae4", 8, 1);
              setScore((s) => s + 50);
            }

            collectibles.splice(i, 1);
          } else if (col.x < -40) {
            collectibles.splice(i, 1);
          }
        }

        // Draw Player
        if (gameState() !== "gameover" || Math.floor(time / 100) % 2 === 0) {
          ctx.save();
          ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
          if (!player.isGrounded) {
            ctx.rotate(player.angle);
          }

          // Turbo Aura / Shield
          if (turboActive()) {
            ctx.strokeStyle = "#f25c54";
            ctx.lineWidth = 3;
            ctx.strokeRect(
              -player.width / 2 - 4,
              -player.height / 2 - 4,
              player.width + 8,
              player.height + 8,
            );
          }

          // Player Body: Neo-Brutalist Cyber Stream Bot
          ctx.fillStyle = turboActive() ? "#f25c54" : "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 2.5;

          ctx.fillRect(
            -player.width / 2,
            -player.height / 2,
            player.width,
            player.height,
          );
          ctx.strokeRect(
            -player.width / 2,
            -player.height / 2,
            player.width,
            player.height,
          );

          // Bot Screen / Face visor
          ctx.fillStyle = "#1e1e24";
          ctx.fillRect(-player.width / 2 + 4, -player.height / 2 + 6, 24, 12);

          // Glowing pixel eyes
          ctx.fillStyle = turboActive() ? "#ffd166" : "#27c93f";
          ctx.fillRect(-player.width / 2 + 8, -player.height / 2 + 10, 4, 4);
          ctx.fillRect(-player.width / 2 + 18, -player.height / 2 + 10, 4, 4);

          // Headphone / Antenna detail
          ctx.fillStyle = "#f25c54";
          ctx.fillRect(-player.width / 2 - 3, -player.height / 2 + 8, 3, 8);
          ctx.fillRect(player.width / 2, -player.height / 2 + 8, 3, 8);

          ctx.restore();
        }

        // Draw & Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= dt * 1.8;

          if (p.alpha <= 0) {
            particles.splice(i, 1);
          } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1;
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    onCleanup(() => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", resizeCanvas);
    });
  });

  return (
    <div class="setup-minigame-container">
      {/* Top Header Bar */}
      <div class="minigame-header">
        <div class="minigame-title-group">
          <span class="minigame-badge">
            <i class="ph-fill ph-game-controller"></i> ARCADE
          </span>
          <h3 class="minigame-title">STREAM RUNNER</h3>
        </div>

        {/* Live Setup / Media Status Indicator */}
        <Show
          when={!props.standalone}
          fallback={
            <Show
              when={activeVideo()}
              fallback={
                <div class="minigame-setup-progress-pill">
                  <i class="ph-fill ph-game-controller" style={{ color: "var(--primary-accent)" }}></i>
                  <span>Retro Arcade</span>
                </div>
              }
            >
              <div class="minigame-setup-progress-pill video-pill" title={activeVideo()?.title}>
                <i class="ph-fill ph-play-circle" style={{ color: "var(--primary-accent)" }}></i>
                <span>Streaming: {activeVideo()?.title ? activeVideo()!.title.slice(0, 20) + "..." : "Media"}</span>
              </div>
            </Show>
          }
        >
          <div class="minigame-setup-progress-pill">
            <Show
              when={props.isCompleted}
              fallback={
                <>
                  <i class="ph ph-cpu" aria-hidden="true"></i>
                  <span>
                    Setup: {props.downloadProgress ? props.downloadProgress.toFixed(0) : 0}%
                  </span>
                  <div class="minigame-progress-track">
                    <div
                      class="minigame-progress-fill"
                      style={{ width: `${props.downloadProgress || 0}%` }}
                    ></div>
                  </div>
                </>
              }
            >
              <i class="ph-fill ph-check-circle" style={{ color: "#27c93f" }}></i>
              <span style={{ color: "#27c93f" }}>Engines Ready!</span>
            </Show>
          </div>
        </Show>

        {/* Action Controls */}
        <div class="minigame-header-actions">
          <button
            type="button"
            class="minigame-icon-btn"
            onClick={handleToggleMute}
            title={isMuted() ? "Unmute Sound FX" : "Mute Sound FX"}
            aria-label="Toggle Sound"
          >
            <i class={`ph-fill ${isMuted() ? "ph-speaker-slash" : "ph-speaker-high"}`}></i>
          </button>
          <Show when={props.onClose}>
            <button
              type="button"
              class="minigame-icon-btn"
              onClick={props.onClose}
              title="Close Arcade (Esc)"
              aria-label="Close Minigame"
            >
              <i class="ph ph-x"></i>
            </button>
          </Show>
        </div>
      </div>

      {/* Canvas Area */}
      <div class="minigame-canvas-wrapper" onClick={handleJump}>
        <canvas ref={canvasRef} class="minigame-canvas" />

        {/* In-Game Heads-Up Display */}
        <div class="minigame-hud">
          <div class="hud-stat">
            <span class="hud-label">STREAM SCORE</span>
            <span class="hud-value highlight">{score()}</span>
          </div>

          <Show when={turboActive()}>
            <div class="hud-center-powerup">
              ⚡ TURBO BOOST: {turboRemaining().toFixed(1)}s
            </div>
          </Show>

          <div class="hud-stat">
            <span class="hud-label">HIGH SCORE</span>
            <span class="hud-value">{highScore()}</span>
          </div>
        </div>

        {/* Start Game Overlay */}
        <Show when={gameState() === "ready"}>
          <div class="minigame-overlay" onClick={(e) => e.stopPropagation()}>
            <h2 class="overlay-title">STREAM RUNNER // BIT DASH</h2>
            <p class="overlay-subtitle">
              Jump over ground glitch hurdles! Collect 🎵 Soundwaves, 💎 4K tokens & ⚡ Turbo boosts.
            </p>
            <button
              type="button"
              class="overlay-play-btn"
              onClick={() => resetGame()}
            >
              <i class="ph-fill ph-play"></i> START RUNNING
            </button>
          </div>
        </Show>

        {/* Game Over Overlay */}
        <Show when={gameState() === "gameover"}>
          <div class="minigame-overlay" onClick={(e) => e.stopPropagation()}>
            <h2 class="overlay-title game-over">STREAM BUFFERED!</h2>
            <div class="overlay-stats-row">
              <div class="overlay-stat-box">
                <span class="overlay-stat-label">FINAL SCORE</span>
                <span class="overlay-stat-num">{score()}</span>
              </div>
              <div class="overlay-stat-box">
                <span class="overlay-stat-label">ALL-TIME BEST</span>
                <span class="overlay-stat-num">{highScore()}</span>
              </div>
            </div>

            <Show
              when={!props.standalone && props.isCompleted}
              fallback={
                <button
                  type="button"
                  class="overlay-play-btn"
                  onClick={() => resetGame()}
                >
                  <i class="ph-fill ph-arrow-counter-clockwise"></i> TRY AGAIN
                </button>
              }
            >
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  class="overlay-play-btn"
                  onClick={() => resetGame()}
                >
                  <i class="ph-fill ph-arrow-counter-clockwise"></i> PLAY AGAIN
                </button>
                <Show when={props.onLaunch}>
                  <button
                    type="button"
                    class="overlay-play-btn launch-btn"
                    onClick={props.onLaunch}
                  >
                    <i class="ph-fill ph-rocket-launch"></i> LAUNCH VIVESTREAM
                  </button>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Bottom Controls Bar */}
      <div class="minigame-controls-bar">
        <div class="minigame-instructions">
          <span>
            <span class="key-badge">SPACE</span> or{" "}
            <span class="key-badge">TAP</span> Jump / Double-Jump
          </span>
          <span>
            <span class="key-badge">R</span> Restart
          </span>
          <span>
            <span class="key-badge">M</span> Mute FX
          </span>
        </div>

        <div class="minigame-touch-actions">
          <button
            type="button"
            class="touch-jump-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleJump();
            }}
          >
            <i class="ph-bold ph-arrow-up"></i> JUMP
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupMinigame;
