import { lazy, Component, createSignal, createEffect, onMount, Show } from "solid-js";
import { Router, Route, A, useNavigate, useLocation } from "@solidjs/router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
import "@phosphor-icons/web/bold";
import "./App.css";
import GlobalSearch from "./components/GlobalSearch";
import {
  sidebarHoverMode,
  forceSetup,
  setForceSetup,
  showShortcutsModal,
  setShowShortcutsModal,
  showArcadeModal,
  setShowArcadeModal,
  showFuelModal,
  setShowFuelModal,
  supporterTier,
  SUPPORTER_BADGES,
  isSearchOpen,
  setIsSearchOpen,
  isSortOpen,
  setIsSortOpen,
  setGlobalSearchQuery,
  activeVideo,
  playerContextParams,
  miniplayerDismissed,
  setLastNonPlayerPath,
  setMiniplayerDismissed,
  checkLicenseStatus,
  initWhisperStatus,
  autoCheckEngineUpdates,
  setEngineUpdateReady,
  setEngineUpdateDownloading,
  setEngineUpdateInfo,
  setUpdateProgress,
  checkForAppUpdates,
  UpdateProgressEvent,
  addToast,
} from "./store";
import NotificationSystem from "./components/NotificationSystem";
import DynamicAppLogo from "./components/DynamicAppLogo";
import ShortcutsModal from "./components/ShortcutsModal";
import ArcadeModal from "./components/ArcadeModal";
import FuelTheCodeModal from "./components/FuelTheCodeModal";
import Miniplayer from "./components/Miniplayer";
import FPSCounter from "./components/FPSCounter";
import PixelMascot from "./components/PixelMascot";
import { stashSharedVideo } from "./utils/persistentPlayer";
import FloatingSortBar from "./components/FloatingSortBar";

const Home = lazy(() => import("./pages/Home"));
const Downloads = lazy(() => import("./pages/Downloads"));
const Player = lazy(() => import("./pages/Player"));
const Setup = lazy(() => import("./pages/Setup"));
const Settings = lazy(() => import("./pages/Settings"));
const Favourites = lazy(() => import("./pages/Favourites"));
const Playlists = lazy(() => import("./pages/Playlists"));
const Artists = lazy(() => import("./pages/Artists"));
const ArtistPage = lazy(() => import("./pages/ArtistPage"));
const LyricsStudio = lazy(() => import("./pages/LyricsStudio"));
const AI = lazy(() => import("./pages/AI"));

const AppLogo = () => <DynamicAppLogo size={32} />;

