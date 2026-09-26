import { createSignal, createRoot } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const isBrowser =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const getBool = (key: string, def: boolean) => {
  if (!isBrowser) return def;
  const val = window.localStorage.getItem(key);
  return val === null || val === undefined ? def : val === "true";
};

const getStr = (key: string, def: string) => {
  if (!isBrowser) return def;
  const val = window.localStorage.getItem(key);
  return val === null || val === undefined ? def : val;
};

const getNum = (key: string, def: number) => {
  if (!isBrowser) return def;
  const val = window.localStorage.getItem(key);
  if (val === null || val === undefined) return def;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? def : parsed;
};

const initialAnimState = getBool("useAnimatedIcons", true);
const initialHoverState = getBool("sidebarHoverMode", true);
const initialTheme = getStr("appTheme", "dark");
const initialPalette = getStr("appPalette", "sunset");
const initialStyle =
  (getStr("designStyle", "neo-brutalism") as
    "neo-brutalism" | "claymorphism") || "neo-brutalism";

if (isBrowser) {
  document.documentElement.setAttribute("data-theme", initialTheme);
  document.documentElement.setAttribute("data-palette", initialPalette);
  document.documentElement.setAttribute("data-style", initialStyle);
}

export interface Toast {
  id: string;
  message: string;
  type: "info" | "error" | "success";
}

export interface DialogState {
  title: string;
  message: string;
  type: "info" | "warning" | "error";
  resolve: (value: boolean) => void;
}

export interface VideoEntry {
  id: string;
  title: string;
  channel: string;
  video_path: string;
  thumbnail_path: string;
  avatar_path: string;
  subtitle_path: string;
  desc_path: string;
  added_at?: string;
  lq_thumbnail_path?: string;
}

export type ThumbnailQuality = "low" | "medium" | "high";

export interface DownloadTask {
  id: string;
  title: string;
  channel: string;
  metadata: VideoEntry;
  status: "pending" | "downloading" | "done" | "error" | "cancelled";
  logs: string[];
  showLogs: boolean;
  progress: number;
  phase: string;
  speed?: string;
  eta?: string;
  url?: string;
  dlType?: string;
  targetPlaylistId?: string;
}

export interface DownloadHistoryEntry {
  id: string;
  video_id: string;
  title: string;
  channel: string;
  url: string;
  status: string;
  dl_type: string;
  error_msg?: string;
  created_at: string;
}

export interface VideoMetadataResponse {
  playlist_title: string | null;
  entries: VideoEntry[];
}

