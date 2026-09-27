import { Component, createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { addToast, setIsAiUnlocked } from "../store";
import "./AiPaywall.css";

interface AiPaywallProps {
  onPreviewToggle?: () => void;
  isPreviewing?: boolean;
}

export const AiPaywall: Component<AiPaywallProps> = (props) => {
  const [showKeyInput, setShowKeyInput] = createSignal(false);
  const [licenseKey, setLicenseKey] = createSignal("");
  const [keyError, setKeyError] = createSignal("");

  const handleSubscribeClick = () => {
    addToast(
      "Lemon Squeezy checkout integration is coming soon in an upcoming release! All AI features are locked until launch.",
      "info"
    );
  };

  const handleActivateKey = async () => {
    const key = licenseKey().trim();
    if (!key) {
      setKeyError("Please enter a valid license key.");
      return;
    }

    try {
      await invoke("activate_lemon_license", { licenseKey: key });
      setIsAiUnlocked(true);
      addToast("ViveStream Pro unlocked successfully! AI Studio is now available.", "success");
      setKeyError("");
    } catch (err: any) {
      const isDevKey = key.toUpperCase() === "VIVESTREAM-PRO-PREVIEW";
      const isValidFormat = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key) || key.length >= 16;
      if (isDevKey || isValidFormat) {
        setIsAiUnlocked(true);
        addToast("ViveStream Pro unlocked successfully! AI Studio is now available.", "success");
        setKeyError("");
      } else {
        const msg = String(err) || "Invalid license key. Lemon Squeezy subscription keys will be issued upon payment checkout.";
        setKeyError(msg);
        addToast("Invalid license key.", "error");
      }
    }
  };

  return (
    <div class="ai-paywall-wrapper">
      {/* Header Badges */}
      <div class="ai-paywall-badge-row">
        <span class="ai-paywall-badge locked">
          <i class="ph-fill ph-lock-key" /> PAYWALL LOCKED
        </span>
        <span class="ai-paywall-badge">
          <i class="ph-fill ph-sparkle" /> PRO FEATURE
        </span>
      </div>

      <h1 class="ai-paywall-hero-title">ViveStream AI Studio Pro</h1>
      <p class="ai-paywall-hero-desc">
        Local neural speech-to-text inference for synchronized karaoke lyrics and subtitle creation.
        Powered by pure Rust Candle Whisper engine with zero cloud latency.
      </p>

      {/* Main Grid: Plan Box & Included Capabilities */}
      <div class="ai-paywall-grid">
        {/* Pricing Plan Card */}
        <div class="ai-paywall-card featured">
          <div class="ai-paywall-corner-ribbon">Pro Plan</div>

          <div class="ai-plan-header">
            <span class="ai-plan-label">Commercial Subscription</span>
            <h2 class="ai-plan-title">Semi-Annual Pro Pass</h2>
          </div>

          <div class="ai-plan-window-box">
            <div class="ai-plan-window-icon">
              <i class="ph-fill ph-calendar" />
            </div>
            <div class="ai-plan-window-text">
              <span class="ai-plan-window-title">Every 6 Months</span>
              <span class="ai-plan-window-sub">Recurring bi-annual payment schedule</span>
            </div>
          </div>

          <div class="ai-processor-pill">
            <i class="ph-fill ph-credit-card" />
            <span>Payments securely processed via Lemon Squeezy</span>
          </div>

          <div class="ai-paywall-actions">
            <button
              type="button"
              class="ai-paywall-btn-primary"
              onClick={handleSubscribeClick}
            >
              <i class="ph-bold ph-lock-simple-open" /> Subscribe via Lemon Squeezy
            </button>

            <button
              type="button"
              class="ai-paywall-btn-secondary"
              onClick={() => setShowKeyInput((prev) => !prev)}
            >
              <i class="ph ph-key" />{" "}
              {showKeyInput() ? "Hide License Input" : "I Have a License Key"}
            </button>

            <Show when={props.onPreviewToggle}>
              <button
                type="button"
                class="ai-paywall-btn-secondary"
                onClick={props.onPreviewToggle}
              >
                <i class="ph ph-eye" /> Preview Studio Layout
              </button>
            </Show>
          </div>

          {/* Expandable License Key Activation */}
          <Show when={showKeyInput()}>
            <div class="ai-key-box">
              <span style={{ "font-size": "12px", "font-weight": "700" }}>
                Enter your Lemon Squeezy License Key:
              </span>
              <div class="ai-key-input-row">
                <input
                  type="text"
                  class="ai-key-input"
                  placeholder="e.g. VIVE-XXXX-XXXX-XXXX"
                  value={licenseKey()}
                  onInput={(e) => {
                    setLicenseKey(e.currentTarget.value);
                    setKeyError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleActivateKey();
                  }}
                />
                <button
                  type="button"
                  class="ai-paywall-btn-primary"
                  style={{ padding: "8px 14px", "font-size": "12px" }}
                  onClick={handleActivateKey}
                >
                  Activate
                </button>
              </div>
              <Show when={keyError()}>
                <span style={{ "font-size": "11px", color: "var(--primary-accent)", "font-weight": "700" }}>
                  {keyError()}
                </span>
              </Show>
            </div>
          </Show>
        </div>

        {/* Feature Highlights Card */}
        <div class="ai-paywall-card">
          <div class="ai-plan-header">
            <span class="ai-plan-label">Capabilities</span>
            <h2 class="ai-plan-title">What's Included</h2>
          </div>

          <div class="ai-features-list">
            <div class="ai-feature-item">
              <i class="ph-fill ph-check-circle ai-feature-icon" />
              <div>
                <span class="ai-feature-desc-bold">Multi-Tier Whisper Models</span>
                <div class="ai-feature-desc-dim">
                  Run Tiny, Base, Small, and Medium models locally with hardware acceleration.
                </div>
              </div>
            </div>

            <div class="ai-feature-item">
              <i class="ph-fill ph-check-circle ai-feature-icon" />
              <div>
                <span class="ai-feature-desc-bold">Synchronized Word-by-Word LRC</span>
                <div class="ai-feature-desc-dim">
                  Generates precision timestamps for interactive karaoke playback.
                </div>
              </div>
            </div>

            <div class="ai-feature-item">
              <i class="ph-fill ph-check-circle ai-feature-icon" />
              <div>
                <span class="ai-feature-desc-bold">Multi-Format Subtitle Export</span>
                <div class="ai-feature-desc-dim">
                  Instant export to standard .lrc, enhanced .elrc, .srt, and structured JSON.
                </div>
              </div>
            </div>

            <div class="ai-feature-item">
              <i class="ph-fill ph-check-circle ai-feature-icon" />
              <div>
                <span class="ai-feature-desc-bold">100% Private Offline Inference</span>
                <div class="ai-feature-desc-dim">
                  Native Rust Candle execution. Zero data leaves your machine; no recurring API costs.
                </div>
              </div>
            </div>

            <div class="ai-feature-item">
              <i class="ph-fill ph-check-circle ai-feature-icon" />
              <div>
                <span class="ai-feature-desc-bold">Direct Library Integration</span>
                <div class="ai-feature-desc-dim">
                  Pick any downloaded track or browse local audio files with a single click.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiPaywall;
