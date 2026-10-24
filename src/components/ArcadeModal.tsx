import { createSignal, createEffect, onCleanup, Show, Component } from "solid-js";
import { activeVideo } from "../store";
import SetupMinigame from "./SetupMinigame";
import "./ArcadeModal.css";

interface ArcadeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ArcadeModal: Component<ArcadeModalProps> = (props) => {
  const [isTranslucent, setIsTranslucent] = createSignal(false);

  createEffect(() => {
    if (!props.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Show when={props.isOpen}>
      <div
        class={`arcade-modal-backdrop ${isTranslucent() ? "translucent" : ""}`}
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Stream Runner Arcade"
      >
        <div class="arcade-modal-window" onClick={(e) => e.stopPropagation()}>
          {/* Top Bar */}
          <div class="arcade-modal-topbar">
            <div class="arcade-topbar-left">
              <h2 class="arcade-topbar-title">
                <i class="ph-fill ph-game-controller"></i> STREAM RUNNER
              </h2>
              <Show when={activeVideo()}>
                <div class="arcade-video-indicator" title={activeVideo()?.title}>
                  <i class="ph-fill ph-play-circle"></i>
                  <span>Streaming: {activeVideo()?.title}</span>
                </div>
              </Show>
            </div>

            <div class="arcade-topbar-right">
              <button
                type="button"
                class="arcade-view-mode-btn"
                onClick={() => setIsTranslucent(!isTranslucent())}
                title={
                  isTranslucent()
                    ? "Switch to Focus Background"
                    : "Switch to Translucent Video Backdrop"
                }
              >
                <i
                  class={`ph-fill ${isTranslucent() ? "ph-eye" : "ph-eye-slash"}`}
                ></i>
                <span>{isTranslucent() ? "Focus View" : "Cinema View"}</span>
              </button>

              <button
                type="button"
                class="arcade-close-btn"
                onClick={props.onClose}
                title="Close Arcade (Esc)"
                aria-label="Close Arcade"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>
          </div>

          {/* Minigame Body */}
          <div class="arcade-modal-body">
            <SetupMinigame standalone={true} onClose={props.onClose} />
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ArcadeModal;