export const {
  toasts,
  setToasts,
  dialogState,
  setDialogState,
  useAnimatedIcons,
  setUseAnimatedIcons,
  sidebarHoverMode,
  setSidebarHoverMode,
  alwaysShowSearchBar,
  setAlwaysShowSearchBar,
  alwaysShowSortBar,
  setAlwaysShowSortBar,
  showFpsCounter,
  setShowFpsCounter,
  thumbnailQuality,
  setThumbnailQuality,
  isSearchOpen,
  setIsSearchOpen,
  isSortOpen,
  setIsSortOpen,
  globalSearchQuery,
  setGlobalSearchQuery,
  appTheme,
  setAppTheme,
  appPalette,
  setAppPalette,
  designStyle,
  setDesignStyle,
  isAiUnlocked,
  setIsAiUnlocked,
  concurrentDownloads,
  setConcurrentDownloads,
  concurrentFragments,
  setConcurrentFragments,
  speedLimit,
  setSpeedLimit,
  browserCookies,
  setBrowserCookies,
  playerClient,
  setPlayerClient,
  autoSubtitles,
  setAutoSubtitles,
  removeSponsorBlock,
  setRemoveSponsorBlock,
  downloadType,
  setDownloadType,
  dlSubtitles,
  setDlSubtitles,
  liveFromStart,
  setLiveFromStart,
  forceSetup,
  setForceSetup,
  downloadUrl,
  setDownloadUrl,
  downloadQuality,
  setDownloadQuality,
  defaultSortBy,
  setDefaultSortBy,
  defaultSortDirection,
  setDefaultSortDirection,
  randomizeOnLaunch,
  setRandomizeOnLaunch,
  launchRandomSeed,
  setLaunchRandomSeed,
  homeSortBy,
  setHomeSortBy,
  homeSortDirection,
  setHomeSortDirection,
  homeRandomSeed,
  setHomeRandomSeed,
  favSortBy,
  setFavSortBy,
  favSortDirection,
  setFavSortDirection,
  favRandomSeed,
  setFavRandomSeed,
  playlistsSortBy,
  setPlaylistsSortBy,
  playlistsSortDirection,
  setPlaylistsSortDirection,
  playlistVideosSortBy,
  setPlaylistVideosSortBy,
  playlistVideosSortDirection,
  setPlaylistVideosSortDirection,
  playlistVideosRandomSeed,
  setPlaylistVideosRandomSeed,
  activePlaylistDetail,
  setActivePlaylistDetail,
  artistsSortBy,
  setArtistsSortBy,
  artistsSortDirection,
  setArtistsSortDirection,
  artistVideosSortBy,
  setArtistVideosSortBy,
  artistVideosSortDirection,
  setArtistVideosSortDirection,
  artistVideosRandomSeed,
  setArtistVideosRandomSeed,
  historySortBy,
  setHistorySortBy,
  historySortDirection,
  setHistorySortDirection,
  tasks,
  setTasks,
  isProcessingQueue,
  setIsProcessingQueue,
  isFetchingInfo,
  setIsFetchingInfo,
  fetchingUrl,
  setFetchingUrl,
  downloadHistory,
  setDownloadHistory,
  homeVideos,
  setHomeVideos,
  showShortcutsModal,
  setShowShortcutsModal,
  activeVideo,
  setActiveVideo,
  isPlaying,
  setIsPlaying,
  currentTime,
  setCurrentTime,
  duration,
  setDuration,
  volume,
  setVolume,
  isMuted,
  setIsMuted,
  playbackRate,
  setPlaybackRate,
  isLooping,
  setIsLooping,
  subtitlesEnabled,
  setSubtitlesEnabled,
  playerQueue,
  setPlayerQueue,
  miniplayerDismissed,
  setMiniplayerDismissed,
  theaterMode,
  setTheaterMode,
  playerAmbientMode,
  setPlayerAmbientMode,
  playerAmbientType,
  setPlayerAmbientType,
  playerAmbientColor,
  setPlayerAmbientColor,
  playerAmbientIntensity,
  setPlayerAmbientIntensity,
  playerAmbientBlur,
  setPlayerAmbientBlur,
  playerAmbientAudioReactive,
  setPlayerAmbientAudioReactive,
  playerAmbientAudioSensitivity,
  setPlayerAmbientAudioSensitivity,
  playerContextParams,
  setPlayerContextParams,
  favoritesSet,
  setFavoritesSet,
  loadFavoritesCache,
  toggleFavoriteInCache,
} = createRoot(() => {
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [dialogState, setDialogState] = createSignal<DialogState | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = createSignal(false);
  const [isFetchingInfo, setIsFetchingInfo] = createSignal(false);
  const [fetchingUrl, setFetchingUrl] = createSignal("");
  const [downloadHistory, setDownloadHistory] = createSignal<
    DownloadHistoryEntry[]
  >([]);
  const [favoritesSet, setFavoritesSet] = createSignal<Set<string>>(new Set());

  const [useAnimatedIcons, setUseAnimatedIcons] =
    createSignal(initialAnimState);
  const [sidebarHoverMode, setSidebarHoverMode] =
    createSignal(initialHoverState);
  const [alwaysShowSearchBar, setAlwaysShowSearchBar] = createSignal(
    getBool("alwaysShowSearchBar", false),
  );
  const [alwaysShowSortBar, setAlwaysShowSortBar] = createSignal(
    getBool("alwaysShowSortBar", false),
  );
  const [showFpsCounter, setShowFpsCounter] = createSignal(
    getBool("showFpsCounter", false),
  );
  const [thumbnailQuality, setThumbnailQuality] =
    createSignal<ThumbnailQuality>(
      (getStr("thumbnailQuality", "medium") as ThumbnailQuality) || "medium",
    );
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [isSortOpen, setIsSortOpen] = createSignal(false);
  const [globalSearchQuery, setGlobalSearchQuery] = createSignal("");
  const [appTheme, setAppTheme] = createSignal(initialTheme);
  const [appPalette, setAppPalette] = createSignal(initialPalette);
  const [designStyle, setDesignStyle] = createSignal<
    "neo-brutalism" | "claymorphism"
  >(initialStyle);

  const [concurrentDownloads, setConcurrentDownloads] = createSignal(
    getNum("concurrentDownloads", 3),
  );
  const [concurrentFragments, setConcurrentFragments] = createSignal(
    getNum("concurrentFragments", 1),
  );
  const [speedLimit, setSpeedLimit] = createSignal(getStr("speedLimit", ""));
  const [browserCookies, setBrowserCookies] = createSignal(
    getStr("browserCookies", "None"),
  );
  const [playerClient, setPlayerClient] = createSignal(
    getStr("playerClient", "tv_embedded,web_embedded"),
  );
  const [autoSubtitles, setAutoSubtitles] = createSignal(
    getBool("autoSubtitles", false),
  );
  const [removeSponsorBlock, setRemoveSponsorBlock] = createSignal(
    getBool("removeSponsorBlock", false),
  );

  const [isAiUnlocked, setIsAiUnlockedState] = createSignal(
    getBool("isAiUnlocked", false),
  );
  const setIsAiUnlocked = (val: boolean) => {
    setIsAiUnlockedState(val);
    if (isBrowser) {
      window.localStorage.setItem("isAiUnlocked", String(val));
    }
  };

  const [downloadType, setDownloadType] = createSignal(
    getStr("downloadType", "Video"),
  );
  const [dlSubtitles, setDlSubtitles] = createSignal(
    getBool("dlSubtitles", true),
  );
  const [liveFromStart, setLiveFromStart] = createSignal(
    getBool("liveFromStart", false),
  );

  const [forceSetup, setForceSetup] = createSignal(false);
  const [downloadUrl, setDownloadUrl] = createSignal("");
  const [downloadQuality, setDownloadQuality] = createSignal(
    getStr("downloadQuality", "1440p"),
  );

  const [defaultSortBy, setDefaultSortBy] = createSignal(
    getStr("defaultSortBy", "date"),
  );
  const [defaultSortDirection, setDefaultSortDirection] = createSignal<
    "asc" | "desc"
  >((getStr("defaultSortDirection", "desc") as "asc" | "desc") || "desc");
  const [randomizeOnLaunch, setRandomizeOnLaunch] = createSignal(
    getBool("randomizeOnLaunch", false),
  );
  const [launchRandomSeed, setLaunchRandomSeed] = createSignal(Date.now());

  const [homeSortBy, setHomeSortBy] = createSignal<string>(
    getBool("randomizeOnLaunch", false)
      ? "random"
      : getStr("defaultSortBy", "date"),
  );
  const [homeSortDirection, setHomeSortDirection] = createSignal<
    "asc" | "desc"
  >((getStr("defaultSortDirection", "desc") as "asc" | "desc") || "desc");
  const [homeRandomSeed, setHomeRandomSeed] = createSignal(Date.now());

  const [favSortBy, setFavSortBy] = createSignal<string>("date");
  const [favSortDirection, setFavSortDirection] = createSignal<"asc" | "desc">(
    "desc",
  );
  const [favRandomSeed, setFavRandomSeed] = createSignal(Date.now());

  const [playlistsSortBy, setPlaylistsSortBy] = createSignal<string>("date");
  const [playlistsSortDirection, setPlaylistsSortDirection] = createSignal<
    "asc" | "desc"
  >("desc");

  const [playlistVideosSortBy, setPlaylistVideosSortBy] =
    createSignal<string>("custom");
  const [playlistVideosSortDirection, setPlaylistVideosSortDirection] =
    createSignal<"asc" | "desc">("asc");
  const [playlistVideosRandomSeed, setPlaylistVideosRandomSeed] = createSignal(
    Date.now(),
  );
  const [activePlaylistDetail, setActivePlaylistDetail] = createSignal<
    any | null
  >(null);

  const [artistsSortBy, setArtistsSortBy] = createSignal<string>("name");
  const [artistsSortDirection, setArtistsSortDirection] = createSignal<
    "asc" | "desc"
  >("asc");

  const [artistVideosSortBy, setArtistVideosSortBy] =
    createSignal<string>("date");
  const [artistVideosSortDirection, setArtistVideosSortDirection] =
    createSignal<"asc" | "desc">("desc");
  const [artistVideosRandomSeed, setArtistVideosRandomSeed] = createSignal(
    Date.now(),
  );

  const [historySortBy, setHistorySortBy] = createSignal<string>("date");
  const [historySortDirection, setHistorySortDirection] = createSignal<
    "asc" | "desc"
  >("desc");

  const [tasks, setTasks] = createSignal<DownloadTask[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = createSignal(false);
  const [homeVideos, setHomeVideos] = createSignal<VideoEntry[]>([]);

  const [activeVideo, setActiveVideo] = createSignal<VideoEntry | null>(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [volume, setVolume] = createSignal(1);
  const [isMuted, setIsMuted] = createSignal(false);
  const [playbackRate, setPlaybackRate] = createSignal(1.0);
  const [isLooping, setIsLooping] = createSignal(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = createSignal(false);
  const [playerQueue, setPlayerQueue] = createSignal<VideoEntry[]>([]);
  const [miniplayerDismissed, setMiniplayerDismissed] = createSignal(false);
  const [theaterMode, setTheaterMode] = createSignal(false);
  const [playerAmbientMode, setPlayerAmbientMode] = createSignal(
    getBool("playerAmbientMode", true),
  );
  const [playerAmbientType, setPlayerAmbientType] = createSignal<
    "dynamic" | "static"
  >(
    (getStr("playerAmbientType", "dynamic") as "dynamic" | "static") ||
      "dynamic",
  );
  const [playerAmbientColor, setPlayerAmbientColor] = createSignal(
    getStr("playerAmbientColor", "#f25c54"),
  );
  const [playerAmbientIntensity, setPlayerAmbientIntensity] = createSignal(
    getNum("playerAmbientIntensity", 85),
  );
  const [playerAmbientBlur, setPlayerAmbientBlur] = createSignal(
    getNum("playerAmbientBlur", 60),
  );
  const [playerAmbientAudioReactive, setPlayerAmbientAudioReactive] =
    createSignal(getBool("playerAmbientAudioReactive", false));
  const [playerAmbientAudioSensitivity, setPlayerAmbientAudioSensitivity] =
    createSignal(getNum("playerAmbientAudioSensitivity", 100));
  const [playerContextParams, setPlayerContextParams] = createSignal<{
    context?: string;
    id?: string;
    name?: string;
  }>({});

  return {
    toasts,
    setToasts,
    dialogState,
    setDialogState,
    showShortcutsModal,
    setShowShortcutsModal,
    useAnimatedIcons,
    setUseAnimatedIcons,
    sidebarHoverMode,
    setSidebarHoverMode,
    alwaysShowSearchBar,
    setAlwaysShowSearchBar,
    alwaysShowSortBar,
    setAlwaysShowSortBar,
    showFpsCounter,
    setShowFpsCounter,
    thumbnailQuality,
    setThumbnailQuality,
    isSearchOpen,
    setIsSearchOpen,
    isSortOpen,
    setIsSortOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    appTheme,
    setAppTheme,
    appPalette,
    setAppPalette,
    designStyle,
    setDesignStyle,
    isAiUnlocked,
    setIsAiUnlocked,
    concurrentDownloads,
    setConcurrentDownloads,
    concurrentFragments,
    setConcurrentFragments,
    speedLimit,
    setSpeedLimit,
    browserCookies,
    setBrowserCookies,
    playerClient,
    setPlayerClient,
    autoSubtitles,
    setAutoSubtitles,
    removeSponsorBlock,
    setRemoveSponsorBlock,
    downloadType,
    setDownloadType,
    dlSubtitles,
    setDlSubtitles,
    liveFromStart,
    setLiveFromStart,
    forceSetup,
    setForceSetup,
    downloadUrl,
    setDownloadUrl,
    downloadQuality,
    setDownloadQuality,
    defaultSortBy,
    setDefaultSortBy,
    defaultSortDirection,
    setDefaultSortDirection,
    randomizeOnLaunch,
    setRandomizeOnLaunch,
    launchRandomSeed,
    setLaunchRandomSeed,
    homeSortBy,
    setHomeSortBy,
    homeSortDirection,
    setHomeSortDirection,
    homeRandomSeed,
    setHomeRandomSeed,
    favSortBy,
    setFavSortBy,
    favSortDirection,
    setFavSortDirection,
    favRandomSeed,
    setFavRandomSeed,
    playlistsSortBy,
    setPlaylistsSortBy,
    playlistsSortDirection,
    setPlaylistsSortDirection,
    playlistVideosSortBy,
    setPlaylistVideosSortBy,
    playlistVideosSortDirection,
    setPlaylistVideosSortDirection,
    playlistVideosRandomSeed,
    setPlaylistVideosRandomSeed,
    activePlaylistDetail,
    setActivePlaylistDetail,
    artistsSortBy,
    setArtistsSortBy,
    artistsSortDirection,
    setArtistsSortDirection,
    artistVideosSortBy,
    setArtistVideosSortBy,
    artistVideosSortDirection,
    setArtistVideosSortDirection,
    artistVideosRandomSeed,
    setArtistVideosRandomSeed,
    historySortBy,
    setHistorySortBy,
    historySortDirection,
    setHistorySortDirection,
    tasks,
    setTasks,
    isProcessingQueue,
    setIsProcessingQueue,
    isFetchingInfo,
    setIsFetchingInfo,
    fetchingUrl,
    setFetchingUrl,
    downloadHistory,
    setDownloadHistory,
    homeVideos,
    setHomeVideos,
    activeVideo,
    setActiveVideo,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    playbackRate,
    setPlaybackRate,
    isLooping,
    setIsLooping,
    subtitlesEnabled,
    setSubtitlesEnabled,
    playerQueue,
    setPlayerQueue,
    miniplayerDismissed,
    setMiniplayerDismissed,
    theaterMode,
    setTheaterMode,
    playerAmbientMode,
    setPlayerAmbientMode,
    playerAmbientType,
    setPlayerAmbientType,
    playerAmbientColor,
    setPlayerAmbientColor,
    playerAmbientIntensity,
    setPlayerAmbientIntensity,
    playerAmbientBlur,
    setPlayerAmbientBlur,
    playerAmbientAudioReactive,
    setPlayerAmbientAudioReactive,
    playerAmbientAudioSensitivity,
    setPlayerAmbientAudioSensitivity,
    playerContextParams,
    setPlayerContextParams,
    favoritesSet,
    setFavoritesSet,
    loadFavoritesCache: async () => {
      try {
        const favs = await invoke<VideoEntry[]>("get_favorites");
        setFavoritesSet(new Set(favs.map((f) => f.id)));
      } catch {
        // Fallback gracefully
      }
    },
    toggleFavoriteInCache: (id: string, isFav: boolean) => {
      setFavoritesSet((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(id);
        else next.delete(id);
        return next;
      });
    },
  };
});

export function getThumbnailUrl(
  video:
    | { id?: string; thumbnail_path?: string; lq_thumbnail_path?: string }
    | null
    | undefined,
  highRes: boolean = false,
): string {
  if (!video) return "";
  const quality = thumbnailQuality ? thumbnailQuality() : "medium";
  const isLq =
    !highRes && quality !== "high" && Boolean(video.lq_thumbnail_path);
  if (video.id) {
    return `http://127.0.0.1:1422/Thumbnails/${video.id}${isLq ? "_lq" : ""}.jpg`;
  }
  const path =
    isLq && video.lq_thumbnail_path
      ? video.lq_thumbnail_path
      : video.thumbnail_path;
  if (!path) return "";
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

let globalVideoRef: HTMLVideoElement | null = null;

export const setGlobalVideoRef = (el: HTMLVideoElement | null) => {
  globalVideoRef = el;
};

export const getGlobalVideoRef = () => globalVideoRef;

export const toggleGlobalPlay = () => {
  if (globalVideoRef) {
    if (globalVideoRef.paused) {
      globalVideoRef
        .play()
        .then(() => {
          setIsPlaying(true);
          invoke("update_playback_status", { playing: true }).catch(() => {});
        })
        .catch(() => {
          setIsPlaying(false);
        });
    } else {
      globalVideoRef.pause();
      setIsPlaying(false);
      invoke("update_playback_status", { playing: false }).catch(() => {});
    }
  } else {
    setIsPlaying(!isPlaying());
  }
};

export const pauseGlobalPlay = () => {
  if (globalVideoRef) {
    globalVideoRef.pause();
    setIsPlaying(false);
  }
};

export const resumeGlobalPlay = () => {
  if (globalVideoRef) {
    globalVideoRef
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  }
};

export const seekGlobalPlay = (time: number) => {
  if (globalVideoRef) {
    globalVideoRef.currentTime = time;
    setCurrentTime(time);
  }
};

export const setGlobalVolume = (val: number) => {
  setVolume(val);
  if (globalVideoRef) {
    globalVideoRef.volume = val;
    if (val > 0 && isMuted()) {
      globalVideoRef.muted = false;
      setIsMuted(false);
    } else if (val === 0 && !isMuted()) {
      globalVideoRef.muted = true;
      setIsMuted(true);
    }
  }
};

export const toggleGlobalMute = () => {
  if (globalVideoRef) {
    globalVideoRef.muted = !globalVideoRef.muted;
    setIsMuted(globalVideoRef.muted);
    if (!globalVideoRef.muted && volume() === 0) {
      setVolume(0.5);
      globalVideoRef.volume = 0.5;
    }
  }
};

export const toggleGlobalPiP = async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (globalVideoRef) {
      await globalVideoRef.requestPictureInPicture();
    }
  } catch (err) {
    console.error("PiP error:", err);
  }
};

export const closeGlobalMiniplayer = () => {
  if (globalVideoRef) {
    try {
      globalVideoRef.pause();
      globalVideoRef.removeAttribute("src");
      globalVideoRef.load();
    } catch {}
    setGlobalVideoRef(null);
  }
  pauseGlobalPlay();
  setActiveVideo(null);
  setMiniplayerDismissed(true);
  invoke("update_playback_status", { playing: false }).catch(() => {});
};

export const getSystemClipboardText = async (): Promise<string> => {
  try {
    const text = await invoke<string>("get_clipboard_text");
    if (text) return text;
  } catch {}
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      return await navigator.clipboard.readText();
    }
  } catch {}
  return "";
};

