import {
  currentTime,
  duration,
  isPlaying,
  setCurrentTime,
  setDuration,
  setIsPlaying,
  setGlobalVideoRef,
} from "../store";
import { invoke } from "@tauri-apps/api/core";

let sharedVideoElement: HTMLVideoElement | null = null;
let stashContainer: HTMLElement | null = null;
let currentLoadedId: string | null = null;

type EventCallback = (e: Event) => void;
const listeners: Record<string, Set<EventCallback>> = {
  timeupdate: new Set(),
  ended: new Set(),
  play: new Set(),
  pause: new Set(),
  seeked: new Set(),
  loadedmetadata: new Set(),
  canplay: new Set(),
  progress: new Set(),
};

export function onSharedVideoEvent(
  event: string,
  cb: EventCallback,
): () => void {
  if (!listeners[event]) {
    listeners[event] = new Set();
  }
  listeners[event].add(cb);
  return () => {
    listeners[event]?.delete(cb);
  };
}

export function getPersistentVideoStash(): HTMLElement {
  if (typeof document === "undefined") return null as any;
  if (!stashContainer) {
    let el = document.getElementById("persistent-video-stash");
    if (!el) {
      el = document.createElement("div");
      el.id = "persistent-video-stash";
      el.style.position = "fixed";
      el.style.top = "-9999px";
      el.style.left = "-9999px";
      el.style.width = "1px";
      el.style.height = "1px";
      el.style.overflow = "hidden";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      el.style.zIndex = "-1";
      document.body.appendChild(el);
    }
    stashContainer = el;
  }
  return stashContainer;
}

export function getSharedVideoElement(): HTMLVideoElement {
  if (typeof document === "undefined") return null as any;
  if (!sharedVideoElement) {
    const v = document.createElement("video");
    v.id = "shared-active-video";
    v.crossOrigin = "anonymous";
    v.preload = "auto";
    v.autoplay = true;
    (v as any).playsInline = true;

    v.addEventListener("timeupdate", (e) => {
      setCurrentTime(v.currentTime);
      listeners["timeupdate"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("ended", (e) => {
      listeners["ended"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("play", (e) => {
      setIsPlaying(true);
      invoke("update_playback_status", { playing: true }).catch(() => {});
      listeners["play"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("pause", (e) => {
      if (!v.seeking) {
        setIsPlaying(false);
        invoke("update_playback_status", { playing: false }).catch(() => {});
      }
      listeners["pause"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("seeked", (e) => {
      listeners["seeked"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("loadedmetadata", (e) => {
      if (v.duration && !isNaN(v.duration)) {
        setDuration(v.duration);
      }
      listeners["loadedmetadata"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("canplay", (e) => {
      listeners["canplay"]?.forEach((fn) => fn(e));
    });

    v.addEventListener("progress", (e) => {
      listeners["progress"]?.forEach((fn) => fn(e));
    });

    sharedVideoElement = v;
    setGlobalVideoRef(v);

    const stash = getPersistentVideoStash();
    if (stash && !stash.contains(v)) {
      stash.appendChild(v);
    }
  }
  return sharedVideoElement;
}

export function attachSharedVideoToHost(
  host: HTMLElement | undefined,
  className?: string,
): HTMLVideoElement | undefined {
  if (!host) return undefined;
  const v = getSharedVideoElement();
  if (!v) return undefined;

  if (className) {
    v.className = className;
  }
  if (v.parentElement !== host) {
    if (host.firstChild) {
      host.insertBefore(v, host.firstChild);
    } else {
      host.appendChild(v);
    }
  }
  setGlobalVideoRef(v);
  return v;
}

export function stashSharedVideo(): void {
  if (!sharedVideoElement) return;
  const stash = getPersistentVideoStash();
  if (stash && sharedVideoElement.parentElement !== stash) {
    stash.appendChild(sharedVideoElement);
  }
}

export function getCurrentLoadedVideoId(): string | null {
  return currentLoadedId;
}

export function syncSharedVideoSource(
  videoId: string,
  extension: string = "mp4",
): HTMLVideoElement {
  const v = getSharedVideoElement();
  const targetSrc = `http://127.0.0.1:1422/Videos/${videoId}.${extension}`;

  if (currentLoadedId === videoId && v.src === targetSrc) {
    return v;
  }

  currentLoadedId = videoId;
  v.src = targetSrc;
  v.load();
  return v;
}

export function resetSharedVideo(): void {
  if (sharedVideoElement) {
    try {
      sharedVideoElement.pause();
      sharedVideoElement.removeAttribute("src");
      sharedVideoElement.load();
    } catch {}
    stashSharedVideo();
  }
  currentLoadedId = null;
  setGlobalVideoRef(null);
}
