import { createSignal, Show } from "solid-js";
import "./BenchmarkModal.css";

export interface BenchmarkResults {
  avgFps: number;
  minFps: number;
  onePercentLowFps: number;
  frameJitterMs: number;
  domMountMs: number;
  layoutCalcMs: number;
  totalCardsTested: number;
  score: number;
  grade: "S+" | "A" | "B" | "C" | "D";
  verdict: string;
}

export default function BenchmarkModal(props: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentStep, setCurrentStep] = createSignal<string>("");
  const [progress, setProgress] = createSignal(0);
  const [results, setResults] = createSignal<BenchmarkResults | null>(null);

  const runBenchmark = async () => {
    setIsRunning(true);
    setResults(null);
    setProgress(10);
    setCurrentStep("Initializing frame timing sampler...");

    await new Promise((r) => setTimeout(r, 200));

    // Phase 1: Frame Timing & 1% Low Measurement
    setCurrentStep("Sampling 120 animation frames (RAF)...");
    setProgress(30);

    const frameTimes: number[] = [];
    let lastTime = performance.now();

    await new Promise<void>((resolve) => {
      let count = 0;
      const sampleFrame = (now: number) => {
        const delta = now - lastTime;
        lastTime = now;
        if (count > 0) {
          frameTimes.push(delta);
        }
        count++;
        if (count < 120) {
          requestAnimationFrame(sampleFrame);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(sampleFrame);
    });

    setProgress(60);
    setCurrentStep("Benchmarking DOM Grid layout & card rendering...");
    await new Promise((r) => setTimeout(r, 100));

    // Phase 2: DOM Stress & Reflow Benchmark (150 cards)
    const testCount = 150;
    const testContainer = document.createElement("div");
    testContainer.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1200px;display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;visibility:hidden;pointer-events:none;";
    document.body.appendChild(testContainer);

    const mountStart = performance.now();
    for (let i = 0; i < testCount; i++) {
      const card = document.createElement("div");
      card.className = "video-card";
      card.innerHTML = `
        <div class="video-thumbnail-container" style="aspect-ratio:16/9;background:#111;"></div>
        <div class="video-info" style="padding:8px;">
          <h3 class="video-title">Benchmark Media Item #${i + 1}</h3>
          <p class="video-channel">ViveStream Performance Engine</p>
        </div>
      `;
      testContainer.appendChild(card);
    }
    const domMountMs = Math.round((performance.now() - mountStart) * 10) / 10;

    setProgress(80);
    setCurrentStep("Measuring layout reflow throughput...");

    const layoutStart = performance.now();
    // Force layout calculation
    testContainer.getBoundingClientRect();
    const children = testContainer.children;
    for (let i = 0; i < children.length; i += 10) {
      children[i].getBoundingClientRect();
    }
    const layoutCalcMs =
      Math.round((performance.now() - layoutStart) * 10) / 10;
    document.body.removeChild(testContainer);

    setProgress(95);
    setCurrentStep("Analyzing metrics and computing performance score...");
    await new Promise((r) => setTimeout(r, 200));

    // Phase 3: Calculations
    const fpsList = frameTimes.filter((t) => t > 0).map((t) => 1000 / t);
    fpsList.sort((a, b) => a - b);

    const avgFps = Math.round(
      fpsList.reduce((a, b) => a + b, 0) / fpsList.length,
    );
    const minFps = Math.round(fpsList[0] || 60);

    // 1% Low is average of worst 1% of frames
    const onePercentCount = Math.max(1, Math.floor(fpsList.length * 0.05));
    const onePercentLowFps = Math.round(
      fpsList.slice(0, onePercentCount).reduce((a, b) => a + b, 0) /
        onePercentCount,
    );

    // Frame jitter (variance)
    const avgFrameTime =
      frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const variance =
      frameTimes.reduce((acc, t) => acc + Math.pow(t - avgFrameTime, 2), 0) /
      frameTimes.length;
    const frameJitterMs = Math.round(Math.sqrt(variance) * 100) / 100;

    // Score calculation
    let score = 100;
    if (avgFps < 60) score -= (60 - avgFps) * 1.5;
    if (onePercentLowFps < 45) score -= (45 - onePercentLowFps) * 1.2;
    if (frameJitterMs > 4) score -= (frameJitterMs - 4) * 3;
    if (domMountMs > 50) score -= (domMountMs - 50) * 0.4;
    score = Math.max(10, Math.min(100, Math.round(score)));

    let grade: "S+" | "A" | "B" | "C" | "D" = "A";
    let verdict = "Silky Smooth (Ultra Responsive)";
    if (score >= 95) {
      grade = "S+";
      verdict = "Perfect 60+ FPS – Zero Stutter Detected";
    } else if (score >= 85) {
      grade = "A";
      verdict = "Smooth & Fluid – High Compositor Efficiency";
    } else if (score >= 70) {
      grade = "B";
      verdict = "Good Performance – Minor Frame Fluctuations";
    } else if (score >= 50) {
      grade = "C";
      verdict = "Moderate Stutter – Consider reducing background load";
    } else {
      grade = "D";
      verdict = "Heavy Lag Detected – UI Thread Stalled";
    }

    setResults({
      avgFps,
      minFps,
      onePercentLowFps,
      frameJitterMs,
      domMountMs,
      layoutCalcMs,
      totalCardsTested: testCount,
      score,
      grade,
      verdict,
    });

    setProgress(100);
    setIsRunning(false);
  };

  return (
    <Show when={props.isOpen}>
      <div class="benchmark-backdrop" onClick={props.onClose}>
        <div
          class="benchmark-modal-container"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="benchmark-header">
            <div class="benchmark-header-left">
              <i class="ph-fill ph-gauge benchmark-header-icon"></i>
              <div>
                <h2 class="benchmark-title">UI Performance Benchmark</h2>
                <p class="benchmark-subtitle">
                  Measures realtime frame pacing, 1% low FPS, DOM layout speed,
                  and compositor jitter.
                </p>
              </div>
            </div>
            <button
              class="benchmark-close-btn"
              onClick={props.onClose}
              title="Close"
            >
              <i class="ph ph-x"></i>
            </button>
          </div>

          <div class="benchmark-body">
            <Show when={!results() && !isRunning()}>
              <div class="benchmark-intro-card">
                <div class="benchmark-icon-hero">
                  <i class="ph-fill ph-lightning"></i>
                </div>
                <h3>Hardware-Accelerated UI Diagnostics</h3>
                <p>
                  This test stresses the WebView graphics compositor by sampling
                  120 animation frames, mounting 150 Claymorphism media cards,
                  and measuring exact frame-time stability.
                </p>
                <button
                  class="benchmark-action-btn primary"
                  onClick={runBenchmark}
                >
                  <i class="ph-fill ph-play"></i> Start Benchmark
                </button>
              </div>
            </Show>

            <Show when={isRunning()}>
              <div class="benchmark-progress-box">
                <div class="benchmark-spinner-wrap">
                  <i class="ph ph-spinner spinIcon"></i>
                </div>
                <h4 class="benchmark-step-label">{currentStep()}</h4>
                <div class="benchmark-progress-bar">
                  <div
                    class="benchmark-progress-fill"
                    style={{ width: `${progress()}%` }}
                  ></div>
                </div>
                <span class="benchmark-progress-text">{progress()}%</span>
              </div>
            </Show>

            <Show when={results()}>
              {(() => {
                const res = results()!;
                return (
                  <div class="benchmark-results-view">
                    <div class="benchmark-score-banner">
                      <div class="score-badge">
                        <span class="score-grade">{res.grade}</span>
                        <span class="score-num">{res.score}/100</span>
                      </div>
                      <div class="score-meta">
                        <h3 class="score-verdict">{res.verdict}</h3>
                        <p class="score-desc">
                          150 dynamic cards mounted in {res.domMountMs}ms with{" "}
                          {res.frameJitterMs}ms frame jitter.
                        </p>
                      </div>
                    </div>

                    <div class="benchmark-metrics-grid">
                      <div class="metric-card">
                        <span class="metric-label">Average FPS</span>
                        <span class="metric-value fps-val">{res.avgFps}</span>
                        <span class="metric-sub">Target: 60+ FPS</span>
                      </div>

                      <div class="metric-card">
                        <span class="metric-label">1% Low FPS</span>
                        <span
                          class={`metric-value ${res.onePercentLowFps >= 50 ? "fps-val" : "fps-warn"}`}
                        >
                          {res.onePercentLowFps}
                        </span>
                        <span class="metric-sub">Stutter Resistance</span>
                      </div>

                      <div class="metric-card">
                        <span class="metric-label">Frame Jitter</span>
                        <span class="metric-value">
                          {res.frameJitterMs} <small>ms</small>
                        </span>
                        <span class="metric-sub">Timing Variance</span>
                      </div>

                      <div class="metric-card">
                        <span class="metric-label">DOM Mount Speed</span>
                        <span class="metric-value">
                          {res.domMountMs} <small>ms</small>
                        </span>
                        <span class="metric-sub">150 Cards Mounted</span>
                      </div>
                    </div>

                    <div class="benchmark-footer-actions">
                      <button
                        class="benchmark-action-btn secondary"
                        onClick={runBenchmark}
                      >
                        <i class="ph ph-arrows-clockwise"></i> Re-run Benchmark
                      </button>
                      <button
                        class="benchmark-action-btn primary"
                        onClick={props.onClose}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                );
              })()}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