export const setSystemClipboardText = async (
  text: string,
): Promise<boolean> => {
  try {
    await invoke("set_clipboard_text", { text });
    return true;
  } catch {}
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
};

export const addToast = (
  message: string,
  type: "info" | "error" | "success" = "info",
) => {
  const id = Math.random().toString(36).substring(2, 9);
  setToasts((prev) => [...prev, { id, message, type }]);

  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 4500);
};

export const showConfirmDialog = (
  message: string,
  title: string,
  type: "info" | "warning" | "error" = "info",
): Promise<boolean> => {
  return new Promise((resolve) => {
    setDialogState({ title, message, type, resolve });
  });
};

export const closeDialog = (result: boolean) => {
  const state = dialogState();
  if (state) {
    state.resolve(result);
    setDialogState(null);
  }
};

export const toggleAnimatedIcons = (val: boolean) => {
  setUseAnimatedIcons(val);
  if (isBrowser)
    window.localStorage.setItem("useAnimatedIcons", val.toString());
};

export const toggleSidebarHoverMode = (val: boolean) => {
  setSidebarHoverMode(val);
  if (isBrowser)
    window.localStorage.setItem("sidebarHoverMode", val.toString());
};

export const toggleAlwaysShowSearchBar = (val: boolean) => {
  setAlwaysShowSearchBar(val);
  if (isBrowser)
    window.localStorage.setItem("alwaysShowSearchBar", val.toString());
};

