/**
 * ViveStream PO Token Companion - Injected MAIN World Script
 * Hooks into YouTube runtime (ytcfg, network requests, and performance resource buffer).
 */
(function () {
  if (window.__vivestream_injected__) return;
  window.__vivestream_injected__ = true;

  let lastDispatchedToken = null;

  function getCurrentVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("v")) return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" && parts[1]) return parts[1];
      if (parts[0] === "embed" && parts[1]) return parts[1];
    } catch (_) {}
    return null;
  }

  function getVisitorData() {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === "function") {
        const v = window.ytcfg.get("VISITOR_DATA");
        if (v) return v;
      }
      if (window.ytcfg?.data_?.INNERTUBE_CONTEXT?.client?.visitorData) {
        return window.ytcfg.data_.INNERTUBE_CONTEXT.client.visitorData;
      }
    } catch (_) {}
    return null;
  }

  function notifyToken(token, source) {
    if (!token || typeof token !== "string") return;
    const clean = token.trim();
    if (clean.length < 16) return;
    if (clean === lastDispatchedToken) return;

    lastDispatchedToken = clean;
    const videoId = getCurrentVideoId();
    const visitorData = getVisitorData();

    window.postMessage(
      {
        type: "VIVESTREAM_PO_TOKEN_EXTRACTED",
        token: clean,
        visitorData,
        videoId,
        source: source || "main_world",
        timestamp: Date.now(),
      },
      "*"
    );

    console.log(
      `%c[ViveStream Companion]%c Intercepted PO Token (${clean.length} chars) via ${source}`,
      "background: #00ffcc; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
      "color: #00ffcc; font-weight: bold;"
    );
  }

  // 1. Scan Performance Resource Timing for active stream chunks and stats beacons
  function scanResourceTiming() {
    try {
      const entries = performance.getEntriesByType("resource");
      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i].name;
        if (name && (name.includes("googlevideo.com") || name.includes("/videoplayback") || name.includes("/api/stats/"))) {
          const url = new URL(name);
          const pot = url.searchParams.get("pot") || url.searchParams.get("po_token") || url.searchParams.get("cpo");
          if (pot && pot.length >= 16) {
            notifyToken(pot, name.includes("/api/stats/") ? "performance_stats_beacon" : "performance_buffer_chunk");
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  // Scan immediately and on intervals
  scanResourceTiming();
  const scanInterval = setInterval(scanResourceTiming, 2000);

  // 2. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (resource, init) {
    try {
      const urlStr = typeof resource === "string" ? resource : resource?.url;
      if (urlStr) {
        const url = new URL(urlStr, window.location.origin);
        const pot = url.searchParams.get("pot") || url.searchParams.get("po_token") || url.searchParams.get("cpo");
        if (pot && pot.length >= 16) {
          notifyToken(pot, "fetch_url_param");
        }
      }

      if (init && init.body && typeof init.body === "string") {
        const match = init.body.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
        if (match && match[1]) notifyToken(match[1], "fetch_payload");
      }
    } catch (_) {}

    return originalFetch.apply(this, arguments);
  };

  // 3. Hook XMLHttpRequest
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (body && typeof body === "string") {
        const match = body.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
        if (match && match[1]) notifyToken(match[1], "xhr_payload");
      }
    } catch (_) {}
    return originalSend.apply(this, arguments);
  };

  // 4. Check window.ytcfg and movie_player
  function checkYtcfgAndPlayer() {
    try {
      if (window.ytcfg) {
        const tok =
          (typeof window.ytcfg.get === "function" ? window.ytcfg.get("PO_TOKEN") : null) ||
          window.ytcfg.data_?.PO_TOKEN ||
          window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken;
        if (tok && typeof tok === "string" && tok.length >= 16) {
          notifyToken(tok, "ytcfg");
          return;
        }
      }

      const player = document.getElementById("movie_player");
      if (player && typeof player.getPlayerResponse === "function") {
        const resp = player.getPlayerResponse();
        const tracking = resp?.playbackTracking || {};
        const trackingUrls = [
          tracking.videostatsPlaybackUrl?.baseUrl,
          tracking.videostatsWatchtimeUrl?.baseUrl,
          tracking.qoeUrl?.baseUrl,
          tracking.ptrackingUrl?.baseUrl,
          tracking.atrUrl?.baseUrl,
        ].filter(Boolean);

        for (const trackUrl of trackingUrls) {
          try {
            const parsed = new URL(trackUrl);
            const pot = parsed.searchParams.get("pot") || parsed.searchParams.get("po_token") || parsed.searchParams.get("cpo");
            if (pot && pot.length >= 16) {
              notifyToken(pot, `player_tracking_${parsed.pathname.split("/").pop()}`);
              return;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  checkYtcfgAndPlayer();
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(scanResourceTiming, 500);
    setTimeout(checkYtcfgAndPlayer, 1000);
  });
})();
