import { createSignal, createEffect, onMount, For, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  VideoEntry,
  alwaysShowSearchBar,
  isSearchOpen,
  setIsSearchOpen,
  globalSearchQuery,
  setGlobalSearchQuery,
  getThumbnailUrl,
} from "../store";
import "./GlobalSearch.css";

interface PlaylistEntry {
  id: string;
  name: string;
  created_at: string;
}

interface ArtistEntry {
  name: string;
  avatar_path: string;
}

interface SettingItem {
  id: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
}

const SETTINGS_INDEX: SettingItem[] = [
  {
    id: "setting-appearance-theme",
    title: "Appearance (Theme)",
    description: "Toggle between Light and Dark interface modes.",
    category: "Appearance",
    keywords: ["light", "dark", "theme", "mode", "appearance", "style"],
  },
  {
    id: "setting-appearance-palette",
    title: "Color Palette",
    description: "Choose a primary accent scheme (Sunset or Crimson).",
    category: "Appearance",
    keywords: [
      "color",
      "palette",
      "accent",
      "sunset",
      "crimson",
      "red",
      "orange",
    ],
  },
  {
    id: "setting-appearance-sidebar",
    title: "Auto-Expand Sidebar",
    description:
      "Automatically open the side navigation menu when hovering over it.",
    category: "Appearance",
    keywords: [
      "sidebar",
      "hover",
      "expand",
      "navigation",
      "auto-expand",
      "menu",
    ],
  },
  {
    id: "setting-appearance-searchbar",
    title: "Always Show Search Bar",
    description:
      "Keep the floating search bar visible in the top-middle instead of auto-hiding.",
    category: "Appearance",
    keywords: [
      "search",
      "searchbar",
      "hide",
      "always",
      "show",
      "visibility",
      "floating",
      "middle",
    ],
  },
  {
    id: "setting-appearance-fps",
    title: "Show FPS Counter",
    description:
      "Display an in-app real-time frame rate monitor in the corner.",
    category: "Appearance",
    keywords: [
      "fps",
      "frame",
      "rate",
      "counter",
      "performance",
      "monitor",
      "lag",
    ],
  },
  {
    id: "setting-appearance-shortcuts",
    title: "Keyboard Shortcuts",
    description:
      "View all playback, media seeking, and app navigation keybindings.",
    category: "Appearance",
    keywords: [
      "keyboard",
      "shortcuts",
      "cheat sheet",
      "hotkeys",
      "keys",
      "bindings",
    ],
  },
  {
    id: "setting-engine-concurrent-dl",
    title: "Concurrent Downloads",
    description: "Maximum number of videos to download at the same time.",
    category: "Engine Preferences",
    keywords: [
      "concurrent",
      "parallel",
      "downloads",
      "queue",
      "simultaneous",
      "limit",
    ],
  },
  {
    id: "setting-engine-concurrent-frag",
    title: "Concurrent Fragments",
    description: "Speeds up HLS/DASH downloads by fetching parts in parallel.",
    category: "Engine Preferences",
    keywords: ["fragments", "chunks", "hls", "dash", "speed", "parallel"],
  },
  {
    id: "setting-engine-speed-limit",
    title: "Download Speed Limit",
    description:
      "Limit download speed (e.g., 500K, 2.5M). Leave blank for no limit.",
    category: "Engine Preferences",
    keywords: ["speed", "limit", "rate", "bandwidth", "throttle"],
  },
  {
    id: "setting-engine-browser-cookies",
    title: "Browser Cookies",
    description:
      "Use cookies from a browser (Chrome, Firefox, etc.) to bypass login/age restrictions.",
    category: "Engine Preferences",
    keywords: [
      "cookies",
      "browser",
      "chrome",
      "firefox",
      "edge",
      "safari",
      "login",
      "auth",
      "bypass",
    ],
  },
  {
    id: "setting-engine-youtube-client",
    title: "YouTube API Client Fallback",
    description:
      "Hot-swap client masquerading to bypass blocks (tv_embedded, android_vr, mweb).",
    category: "Engine Preferences",
    keywords: [
      "youtube",
      "client",
      "fallback",
      "api",
      "masquerade",
      "block",
      "mweb",
      "tv",
    ],
  },
  {
    id: "setting-engine-auto-subs",
    title: "Download Automatic Subtitles",
    description:
      "If official subtitles aren't found, download auto-generated ones.",
    category: "Engine Preferences",
    keywords: [
      "subtitles",
      "captions",
      "auto",
      "automatic",
      "vtt",
      "languages",
    ],
  },
  {
    id: "setting-engine-sponsorblock",
    title: "Remove Sponsored Segments",
    description: "Automatically cut sponsored sections, intros, outros, etc.",
    category: "Engine Preferences",
    keywords: [
      "sponsor",
      "sponsorblock",
      "skip",
      "ads",
      "intros",
      "outro",
      "promos",
    ],
  },
  {
    id: "setting-engine-reindex",
    title: "Re-index Local Storage",
    description:
      "Scans your video directory to re-align metadata profiles and clean orphan links.",
    category: "Engine Preferences",
    keywords: [
      "reindex",
      "re-index",
      "scan",
      "database",
      "library",
      "refresh",
      "fix",
    ],
  },
  {
    id: "setting-ui-benchmark",
    title: "UI Performance Benchmark",
    description:
      "Run graphics and frame pacing diagnostics to measure FPS stability and DOM speed.",
    category: "Performance & Diagnostics",
    keywords: [
      "benchmark",
      "fps",
      "performance",
      "test",
      "speed",
      "diagnostics",
      "lag",
      "stutter",
    ],
  },
  {
    id: "setting-danger-force-setup",
    title: "Force Setup Screen",
    description:
      "Launch the deployment screen to test setup rendering without deleting existing files.",
    category: "Danger Zone",
    keywords: ["setup", "force", "deployment", "wizard", "reset"],
  },
  {
    id: "setting-danger-update-binaries",
    title: "Update Core Engines",
    description:
      "Checks for, downloads, and overrides yt-dlp and ffmpeg with latest stable releases.",
    category: "Danger Zone",
    keywords: ["update", "yt-dlp", "ffmpeg", "binaries", "upgrade", "engines"],
  },
  {
    id: "setting-danger-wipe-dependencies",
    title: "Wipe Core Engines",
    description:
      "Deletes yt-dlp and ffmpeg from hidden app data without deleting videos.",
    category: "Danger Zone",
    keywords: ["wipe", "delete", "yt-dlp", "ffmpeg", "dependencies", "engines"],
  },
  {
    id: "setting-danger-clean-database",
    title: "Clean Database & Media",
    description:
      "Deletes all downloaded videos and clears the SQLite database.",
    category: "Danger Zone",
    keywords: ["clean", "database", "media", "delete", "purge", "clear"],
  },
  {
    id: "setting-danger-nuclear-wipe",
    title: "Nuclear Wipe",
    description:
      "Permanently destroys database, core engines, and ALL downloaded video/audio media.",
    category: "Danger Zone",
    keywords: ["nuclear", "wipe", "destroy", "everything", "reset", "purge"],
  },
];