export const toggleAlwaysShowSortBar = (val: boolean) => {
  setAlwaysShowSortBar(val);
  if (isBrowser)
    window.localStorage.setItem("alwaysShowSortBar", val.toString());
};

export const toggleShowFpsCounter = (val: boolean) => {
  setShowFpsCounter(val);
  if (isBrowser) window.localStorage.setItem("showFpsCounter", val.toString());
};

export const updateThumbnailQuality = (val: ThumbnailQuality) => {
  setThumbnailQuality(val);
  if (isBrowser) {
    window.localStorage.setItem("thumbnailQuality", val);
  }
  try {
    invoke("sync_thumbnail_cache", { quality: val }).catch(() => {});
  } catch {}
};

export const toggleAppTheme = (theme: "light" | "dark") => {
  setAppTheme(theme);
  if (isBrowser) {
    window.localStorage.setItem("appTheme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
};

export const toggleAppPalette = (palette: string) => {
  setAppPalette(palette);
  if (isBrowser) {
    window.localStorage.setItem("appPalette", palette);
    document.documentElement.setAttribute("data-palette", palette);
  }
};

export const toggleDesignStyle = (style: "neo-brutalism" | "claymorphism") => {
  setDesignStyle(style);
  if (isBrowser) {
    window.localStorage.setItem("designStyle", style);
    document.documentElement.setAttribute("data-style", style);
  }
};

export const togglePlayerAmbientMode = (val?: boolean) => {
  const next = val !== undefined ? val : !playerAmbientMode();
  setPlayerAmbientMode(next);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientMode", String(next));
  }
};

export const togglePlayerAmbientType = (type: "dynamic" | "static") => {
  setPlayerAmbientType(type);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientType", type);
  }
};