const ImmersiveTitleBar = () => {
  const win = getCurrentWindow();
  return (
    <div class="immersive-titlebar-wrapper">
      <div data-tauri-drag-region class="drag-region"></div>
      <div
        class="titlebar-controls"
        role="toolbar"
        aria-label="Window controls"
      >
        <button
          type="button"
          class="titlebar-btn"
          onClick={() => win.hide()}
          title="Hide to Tray"
          aria-label="Hide to Tray"
        >
          <i class="ph ph-caret-down" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="titlebar-btn"
          onClick={() => win.minimize()}
          title="Minimize"
          aria-label="Minimize Window"
        >
          <i class="ph ph-minus" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="titlebar-btn"
          onClick={() => win.toggleMaximize()}
          title="Maximize"
          aria-label="Maximize or Restore Window"
        >
          <i class="ph ph-square" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="titlebar-btn close-btn"
          onClick={() => win.close()}
          title="Close"
          aria-label="Close Application"
        >
          <i class="ph ph-x" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
};

const AppLifecycle: Component<{ children?: any }> = (props) => {
  const [needsSetup, setNeedsSetup] = createSignal<boolean | null>(false);

  const LAST_ENGINE_CHECK_KEY = "vs_last_engine_check_timestamp";
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  const checkEngineUpdatesOnStartup = async () => {
    if (!autoCheckEngineUpdates()) return;

    const lastCheckStr = localStorage.getItem(LAST_ENGINE_CHECK_KEY);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;
    const now = Date.now();
    if (now - lastCheck < TWENTY_FOUR_HOURS) {
      console.log(
        "[EngineUpdater] Skipping startup check: engines checked within the last 24 hours.",
      );
      return;
    }

    try {
      const updateInfo = await invoke<{
        update_available: boolean;
        ytdlp_update: boolean;
        current_ytdlp_version: string;
        latest_ytdlp_version: string;
        ffmpeg_installed: boolean;
        deno_installed: boolean;
        whisper_installed?: boolean;
        whisper_update?: boolean;
        whisper_version?: string;
        latest_whisper_version?: string;
        message: string;
      }>("check_engine_updates");

      localStorage.setItem(LAST_ENGINE_CHECK_KEY, now.toString());
      setEngineUpdateInfo(updateInfo);

      if (updateInfo.update_available) {
        console.log("[EngineUpdater] Background update available:", updateInfo);
        setEngineUpdateDownloading(true);
        addToast(
          `Updating core engines in background...`,
          "info",
        );

        await invoke("update_binaries");
        setEngineUpdateDownloading(false);
        setEngineUpdateReady(true);
      } else {
        console.log(
          "[EngineUpdater] Engines are up to date:",
          updateInfo.current_ytdlp_version,
        );
      }
    } catch (err) {
      console.warn("[EngineUpdater] Startup check failed:", err);
      setEngineUpdateDownloading(false);
    }
  };

  onMount(() => {
    let unlistenCompleted: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      listen("engine-update-completed", () => {
        setEngineUpdateReady(true);
      })
        .then((un) => {
          unlistenCompleted = un;
        })
        .catch(() => {});

      listen<UpdateProgressEvent>("update-progress", (event) => {
        setUpdateProgress(event.payload);
      })
        .then((un) => {
          unlistenProgress = un;
        })
        .catch(() => {});
    }

    invoke<{
      ytdlp_exists: boolean;
      ffmpeg_exists: boolean;
    }>("check_binaries")
      .then((status) => {
        if (status && status.ytdlp_exists && status.ffmpeg_exists) {
          setNeedsSetup(false);
          // Wait 2.5s after launch to ensure initial render is butter smooth before checking
          setTimeout(checkEngineUpdatesOnStartup, 2500);
          setTimeout(() => checkForAppUpdates(true), 3500);
        } else {
          setNeedsSetup(true);
        }
      })
      .catch((e) => {
        console.error("Core engine validation failure:", e);
        setNeedsSetup(true);
      });

    return () => {
      if (unlistenCompleted) unlistenCompleted();
      if (unlistenProgress) unlistenProgress();
    };
  });

  return (
    <div class="app-wrapper">
      <NotificationSystem />
      <ShortcutsModal
        isOpen={showShortcutsModal()}
        onClose={() => setShowShortcutsModal(false)}
      />
      <ArcadeModal
        isOpen={showArcadeModal()}
        onClose={() => setShowArcadeModal(false)}
      />
      <FuelTheCodeModal />
      <FPSCounter />
      <PixelMascot />
      <ImmersiveTitleBar />
      <Show
        when={needsSetup() !== null}
        fallback={
          <div class="setup-loading-screen">
            <i class="ph ph-spinner spinIcon setup-loading-spinner"></i>
          </div>
        }
      >
        <Show
          when={needsSetup() === false && !forceSetup()}
          fallback={
            <Setup
              onComplete={() => {
                setNeedsSetup(false);
                setForceSetup(false);
              }}
            />
          }
        >
          <div class="top-floating-header">
            <GlobalSearch />
            <FloatingSortBar />
          </div>
          <Miniplayer />
          {props.children}
        </Show>
      </Show>
    </div>
  );
};

const NavItem = (props: {
  href: string;
  text: string;
  iconName: string;
  animClass?: string;
  badge?: string;
}) => {
  return (
    <A href={props.href} end={props.href === "/"}>
      <div class={`icon-stack ${props.animClass || ""}`}>
        <i class={`ph ph-${props.iconName} icon-outline`}></i>
        <i class={`ph-fill ph-${props.iconName} icon-fill`}></i>
      </div>
      <span class="nav-text">{props.text}</span>
      {props.badge && <span class="nav-badge-pro">{props.badge}</span>}
    </A>
  );
};

