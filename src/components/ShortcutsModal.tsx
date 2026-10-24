import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import "./ShortcutsModal.css";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutCategory {
  title: string;
  icon: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Playback Controls",
    icon: "play-circle",
    shortcuts: [
      { keys: ["Space", "K"], description: "Play / Pause playback" },
      { keys: ["P"], description: "Play previous media" },
      { keys: ["N"], description: "Play next media" },
      { keys: ["R"], description: "Toggle repeat / loop mode" },
      { keys: ["<", ">"], description: "Decrease / Increase playback speed" },
    ],
  },
  {
    title: "Audio & Seeking",
    icon: "speaker-high",
    shortcuts: [
      { keys: ["M"], description: "Mute / Unmute audio" },
      { keys: ["↑", "↓"], description: "Volume Up / Down by 5%" },
      { keys: ["←", "→"], description: "Seek backward / forward 5s" },
      { keys: ["J", "L"], description: "Seek backward / forward 10s" },
      { keys: ["0 – 9"], description: "Jump to 0% – 90% of duration" },
    ],
  },
  {
    title: "Display & Modes",
    icon: "television",
    shortcuts: [
      { keys: ["F"], description: "Toggle Fullscreen mode" },
      { keys: ["T"], description: "Toggle Theater mode" },
      { keys: ["I"], description: "Toggle Miniplayer (PiP)" },
      { keys: ["C"], description: "Toggle Subtitles / Captions" },
      { keys: ["G"], description: "Toggle Stream Runner Arcade minigame" },
    ],
  },
  {
    title: "App Navigation",
    icon: "compass",
    shortcuts: [
      { keys: ["Ctrl", "F"], description: "Toggle Global Search" },
      { keys: ["Ctrl", "S"], description: "Toggle Library Sorting Controls" },
      { keys: ["Type"], description: "Type anywhere to quick search" },
      { keys: ["Shift", "1 / H"], description: "Navigate to Home" },
      { keys: ["Shift", "2 / F"], description: "Navigate to Favourites" },
      { keys: ["Shift", "3 / P"], description: "Navigate to Playlists" },
      { keys: ["Shift", "4 / A"], description: "Navigate to Artists" },
      { keys: ["Shift", "5 / D"], description: "Navigate to Downloads" },
      { keys: ["Shift", "6 / S"], description: "Navigate to Settings" },
      { keys: ["Esc"], description: "Go Back / Close modal or search" },
      { keys: ["?"], description: "Open Keyboard Shortcuts Help" },
    ],
  },
];

export default function ShortcutsModal(props: ShortcutsModalProps) {
  const [searchQuery, setSearchQuery] = createSignal("");

  createEffect(() => {
    if (!props.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const filteredCategories = () => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return SHORTCUT_CATEGORIES;

    return SHORTCUT_CATEGORIES.map((cat) => ({
      ...cat,
      shortcuts: cat.shortcuts.filter(
        (s) =>
          s.description.toLowerCase().includes(q) ||
          s.keys.some((k) => k.toLowerCase().includes(q)),
      ),
    })).filter((cat) => cat.shortcuts.length > 0);
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="shortcuts-backdrop"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
      >
        <div
          class="shortcuts-modal-container"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="shortcuts-modal-header">
            <div class="shortcuts-header-title">
              <i class="ph-fill ph-keyboard" aria-hidden="true"></i>
              <h2 id="shortcuts-modal-title">Keyboard Shortcuts</h2>
            </div>
            <button
              class="shortcuts-close-btn"
              onClick={props.onClose}
              title="Close (Esc)"
              aria-label="Close shortcuts modal"
            >
              <i class="ph ph-x" aria-hidden="true"></i>
            </button>
          </div>

          <div class="shortcuts-search-row">
            <i class="ph ph-magnifying-glass shortcuts-search-icon"></i>
            <input
              type="text"
              class="shortcuts-search-input"
              placeholder="Search shortcut or action..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              autofocus
            />
          </div>

          <div class="shortcuts-content-grid">
            <For each={filteredCategories()}>
              {(category) => (
                <div class="shortcuts-category-card">
                  <div class="shortcuts-category-header">
                    <i class={`ph-fill ph-${category.icon}`}></i>
                    <h3>{category.title}</h3>
                  </div>
                  <div class="shortcuts-list">
                    <For each={category.shortcuts}>
                      {(item) => (
                        <div class="shortcut-item">
                          <span class="shortcut-desc">{item.description}</span>
                          <div class="shortcut-keys">
                            <For each={item.keys}>
                              {(k) => <kbd class="shortcut-kbd">{k}</kbd>}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>

          <div class="shortcuts-footer">
            <span class="shortcuts-hint">
              Press <kbd class="shortcut-kbd">?</kbd> anywhere in the app to
              view this cheat sheet.
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
}