export const updatePlayerAmbientColor = (color: string) => {
  setPlayerAmbientColor(color);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientColor", color);
  }
};

export const updatePlayerAmbientIntensity = (val: number) => {
  setPlayerAmbientIntensity(val);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientIntensity", val.toString());
  }
};

export const updatePlayerAmbientBlur = (val: number) => {
  setPlayerAmbientBlur(val);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientBlur", val.toString());
  }
};

export const togglePlayerAmbientAudioReactive = (val?: boolean) => {
  const next =
    val !== undefined ? val : !playerAmbientAudioReactive();
  setPlayerAmbientAudioReactive(next);
  if (isBrowser) {
    window.localStorage.setItem("playerAmbientAudioReactive", String(next));
  }
};

export const updatePlayerAmbientAudioSensitivity = (val: number) => {
  setPlayerAmbientAudioSensitivity(val);
  if (isBrowser) {
    window.localStorage.setItem(
      "playerAmbientAudioSensitivity",
      val.toString(),
    );
  }
};

export const updateConcurrentDownloads = (val: number) => {
  setConcurrentDownloads(val);
  if (isBrowser)
    window.localStorage.setItem("concurrentDownloads", val.toString());
  processQueue();
};

export const updateConcurrentFragments = (val: number) => {
  setConcurrentFragments(val);
  if (isBrowser)
    window.localStorage.setItem("concurrentFragments", val.toString());
};

