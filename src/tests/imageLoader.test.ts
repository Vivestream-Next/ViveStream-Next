import { describe, it, expect, beforeEach } from "vitest";
import {
  isImageDecoded,
  markImageDecoded,
  isImageFailed,
  markImageFailed,
  preloadImage,
  preloadImages,
  clearImageCache,
} from "../utils/imageLoader";
import { getThumbnailUrl, VideoEntry } from "../store";

describe("Image Loader & Pre-caching System", () => {
  beforeEach(() => {
    clearImageCache();
  });

  it("correctly tracks decoded images in memory cache", () => {
    expect(isImageDecoded("http://asset.localhost/thumb1.jpg")).toBe(false);
    markImageDecoded("http://asset.localhost/thumb1.jpg");
    expect(isImageDecoded("http://asset.localhost/thumb1.jpg")).toBe(true);
    expect(isImageDecoded("http://asset.localhost/thumb2.jpg")).toBe(false);
  });

  it("correctly memoizes failed image loads to prevent retry storms", () => {
    expect(isImageFailed("http://127.0.0.1:1422/Avatars/Unknown.jpg")).toBe(
      false,
    );
    markImageFailed("http://127.0.0.1:1422/Avatars/Unknown.jpg");
    expect(isImageFailed("http://127.0.0.1:1422/Avatars/Unknown.jpg")).toBe(
      true,
    );
    expect(isImageFailed("http://127.0.0.1:1422/Avatars/Known.jpg")).toBe(
      false,
    );
  });

  it("clears all cached and failed status when clearImageCache is invoked", () => {
    markImageDecoded("http://asset.localhost/thumb.jpg");
    markImageFailed("http://asset.localhost/avatar.jpg");
    expect(isImageDecoded("http://asset.localhost/thumb.jpg")).toBe(true);
    expect(isImageFailed("http://asset.localhost/avatar.jpg")).toBe(true);

    clearImageCache();
    expect(isImageDecoded("http://asset.localhost/thumb.jpg")).toBe(false);
    expect(isImageFailed("http://asset.localhost/avatar.jpg")).toBe(false);
  });

  it("resolves quickly for empty or already cached URLs in preloadImage", async () => {
    const resEmpty = await preloadImage("");
    expect(resEmpty).toBe(true);

    markImageDecoded("http://asset.localhost/cached.jpg");
    const resCached = await preloadImage("http://asset.localhost/cached.jpg");
    expect(resCached).toBe(true);
  });

  it("safely handles preloadImages with empty or invalid arrays", () => {
    expect(() => preloadImages([])).not.toThrow();
    expect(() => preloadImages([""])).not.toThrow();
  });

  it("correctly chooses low quality thumbnail when available for fast loading", () => {
    const videoWithLq: VideoEntry = {
      id: "vid-1",
      title: "Test Video",
      channel: "Test Channel",
      video_path: "/videos/1.mp4",
      thumbnail_path: "/thumbs/1.jpg",
      lq_thumbnail_path: "/thumbs/1_lq.jpg",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
    };

    const lqUrl = getThumbnailUrl(videoWithLq, false);
    expect(lqUrl).toContain("1_lq.jpg");

    const highResUrl = getThumbnailUrl(videoWithLq, true);
    expect(highResUrl).toContain("1.jpg");
    expect(highResUrl).not.toContain("1_lq.jpg");
  });

  it("falls back to original thumbnail if lq_thumbnail_path is missing", () => {
    const videoWithoutLq: VideoEntry = {
      id: "vid-2",
      title: "Old Video",
      channel: "Channel",
      video_path: "/videos/2.mp4",
      thumbnail_path: "/thumbs/2.jpg",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
    };

    const url = getThumbnailUrl(videoWithoutLq, false);
    expect(url).toContain("2.jpg");
  });

  it("returns empty string safely for null or undefined input in getThumbnailUrl", () => {
    expect(getThumbnailUrl(null)).toBe("");
    expect(getThumbnailUrl(undefined)).toBe("");
  });

  it("dynamically switches thumbnail url based on thumbnailQuality setting", () => {
    const videoWithLq: VideoEntry = {
      id: "vid-1",
      title: "Test Video",
      channel: "Test Channel",
      video_path: "/videos/1.mp4",
      thumbnail_path: "/thumbs/1.jpg",
      lq_thumbnail_path: "/thumbs/1_lq.jpg",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
    };

    // When high is requested explicitly
    const urlHigh = getThumbnailUrl(videoWithLq, true);
    expect(urlHigh).toContain("1.jpg");
    expect(urlHigh).not.toContain("1_lq.jpg");

    // Standard low/medium request
    const urlLq = getThumbnailUrl(videoWithLq, false);
    expect(urlLq).toContain("1_lq.jpg");
  });

  it("handles batch preload with already-decoded and failed entries gracefully", () => {
    markImageDecoded("http://asset.localhost/already-done.jpg");
    markImageFailed("http://asset.localhost/bad.jpg");

    expect(() => {
      preloadImages([
        "http://asset.localhost/already-done.jpg",
        "http://asset.localhost/bad.jpg",
        "http://asset.localhost/new.jpg",
      ]);
    }).not.toThrow();
  });
});
