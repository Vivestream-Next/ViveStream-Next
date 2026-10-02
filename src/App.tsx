import { lazy, Component, createSignal, onMount, Show } from "solid-js";
import { Router, Route, A, useNavigate } from "@solidjs/router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
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
  isSearchOpen,
  setIsSearchOpen,
  isSortOpen,
  setIsSortOpen,
  setGlobalSearchQuery,
  activeVideo,
  playerContextParams,
  miniplayerDismissed,
  setMiniplayerDismissed,
  checkLicenseStatus,
} from "./store";
import NotificationSystem from "./components/NotificationSystem";
import ShortcutsModal from "./components/ShortcutsModal";
import Miniplayer from "./components/Miniplayer";
import FPSCounter from "./components/FPSCounter";
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
const AI = lazy(() => import("./pages/AI"));

const AppLogo = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 500 500"
    xmlns="http://www.w3.org/2000/svg"
    class="app-logo"
  >
    <path
      fill="var(--primary-accent)"
      d="M83.333 0h333.334A83.333 83.333 0 0 1 500 83.333v333.334A83.333 83.333 0 0 1 416.667 500H83.333A83.333 83.333 0 0 1 0 416.667V83.333A83.333 83.333 0 0 1 83.333 0"
    />
    <path
      d="M95 125 L250 385 L405 125"
      stroke="#f1f1f1"
      stroke-width="30"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      class="logo-glow"
      d="M100 125 Q110 125 118 85 Q126 45 134 125 Q142 175 150 125 Q158 75 166 125 Q174 25 182 125 Q190 215 198 125 Q206 55 214 125 Q222 195 230 125 Q238 35 246 125 Q254 235 262 125 Q270 45 278 125 Q286 205 294 125 Q302 65 310 125 Q318 175 326 125 Q334 85 342 125 Q350 225 358 125 Q366 55 374 125 Q382 165 390 125 Q398 105 405 125"
      stroke="#ffffff"
      stroke-width="6"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

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

  onMount(() => {
    invoke<{
      ytdlp_exists: boolean;
      ffmpeg_exists: boolean;
    }>("check_binaries")
      .then((status) => {
        if (status && status.ytdlp_exists && status.ffmpeg_exists) {
          setNeedsSetup(false);
        } else {
          setNeedsSetup(true);
        }
      })
      .catch((e) => {
        console.error("Core engine validation failure:", e);
        setNeedsSetup(true);
      });
  });

  return (
    <div class="app-wrapper">
      <NotificationSystem />
      <ShortcutsModal
        isOpen={showShortcutsModal()}
        onClose={() => setShowShortcutsModal(false)}
      />
      <FPSCounter />
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

  onMount(() => {
    checkLicenseStatus().catch(() => {});

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Escape closes shortcuts modal, sort bar, or search bar
      if (e.key === "Escape") {
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
          key === "d"
        ) {
          e.preventDefault();
          navigate("/downloads");
        } else if (
          code === "Digit6" ||
          key === "6" ||
          key === "^" ||
          key === "s"
        ) {
          e.preventDefault();
          navigate("/settings");
        } else if (
          code === "Digit7" ||
          key === "7" ||
          key === "&"
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
            href="/ai"
            text="AI"
            iconName="sparkle"
            animClass="anim-pulse"
            badge="PRO"
          />
        </div>
        <div class="nav-links bottom-links">
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
        <Route path="/player/:id" component={Player} />
        <Route path="/ai" component={AI} />
      </Route>
    </Router>
  );
};

export default App;