export const updateSpeedLimit = (val: string) => {
  setSpeedLimit(val);
  if (isBrowser) window.localStorage.setItem("speedLimit", val);
};

export const updateBrowserCookies = (val: string) => {
  setBrowserCookies(val);
  if (isBrowser) window.localStorage.setItem("browserCookies", val);
};

export const updatePlayerClient = (val: string) => {
  setPlayerClient(val);
  if (isBrowser) window.localStorage.setItem("playerClient", val);
};

export const toggleAutoSubtitles = (val: boolean) => {
  setAutoSubtitles(val);
  if (isBrowser) window.localStorage.setItem("autoSubtitles", val.toString());
};

export const toggleRemoveSponsorBlock = (val: boolean) => {
  setRemoveSponsorBlock(val);
  if (isBrowser)
    window.localStorage.setItem("removeSponsorBlock", val.toString());
};

export const updateDownloadType = (val: string) => {
  setDownloadType(val);
  if (isBrowser) window.localStorage.setItem("downloadType", val);
};

export const toggleDlSubtitles = (val: boolean) => {
  setDlSubtitles(val);
  if (isBrowser) window.localStorage.setItem("dlSubtitles", val.toString());
};

export const toggleLiveFromStart = (val: boolean) => {
  setLiveFromStart(val);
  if (isBrowser) window.localStorage.setItem("liveFromStart", val.toString());
};

