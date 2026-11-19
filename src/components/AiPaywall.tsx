import { Component, createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { addToast, setIsAiUnlocked, setLicenseData, LicenseData } from "../store";
import "./AiPaywall.css";

interface AiPaywallProps {
  onPreviewToggle?: () => void;
  isPreviewing?: boolean;
}

export const AiPaywall: Component<AiPaywallProps> = (props) => {
  const [showKeyInput, setShowKeyInput] = createSignal(false);
  const [licenseKey, setLicenseKey] = createSignal("");
  const [keyError, setKeyError] = createSignal("");
  const [isActivating, setIsActivating] = createSignal(false);
  const [selectedTier, setSelectedTier] = createSignal<"semiannual" | "lifetime">("semiannual");

  const handleSubscribeClick = async () => {
    setShowKeyInput(true);
    try {
      const url = await invoke<string>("get_lemon_checkout_url", {
        tier: selectedTier(),
      });
      await openUrl(url);
      addToast(
        "Opened Lemon Squeezy checkout. Once completed, copy and paste your license key below.",
        "info"
      );
    } catch {
      addToast(
        "Please visit lemonsqueezy.com to subscribe, then paste your license key below.",
        "info"
      );
    }
  };

  const handlePasteKey = async () => {
    try {
      let text = "";
      try {
        text = await invoke<string>("get_clipboard_text");
      } catch {
        if (navigator.clipboard) {
          text = await navigator.clipboard.readText();
        }
      }
      if (text) {
        setLicenseKey(text.trim());
        setKeyError("");
        addToast("Pasted license key from clipboard.", "info");
      } else {
        addToast("Clipboard is empty.", "info");
      }
    } catch {
      addToast("Could not access clipboard.", "error");
    }
  };

  const handleActivateKey = async () => {
    const key = licenseKey().trim();
    if (!key) {
      setKeyError("Please enter a valid license key.");
      return;
    }

    try {
      setIsActivating(true);
      setKeyError("");
      const res = await invoke<LicenseData>("activate_lemon_license", { licenseKey: key });
      setLicenseData(res);
      setIsAiUnlocked(true);
      addToast("ViveStream Pro unlocked successfully! AI Studio is now available.", "success");
      setKeyError("");
    } catch (err: any) {
      const msg = String(err) || "Invalid license key. Lemon Squeezy subscription keys will be issued upon payment checkout.";
      setKeyError(msg);
      addToast(msg, "error");
    } finally {
      setIsActivating(false);
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
            <h2 class="ai-plan-title">
              {selectedTier() === "semiannual" ? "Semi-Annual Pro Pass" : "Lifetime Pro Pass"}
            </h2>
          </div>

          {/* Tier Switcher Pills */}
          <div class="ai-tier-selector" style={{ display: "flex", gap: "8px", "margin-top": "4px" }}>
            <button
              type="button"
              class={`ai-paywall-btn-secondary ${selectedTier() === "semiannual" ? "tier-active" : ""}`}
              style={{
                flex: 1,
                padding: "8px 10px",
                "font-size": "12px",
                background: selectedTier() === "semiannual" ? "var(--primary-accent)" : "transparent",
                color: selectedTier() === "semiannual" ? "var(--on-primary, #ffffff)" : "inherit",
              }}
              onClick={() => setSelectedTier("semiannual")}
            >
              Semi-Annual ($9.99 / 6mo)
            </button>
            <button
              type="button"
              class={`ai-paywall-btn-secondary ${selectedTier() === "lifetime" ? "tier-active" : ""}`}
              style={{
                flex: 1,
                padding: "8px 10px",
                "font-size": "12px",
                background: selectedTier() === "lifetime" ? "var(--primary-accent)" : "transparent",
                color: selectedTier() === "lifetime" ? "var(--on-primary, #ffffff)" : "inherit",
              }}
              onClick={() => setSelectedTier("lifetime")}
            >
              Lifetime ($19.99 One-Time)
            </button>
          </div>

          <div class="ai-plan-window-box">
            <div class="ai-plan-window-icon">
              <i class="ph-fill ph-calendar" />
            </div>
            <div class="ai-plan-window-text">
              <span class="ai-plan-window-title">
                {selectedTier() === "semiannual" ? "Every 6 Months" : "Lifetime Access"}
              </span>
              <span class="ai-plan-window-sub">
                {selectedTier() === "semiannual"
                  ? "Recurring bi-annual payment schedule ($9.99)"
                  : "One-time purchase, free updates forever ($19.99)"}
              </span>
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
              <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                <span style={{ "font-size": "12px", "font-weight": "700" }}>
                  Enter your Lemon Squeezy License Key:
                </span>
                <button
                  type="button"
                  class="ai-paywall-btn-secondary"
                  style={{ padding: "4px 8px", "font-size": "11px" }}
                  onClick={handlePasteKey}
                  title="Paste from Clipboard"
                >
                  <i class="ph ph-clipboard" /> Paste
                </button>
              </div>
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
                  disabled={isActivating()}
                  onClick={handleActivateKey}
                >
                  {isActivating() ? "Activating..." : "Activate"}
                </button>
              </div>
              <Show when={keyError()}>
                <span style={{ "font-size": "11px", color: "var(--primary-accent)", "font-weight": "700" }}>
                  {keyError()}
                </span>
              </Show>
              <div style={{ "font-size": "11px", color: "var(--secondary-text)", "line-height": "1.4" }}>
                💡 Tip: You can find your license key in your Lemon Squeezy order email or customer dashboard.
              </div>
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