export default function GlobalSearch() {
  const navigate = useNavigate();
  let inputRef: HTMLInputElement | undefined;
  let spotlightInputRef: HTMLInputElement | undefined;

  const [videos, setVideos] = createSignal<VideoEntry[]>([]);
  const [playlists, setPlaylists] = createSignal<PlaylistEntry[]>([]);
  const [artists, setArtists] = createSignal<ArtistEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const currentPath = () => {
    try {
      return useLocation().pathname;
    } catch {
      return typeof window !== "undefined"
        ? window.location.pathname || "/"
        : "/";
    }
  };

  // Dynamic scope calculation based on active page route
  const scope = () => {
    const path = currentPath();
    if (path.startsWith("/settings")) {
      return {
        id: "settings",
        label: "Settings",
        icon: "ph-gear",
        class: "scope-settings",
      };
    }
    if (path.startsWith("/artist")) {
      return {
        id: "artist",
        label: "Artists & Videos",
        icon: "ph-microphone-stage",
        class: "scope-artist",
      };
    }
    if (path.startsWith("/playlist")) {
      return {
        id: "playlist",
        label: "Playlists & Videos",
        icon: "ph-list-dashes",
        class: "scope-playlist",
      };
    }
    if (path.startsWith("/favourites")) {
      return {
        id: "favourites",
        label: "Favourites",
        icon: "ph-heart",
        class: "scope-favourites",
      };
    }
    if (path.startsWith("/downloads")) {
      return {
        id: "downloads",
        label: "Downloads",
        icon: "ph-download-simple",
        class: "scope-downloads",
      };
    }
    if (path.startsWith("/player")) {
      return {
        id: "player",
        label: "Media Player",
        icon: "ph-play-circle",
        class: "scope-player",
      };
    }
    return {
      id: "home",
      label: "All Library",
      icon: "ph-planet",
      class: "scope-home",
    };
  };

  const loadSearchData = async () => {
    try {
      const [vData, pData, aData] = await Promise.all([
        invoke<VideoEntry[]>("get_downloaded_videos").catch(() => []),
        invoke<PlaylistEntry[]>("get_playlists").catch(() => []),
        invoke<ArtistEntry[]>("get_artists").catch(() => []),
      ]);
      setVideos(Array.isArray(vData) ? vData : []);
      setPlaylists(Array.isArray(pData) ? pData : []);
      setArtists(Array.isArray(aData) ? aData : []);
    } catch (e) {
      console.error("Failed to load global search dataset:", e);
    }
  };

  onMount(() => {
    loadSearchData();
  });

  createEffect(() => {
    if (isSearchOpen() || alwaysShowSearchBar()) {
      loadSearchData();
    }
  });

  // Focus input when search opens
  createEffect(() => {
    if (isSearchOpen()) {
      setTimeout(() => {
        const el = alwaysShowSearchBar() ? inputRef : spotlightInputRef;
        if (el && document.activeElement !== el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 15);
    }
  });

  const query = () => globalSearchQuery().trim().toLowerCase();

  const filteredResults = () => {
    const q = query();
    if (!q)
      return { settings: [], videos: [], playlists: [], artists: [], total: 0 };

    const currentScope = scope().id;

    let matchedSettings: SettingItem[] = [];
    let matchedVideos: VideoEntry[] = [];
    let matchedPlaylists: PlaylistEntry[] = [];
    let matchedArtists: ArtistEntry[] = [];

    if (currentScope === "settings") {
      matchedSettings = SETTINGS_INDEX.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.keywords.some((k) => k.includes(q)),
      );
    } else if (currentScope === "artist") {
      matchedArtists = artists().filter((a) =>
        a.name.toLowerCase().includes(q),
      );
      matchedVideos = videos().filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.channel.toLowerCase().includes(q),
      );
    } else if (currentScope === "playlist") {
      matchedPlaylists = playlists().filter((p) =>
        p.name.toLowerCase().includes(q),
      );
      matchedVideos = videos().filter((v) => v.title.toLowerCase().includes(q));
    } else if (currentScope === "favourites") {
      matchedVideos = videos().filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.channel.toLowerCase().includes(q),
      );
    } else {
      matchedVideos = videos().filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.channel.toLowerCase().includes(q),
      );
      matchedPlaylists = playlists().filter((p) =>
        p.name.toLowerCase().includes(q),
      );
      matchedArtists = artists().filter((a) =>
        a.name.toLowerCase().includes(q),
      );
    }

    const total =
      matchedSettings.length +
      matchedVideos.length +
      matchedPlaylists.length +
      matchedArtists.length;

    return {
      settings: matchedSettings,
      videos: matchedVideos,
      playlists: matchedPlaylists,
      artists: matchedArtists,
      total,
    };
  };

  const flatResultsList = () => {
    const res = filteredResults();
    const list: Array<{
      id: string;
      type: "setting" | "video" | "playlist" | "artist";
      data: any;
    }> = [];

    res.settings.forEach((s) =>
      list.push({ id: s.id, type: "setting", data: s }),
    );
    res.videos.forEach((v) => list.push({ id: v.id, type: "video", data: v }));
    res.playlists.forEach((p) =>
      list.push({ id: p.id, type: "playlist", data: p }),
    );
    res.artists.forEach((a) =>
      list.push({ id: a.name, type: "artist", data: a }),
    );

    return list;
  };

  // Scroll active item smoothly into view whenever selectedIndex changes
  createEffect(() => {
    const idx = selectedIndex();
    if (idx >= 0 && isSearchOpen()) {
      setTimeout(() => {
        const el = document.getElementById(`search-result-${idx}`);
        if (el) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }, 0);
    }
  });

  const handleSelectResult = (item: { type: string; data: any }) => {
    setIsSearchOpen(false);
    if (!alwaysShowSearchBar()) setGlobalSearchQuery("");

    if (item.type === "setting") {
      const setting = item.data as SettingItem;
      if (!currentPath().startsWith("/settings")) {
        navigate("/settings");
      }
      setTimeout(() => {
        const el = document.getElementById(setting.id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlight-pulse");
          setTimeout(() => el.classList.remove("highlight-pulse"), 2500);
        }
      }, 100);
    } else if (item.type === "video") {
      const vid = item.data as VideoEntry;
      navigate(`/player/${vid.id}`);
    } else if (item.type === "playlist") {
      navigate(`/playlists`);
    } else if (item.type === "artist") {
      const art = item.data as ArtistEntry;
      navigate(`/artist/${encodeURIComponent(art.name)}`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isSearchOpen() && alwaysShowSearchBar()) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsSearchOpen(true);
        setSelectedIndex(0);
        return;
      }
    }

    const list = flatResultsList();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % list.length);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + list.length) % list.length);
      }
      return;
    }

    if (e.key === "Tab") {
      if (list.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex((prev) => (prev - 1 + list.length) % list.length);
        } else {
          setSelectedIndex((prev) => (prev + 1) % list.length);
        }
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (
        list.length > 0 &&
        selectedIndex() >= 0 &&
        selectedIndex() < list.length
      ) {
        handleSelectResult(list[selectedIndex()]);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      return;
    }
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    if (!alwaysShowSearchBar()) {
      setGlobalSearchQuery("");
    }
  };

  const ResultsView = () => {
    const settingsList = () => filteredResults().settings;
    const videosList = () => filteredResults().videos;
    const playlistsList = () => filteredResults().playlists;
    const artistsList = () => filteredResults().artists;
    const totalCount = () => filteredResults().total;

    const settingsOffset = () => 0;
    const videosOffset = () => settingsList().length;
    const playlistsOffset = () => videosOffset() + videosList().length;
    const artistsOffset = () => playlistsOffset() + playlistsList().length;

    return (
      <div class="search-results-wrapper">
        <Show
          when={totalCount() > 0}
          fallback={
            <Show when={globalSearchQuery().length > 0}>
              <div class="search-no-results">
                <i class="ph ph-sparkle no-results-icon"></i>
                <p>No results found for &ldquo;{globalSearchQuery()}&rdquo;</p>
                <span class="no-results-hint">
                  Try adjusting keywords or clearing the filter
                </span>
              </div>
            </Show>
          }
        >
          <div class="search-results-scrollable">
            {/* Settings Results */}
            <Show when={settingsList().length > 0}>
              <div class="search-group">
                <div class="search-group-header">
                  <i class="ph-fill ph-gear"></i> Settings Options
                  <span class="group-count">{settingsList().length}</span>
                </div>
                <For each={settingsList()}>
                  {(setting, idx) => {
                    const itemIdx = () => settingsOffset() + idx();
                    const isSelected = () => selectedIndex() === itemIdx();
                    return (
                      <div
                        id={`search-result-${itemIdx()}`}
                        class={`search-result-item ${isSelected() ? "selected" : ""}`}
                        onClick={() =>
                          handleSelectResult({ type: "setting", data: setting })
                        }
                        onMouseEnter={() => setSelectedIndex(itemIdx())}
                      >
                        <div class="result-icon-badge setting">
                          <i class="ph-fill ph-sliders"></i>
                        </div>
                        <div class="result-info">
                          <h4 class="result-title">{setting.title}</h4>
                          <p class="result-desc">{setting.description}</p>
                        </div>
                        <span class="result-tag">{setting.category}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Videos Results */}
            <Show when={videosList().length > 0}>
              <div class="search-group">
                <div class="search-group-header">
                  <i class="ph-fill ph-film-strip"></i> Videos & Media
                  <span class="group-count">{videosList().length}</span>
                </div>
                <For each={videosList()}>
                  {(video, idx) => {
                    const itemIdx = () => videosOffset() + idx();
                    const isSelected = () => selectedIndex() === itemIdx();
                    return (
                      <div
                        id={`search-result-${itemIdx()}`}
                        class={`search-result-item ${isSelected() ? "selected" : ""}`}
                        onClick={() =>
                          handleSelectResult({ type: "video", data: video })
                        }
                        onMouseEnter={() => setSelectedIndex(itemIdx())}
                      >
                        <div class="result-thumb-wrapper">
                          <img
                            src={getThumbnailUrl(video)}
                            class="result-thumb-img"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <i class="ph-fill ph-play play-overlay-icon"></i>
                        </div>
                        <div class="result-info">
                          <h4 class="result-title">{video.title}</h4>
                          <p class="result-subtitle">
                            <i class="ph ph-user"></i> {video.channel}
                          </p>
                        </div>
                        <span class="result-tag video">Video</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Playlists Results */}
            <Show when={playlistsList().length > 0}>
              <div class="search-group">
                <div class="search-group-header">
                  <i class="ph-fill ph-list-dashes"></i> Playlists
                  <span class="group-count">{playlistsList().length}</span>
                </div>
                <For each={playlistsList()}>
                  {(playlist, idx) => {
                    const itemIdx = () => playlistsOffset() + idx();
                    const isSelected = () => selectedIndex() === itemIdx();
                    return (
                      <div
                        id={`search-result-${itemIdx()}`}
                        class={`search-result-item ${isSelected() ? "selected" : ""}`}
                        onClick={() =>
                          handleSelectResult({
                            type: "playlist",
                            data: playlist,
                          })
                        }
                        onMouseEnter={() => setSelectedIndex(itemIdx())}
                      >
                        <div class="result-icon-badge playlist">
                          <i class="ph-fill ph-playlist"></i>
                        </div>
                        <div class="result-info">
                          <h4 class="result-title">{playlist.name}</h4>
                          <p class="result-subtitle">Playlist</p>
                        </div>
                        <span class="result-tag playlist">Playlist</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Artists Results */}
            <Show when={artistsList().length > 0}>
              <div class="search-group">
                <div class="search-group-header">
                  <i class="ph-fill ph-microphone-stage"></i> Artists
                  <span class="group-count">{artistsList().length}</span>
                </div>
                <For each={artistsList()}>
                  {(artist, idx) => {
                    const itemIdx = () => artistsOffset() + idx();
                    const isSelected = () => selectedIndex() === itemIdx();
                    return (
                      <div
                        id={`search-result-${itemIdx()}`}
                        class={`search-result-item ${isSelected() ? "selected" : ""}`}
                        onClick={() =>
                          handleSelectResult({ type: "artist", data: artist })
                        }
                        onMouseEnter={() => setSelectedIndex(itemIdx())}
                      >
                        <div class="result-avatar-wrapper">
                          <img
                            src={convertFileSrc(artist.avatar_path)}
                            class="result-avatar-img"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <i class="ph-fill ph-user avatar-fallback"></i>
                        </div>
                        <div class="result-info">
                          <h4 class="result-title">{artist.name}</h4>
                          <p class="result-subtitle">Artist</p>
                        </div>
                        <span class="result-tag artist">Artist</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <div class="spotlight-footer">
          <span class="shortcut-tip">
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate &nbsp;•&nbsp; <kbd>↵</kbd> select
            &nbsp;•&nbsp; <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Centered Floating Search Bar when ALWAYS SHOW is enabled */}
      <Show when={alwaysShowSearchBar()}>
        <Show when={isSearchOpen()}>
          <div class="floating-search-backdrop" onClick={closeSearch} />
        </Show>

        <div
          class={`floating-search-container ${isSearchOpen() ? "is-expanded" : ""}`}
        >
          <div
            class="floating-search-bar"
            onClick={() => {
              if (!isSearchOpen()) setIsSearchOpen(true);
              inputRef?.focus();
            }}
          >
            <i class="ph ph-magnifying-glass floating-search-icon"></i>

            <span class={`search-scope-badge ${scope().class}`}>
              <i class={`ph-fill ${scope().icon}`}></i>
              <span class="scope-text">{scope().label}</span>
            </span>

            <input
              ref={inputRef}
              type="text"
              class="floating-search-input"
              placeholder={`Search ${scope().label.toLowerCase()}...`}
              value={globalSearchQuery()}
              onFocus={() => setIsSearchOpen(true)}
              onInput={(e) => {
                setGlobalSearchQuery(e.currentTarget.value);
                setSelectedIndex(0);
                if (!isSearchOpen()) setIsSearchOpen(true);
              }}
              onKeyDown={handleKeyDown}
            />

            <Show when={globalSearchQuery().length > 0}>
              <button
                class="floating-search-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setGlobalSearchQuery("");
                  inputRef?.focus();
                }}
                title="Clear search"
              >
                <i class="ph ph-x"></i>
              </button>
            </Show>

            <div
              class="floating-search-kbd"
              onClick={(e) => {
                e.stopPropagation();
                if (isSearchOpen()) closeSearch();
                else {
                  setIsSearchOpen(true);
                  inputRef?.focus();
                }
              }}
              title={isSearchOpen() ? "Press Esc to close" : "Quick Search"}
            >
              <Show
                when={isSearchOpen()}
                fallback={
                  <span class="kbd-combo">
                    <kbd>Ctrl</kbd>
                    <kbd>F</kbd>
                  </span>
                }
              >
                <kbd>Esc</kbd>
              </Show>
            </div>
          </div>

          {/* Floating Results Dropdown Panel (Anchored to the center floating bar) */}
          <Show when={isSearchOpen()}>
            <div class="floating-search-dropdown">
              <ResultsView />
            </div>
          </Show>
        </div>
      </Show>

      {/* 2. Floating Center Spotlight Modal when ALWAYS SHOW is disabled */}
      <Show when={!alwaysShowSearchBar() && isSearchOpen()}>
        <div class="spotlight-backdrop" onClick={closeSearch} />

        <div class="spotlight-modal-container">
          <div class="spotlight-search-header">
            <i class="ph ph-magnifying-glass spotlight-search-icon"></i>

            <span class={`search-scope-badge ${scope().class}`}>
              <i class={`ph-fill ${scope().icon}`}></i>
              <span class="scope-text">{scope().label}</span>
            </span>

            <input
              ref={spotlightInputRef}
              type="text"
              class="spotlight-search-input"
              placeholder={`Search ${scope().label.toLowerCase()}...`}
              value={globalSearchQuery()}
              onInput={(e) => {
                setGlobalSearchQuery(e.currentTarget.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              autofocus
            />

            <Show when={globalSearchQuery().length > 0}>
              <button
                class="floating-search-clear-btn"
                onClick={() => {
                  setGlobalSearchQuery("");
                  spotlightInputRef?.focus();
                }}
                title="Clear search"
              >
                <i class="ph ph-x"></i>
              </button>
            </Show>

            <div
              class="spotlight-esc-tag"
              onClick={closeSearch}
              title="Close search"
            >
              <kbd>Esc</kbd>
            </div>
          </div>

          <div class="spotlight-results-body">
            <ResultsView />
          </div>
        </div>
      </Show>
    </>
  );
}