export const updateDownloadQuality = (val: string) => {
  setDownloadQuality(val);
  if (isBrowser) window.localStorage.setItem("downloadQuality", val);
};

export const updateDefaultSortBy = (val: string) => {
  setDefaultSortBy(val);
  if (isBrowser) window.localStorage.setItem("defaultSortBy", val);
};

export const updateDefaultSortDirection = (val: "asc" | "desc") => {
  setDefaultSortDirection(val);
  if (isBrowser) window.localStorage.setItem("defaultSortDirection", val);
};

export const toggleRandomizeOnLaunch = (val: boolean) => {
  setRandomizeOnLaunch(val);
  if (isBrowser)
    window.localStorage.setItem("randomizeOnLaunch", val.toString());
};

export const refreshLaunchRandomSeed = () => {
  setLaunchRandomSeed(Date.now() + Math.random());
};

export const updateTask = (id: string, updates: Partial<DownloadTask>) => {
  setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
};

export const removeTaskFromQueue = (id: string) => {
  setTasks((prev) => prev.filter((t) => t.id !== id));
};

export const cancelDownload = (id: string) => {
  updateTask(id, {
    status: "cancelled",
    phase: "Cancelled",
    logs: ["Download cancelled by user."],
  });
  processQueue();
};

export const retryDownload = (id: string) => {
  updateTask(id, {
    status: "pending",
    progress: 0,
    phase: "Queued",
    logs: ["Retrying download..."],
  });
  processQueue();
};

export const clearDownloadHistory = () => {
  setTasks((prev) =>
    prev.filter(
      (t) =>
        t.status !== "done" && t.status !== "error" && t.status !== "cancelled",
    ),
  );
};

export const fetchDownloadHistory = async () => {
  try {
    const records = await invoke<DownloadHistoryEntry[]>(
      "get_download_history",
    );
    if (Array.isArray(records)) {
      setDownloadHistory(records);
    }
  } catch (err) {
    console.error("Failed to fetch download history:", err);
  }
};

export const clearDatabaseHistory = async () => {
  try {
    await invoke("clear_download_history_db");
    setDownloadHistory([]);
    addToast("Download history cleared", "success");
  } catch (err) {
    console.error("Failed to clear download history:", err);
    addToast(`Failed to clear history: ${err}`, "error");
  }
};

export const deleteHistoryItem = async (id: string) => {
  try {
    await invoke("delete_download_history_item", { id });
    setDownloadHistory((prev) => prev.filter((item) => item.id !== id));
    addToast("History record removed", "success");
  } catch (err) {
    console.error("Failed to delete history item:", err);
    addToast(`Failed to delete record: ${err}`, "error");
  }
};

const processQueue = () => {
  const allTasks = tasks();
  const activeCount = allTasks.filter((t) => t.status === "downloading").length;
  const pendingTasks = allTasks.filter((t) => t.status === "pending");

  if (activeCount >= concurrentDownloads() || pendingTasks.length === 0) {
    setIsProcessingQueue(activeCount > 0);
    if (activeCount === 0 && pendingTasks.length === 0) {
      invoke<VideoEntry[]>("get_downloaded_videos")
        .then(setHomeVideos)
        .catch(console.error);
    }
    return;
  }

  setIsProcessingQueue(true);
  const slotsAvailable = concurrentDownloads() - activeCount;
  const tasksToStart = pendingTasks.slice(0, slotsAvailable);

  tasksToStart.forEach((task) => {
    executeDownload(task);
  });
};