const AppLayout: Component<{ children?: any }> = (props) => {
  const [isPinned, setIsPinned] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);

  const isExpanded = () => isPinned() || isHovered();
  const navigate = useNavigate();
  const location = useLocation();

  createEffect(() => {
    const path = location.pathname;
    if (path && !path.startsWith("/player")) {
      setLastNonPlayerPath(path);
    }
  });

  onMount(() => {
    checkLicenseStatus().catch(() => {});
    initWhisperStatus().catch(() => {});

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Escape closes fuel modal, arcade modal, shortcuts modal, sort bar, or search bar
      if (e.key === "Escape") {
        if (showFuelModal()) {
          e.preventDefault();
          setShowFuelModal(false);
          return;
        }
        if (showArcadeModal()) {
          e.preventDefault();
          setShowArcadeModal(false);
          return;
        }
        if (showShortcutsModal()) {
          e.preventDefault();
          setShowShortcutsModal(false);
          return;
        }
        if (isSearchOpen()) {
          e.preventDefault();
          setIsSearchOpen(false);
          return;
        }
        if (isSortOpen()) {
          e.preventDefault();
          setIsSortOpen(false);
          return;
        }
        if (isInput) {
          target?.blur();
          return;
        }
        if (!document.fullscreenElement) {
          e.preventDefault();
          navigate(-1);
        }
        return;
      }

      // Ctrl + S or Alt + S sorting hotkey
      if (
        !isInput &&
        (((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) ||
          (e.altKey && (e.key === "s" || e.key === "S")))
      ) {
        e.preventDefault();
        setIsSortOpen(!isSortOpen());
        return;
      }

      // Ctrl + F search hotkey
      if (
        !isInput &&
        (e.ctrlKey || e.metaKey) &&
        (e.key === "f" || e.key === "F")
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // / search hotkey (when not in input)
      if (!isInput && e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Type anywhere to search (Linux style app behavior)
      if (
        !isInput &&
        !location.pathname.startsWith("/player") &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.shiftKey &&
        e.key.length === 1 &&
        e.key >= " " &&
        e.key <= "~"
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
        setGlobalSearchQuery((prev) => prev + e.key);
        return;
      }

      // Help Shortcut (?) when not in input
      if (!isInput && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShowShortcutsModal(!showShortcutsModal());
        return;
      }

      // Stream Runner Arcade Shortcut (G) when not in input
      if (
        !isInput &&
        (e.key === "g" || e.key === "G") &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        setShowArcadeModal(!showArcadeModal());
        return;
      }

      // Miniplayer Toggle (I) when not in player page
      if (
        !isInput &&
        (e.key === "i" || e.key === "I") &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        if (!location.pathname.startsWith("/player")) {
          const vid = activeVideo();
          if (vid) {
            e.preventDefault();
            if (miniplayerDismissed()) {
              setMiniplayerDismissed(false);
            } else {
              stashSharedVideo();
              const params = playerContextParams();
              const qs = new URLSearchParams(
                params as Record<string, string>,
              ).toString();
              navigate(`/player/${vid.id}${qs ? `?${qs}` : ""}`);
            }
            return;
          }
        }
      }

      // Global Navigation (Shift + 1..6 or Shift + H/F/P/A/D/S)
      if (!isInput && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        const code = e.code;
        if (code === "Digit1" || key === "1" || key === "!" || key === "h") {
          e.preventDefault();
          navigate("/");
        } else if (
          code === "Digit2" ||
          key === "2" ||
          key === "@" ||
          key === "f"
        ) {
          e.preventDefault();
          navigate("/favourites");
        } else if (
          code === "Digit3" ||
          key === "3" ||
          key === "#" ||
          key === "p"
        ) {
          e.preventDefault();
          navigate("/playlists");
        } else if (
          code === "Digit4" ||
          key === "4" ||
          key === "$" ||
          key === "a"
        ) {
          e.preventDefault();
          navigate("/artists");
        } else if (
          code === "Digit5" ||
          key === "5" ||
          key === "%" ||
          key === "l"
        ) {
          e.preventDefault();
          navigate("/lyrics");
        } else if (
          code === "Digit6" ||
          key === "6" ||
          key === "^" ||
          key === "d"
        ) {
          e.preventDefault();
          navigate("/downloads");
        } else if (
          code === "Digit7" ||
          key === "7" ||
          key === "&" ||
          key === "s"
        ) {
          e.preventDefault();
          navigate("/settings");
        } else if (
          code === "Digit8" ||
          key === "8" ||
          key === "*"
        ) {
          e.preventDefault();
          navigate("/ai");
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  });

  return (
    <div class="app-container">
      <nav
        class={`sidebar ${isExpanded() ? "expanded" : "collapsed"}`}
        onMouseEnter={() =>
          sidebarHoverMode() && !isPinned() && setIsHovered(true)
        }
        onMouseLeave={() =>
          sidebarHoverMode() && !isPinned() && setIsHovered(false)
        }
      >
        <div class="sidebar-header" onClick={() => setIsPinned(!isPinned())}>
          <AppLogo />
          <span class="brand-name">ViveStream</span>
        </div>
        <div class="nav-links top-links">
          <NavItem
            href="/"
            text="Home"
            iconName="house"
            animClass="anim-bounce"
          />
          <NavItem
            href="/favourites"
            text="Favourites"
            iconName="heart"
            animClass="anim-pulse"
          />
          <NavItem href="/playlists" text="Playlists" iconName="list-dashes" />
          <NavItem
            href="/artists"
            text="Artists"
            iconName="microphone-stage"
            animClass="anim-shake"
          />
          <NavItem
            href="/lyrics"
            text="Lyrics Studio"
            iconName="waveform"
            animClass="anim-pulse"
          />
        </div>
        <div class="nav-links bottom-links">
          <button
            type="button"
            class="sidebar-nav-btn"
            onClick={() => setShowArcadeModal(true)}
            title="Stream Runner Arcade (G)"
            aria-label="Stream Runner Arcade"
          >
            <div class="icon-stack anim-bounce">
              <i class="ph ph-game-controller icon-outline"></i>
              <i class="ph-fill ph-game-controller icon-fill"></i>
            </div>
            <span class="nav-text">Arcade</span>
            <span class="nav-badge-pro">PLAY</span>
          </button>
          <button
            type="button"
            class="sidebar-nav-btn fuel-code-btn"
            onClick={() => setShowFuelModal(true)}
            title="Fuel the Code • Voluntary Supporter Lounge"
            aria-label="Fuel the Code"
          >
            <div class="icon-stack anim-pulse" style={{ color: SUPPORTER_BADGES[supporterTier()].color }}>
              <i class={`ph ${SUPPORTER_BADGES[supporterTier()].icon} icon-outline`}></i>
              <i class={`ph-fill ${SUPPORTER_BADGES[supporterTier()].icon} icon-fill`}></i>
            </div>
            <span class="nav-text">Fuel Code</span>
            <span
              class="nav-badge-pro"
              style={{
                background: supporterTier() !== "none" ? SUPPORTER_BADGES[supporterTier()].color : undefined,
                color: supporterTier() !== "none" ? "#000" : undefined,
                "font-weight": "700"
              }}
            >
              {supporterTier() !== "none" ? SUPPORTER_BADGES[supporterTier()].respectTag.split(" ")[0].toUpperCase() : "FREE"}
            </span>
          </button>
          <NavItem
            href="/ai"
            text="AI"
            iconName="sparkle"
            animClass="anim-pulse"
            badge="PRO"
          />
          <NavItem
            href="/downloads"
            text="Downloads"
            iconName="download-simple"
            animClass="anim-slide"
          />
          <NavItem
            href="/settings"
            text="Settings"
            iconName="gear"
            animClass="anim-spin"
          />
        </div>
      </nav>
      <main class="main-content">{props.children}</main>
    </div>
  );
};

const App: Component = () => {
  return (
    <Router root={AppLifecycle}>
      <Route path="/" component={AppLayout}>
        <Route path="/" component={Home} />
        <Route path="/downloads" component={Downloads} />
        <Route path="/settings" component={Settings} />
        <Route path="/playlists" component={Playlists} />
        <Route path="/artists" component={Artists} />
        <Route path="/artist/:name" component={ArtistPage} />
        <Route path="/favourites" component={Favourites} />
        <Route path="/lyrics" component={LyricsStudio} />
        <Route path="/lyrics-studio" component={LyricsStudio} />
        <Route path="/player/:id" component={Player} />
        <Route path="/ai" component={AI} />
      </Route>
    </Router>
  );
};

export default App;
