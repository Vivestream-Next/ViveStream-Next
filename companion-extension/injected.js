/**
 * ViveStream PO Token Companion - Injected MAIN World Script
 * Hooks into YouTube runtime (ytcfg and network requests) to capture valid BotGuard PO tokens.
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
        source: source || "unknown",
        timestamp: Date.now(),
      },
      "*"
    );

    console.info(
      `[ViveStream Companion] Captured PO Token (${clean.length} chars) from ${source} for video: ${videoId || "none"}`
    );
  }

  function inspectObjectForPoToken(obj) {
    if (!obj || typeof obj !== "object") return;
    try {
      // Direct paths
      const direct =
        obj.poToken ||
        obj.po_token ||
        obj.context?.serviceIntegrityDimensions?.poToken ||
        obj.serviceIntegrityDimensions?.poToken ||
        obj.attestationRequest?.poToken ||
        obj.playbackContext?.contentPlaybackContext?.serviceIntegrityDimensions?.poToken;

      if (direct && typeof direct === "string") {
        notifyToken(direct, "innertube_context");
        return;
      }

      // Recursive scan for serviceIntegrityDimensions
      const str = JSON.stringify(obj);
      const match = str.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
      if (match && match[1]) {
        notifyToken(match[1], "payload_json");
      }
    } catch (_) {}
  }

  function inspectUrlForPoToken(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return;
    try {
      const url = new URL(urlStr, window.location.origin);
      const pot = url.searchParams.get("pot") || url.searchParams.get("po_token");
      if (pot) {
        notifyToken(pot, "url_param");
      }
    } catch (_) {}
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (resource, init) {
    try {
      const url = typeof resource === "string" ? resource : resource?.url;
      inspectUrlForPoToken(url);

      if (init && init.body) {
        if (typeof init.body === "string") {
          try {
            inspectObjectForPoToken(JSON.parse(init.body));
          } catch (_) {
            const match = init.body.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
            if (match && match[1]) notifyToken(match[1], "fetch_body_raw");
          }
        }
      }
    } catch (_) {}

    return originalFetch.apply(this, arguments);
  };

  // 2. Hook XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._vs_url = url;
    inspectUrlForPoToken(url);
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (body && typeof body === "string") {
      try {
        inspectObjectForPoToken(JSON.parse(body));
      } catch (_) {
        const match = body.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
        if (match && match[1]) notifyToken(match[1], "xhr_body_raw");
      }
    }
    return originalSend.apply(this, arguments);
  };

  // 3. Scan window.ytcfg
  function checkYtcfg() {
    try {
      if (window.ytcfg) {
        const tok =
          (typeof window.ytcfg.get === "function" ? window.ytcfg.get("PO_TOKEN") : null) ||
          window.ytcfg.data_?.PO_TOKEN ||
          window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken ||
          window.ytcfg.data_?.EXPERIMENT_FLAGS?.web_po_token;

        if (tok && typeof tok === "string" && tok.length >= 16) {
          notifyToken(tok, "ytcfg");
        }
      }
    } catch (_) {}
  }

  // Initial and periodic checks
  checkYtcfg();
  const pollInterval = setInterval(checkYtcfg, 1000);
  setTimeout(() => clearInterval(pollInterval), 20000);

  // Check on YouTube internal SPA navigation
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(checkYtcfg, 500);
    setTimeout(checkYtcfg, 2000);
  });
})();