const executeDownload = async (task: DownloadTask) => {
  updateTask(task.id, {
    status: "downloading",
    phase: "Initializing Engine...",
    logs: ["Initializing engine..."],
  });

  const unlisten = await listen<string>(
    `download-progress-${task.id}`,
    (event) => {
      const log = event.payload;

      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== task.id) return t;

          let newProgress = t.progress;
          let newPhase = t.phase;
          let newSpeed = t.speed;
          let newEta = t.eta;

          const cleanLog = log.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

          if (cleanLog.includes("[download]") && cleanLog.includes("%")) {
            const match = cleanLog.match(/\[download\]\s*([\d\.]+)%/);
            if (match) {
              newProgress = parseFloat(match[1]);
              newPhase = "Downloading";
            }
            const speedMatch = cleanLog.match(
              /at\s+([^\s]+(?:[kMG]?i?B\/s|B\/s))/,
            );
            if (speedMatch) {
              newSpeed = speedMatch[1];
            }
            const etaMatch = cleanLog.match(/ETA\s+([\d:]+)/);
            if (etaMatch) {
              newEta = etaMatch[1];
            }
          } else if (
            cleanLog.includes("Attempting encoder:") ||
            cleanLog.includes("Starting FFmpeg")
          ) {
            newPhase = "Transcoding (Hardware)";
            newProgress = 100;
          } else if (cleanLog.includes("Success! Transcoded")) {
            newPhase = "Finalizing...";
          }

          return {
            ...t,
            logs: [...t.logs, log],
            progress: newProgress,
            phase: newPhase,
            speed: newSpeed,
            eta: newEta,
          };
        }),
      );
    },
  );

  try {
    await invoke("download_video", {
      url: `https://www.youtube.com/watch?v=${task.id}`,
      metadata: task.metadata,
      quality: downloadQuality(),
      dlType: task.dlType || downloadType(),
      cookies: browserCookies(),
      speedLimit: speedLimit(),
      concurrentFragments: concurrentFragments(),
      autoSubs: autoSubtitles(),
      dlSubs: dlSubtitles(),
      sponsorblock: removeSponsorBlock(),
      liveFromStart: liveFromStart(),
      playerClient: playerClient(),
    });

    updateTask(task.id, {
      status: "done",
      phase: "Complete",
      progress: 100,
    });

    if (task.targetPlaylistId) {
      await invoke("add_video_to_playlist", {
        playlistId: task.targetPlaylistId,
        videoId: task.id,
      });
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, logs: [...t.logs, "Download complete!"] }
          : t,
      ),
    );
  } catch (e) {
    updateTask(task.id, { status: "error", phase: "Failed" });
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, logs: [...t.logs, `ERROR: ${e}`] } : t,
      ),
    );
  } finally {
    unlisten();
    fetchDownloadHistory();
    processQueue();
  }
};

export const startDownloadQueue = async () => {
  const targetUrl = downloadUrl();
  if (!targetUrl) return;

  setIsProcessingQueue(true);
  setIsFetchingInfo(true);
  setFetchingUrl(targetUrl);
  setDownloadUrl("");

  try {
    const response = await invoke<VideoMetadataResponse>("get_video_metadata", {
      url: targetUrl,
      playerClient: playerClient(),
    });

    let targetPlaylistId: string | undefined = undefined;
    if (response.playlist_title) {
      try {
        const newPlaylist = await invoke<{ id: string; name: string }>(
          "create_playlist",
          { name: response.playlist_title },
        );
        targetPlaylistId = newPlaylist.id;
        addToast(`Playlist "${response.playlist_title}" created`, "success");
      } catch (err) {
        console.error("Failed to create playlist:", err);
      }
    }

    const currentDlType = downloadType();
    const newTasks: DownloadTask[] = response.entries.map((meta) => ({
      id: meta.id,
      title: meta.title,
      channel: meta.channel,
      metadata: meta,
      status: "pending",
      logs: [],
      showLogs: false,
      progress: 0,
      phase: "Queued",
      url: targetUrl,
      dlType: currentDlType,
      targetPlaylistId,
    }));

    setTasks((prev) => [...prev, ...newTasks]);
    processQueue();
  } catch (e) {
    console.error("Queue Initialization Error:", e);
    addToast(`Failed to initialize download: ${e}`, "error");
    setIsProcessingQueue(false);
  } finally {
    setIsFetchingInfo(false);
    setFetchingUrl("");
  }
};
