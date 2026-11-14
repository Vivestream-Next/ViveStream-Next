import { describe, it, expect } from "vitest";
import {
  sortVideos,
  sortPlaylists,
  sortArtists,
  sortDownloadHistory,
  naturalCompare,
} from "../utils/sortUtils";
import { VideoEntry, DownloadHistoryEntry } from "../store";

describe("sortUtils unit tests", () => {
  const sampleVideos: VideoEntry[] = [
    {
      id: "vid-1",
      title: "Zebra Crossing",
      channel: "Nature Channel",
      video_path: "",
      thumbnail_path: "",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-01-01 10:00:00",
    },
    {
      id: "vid-2",
      title: "Apple Pie Recipe",
      channel: "Cooking Pro",
      video_path: "",
      thumbnail_path: "",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-02-15 12:30:00",
    },
    {
      id: "vid-3",
      title: "Episode 10 Finale",
      channel: "Anime Studio",
      video_path: "",
      thumbnail_path: "",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-03-01 08:00:00",
    },
    {
      id: "vid-4",
      title: "Episode 2 Debut",
      channel: "Anime Studio",
      video_path: "",
      thumbnail_path: "",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-02-20 14:00:00",
    },
  ];

  describe("naturalCompare", () => {
    it("should naturally order strings with embedded numbers", () => {
      expect(naturalCompare("Episode 2", "Episode 10")).toBeLessThan(0);
      expect(naturalCompare("Song 100", "Song 20")).toBeGreaterThan(0);
      expect(naturalCompare("Track 01", "Track 1")).toBe(0);
    });
  });

  describe("sortVideos", () => {
    it("should sort by title ascending", () => {
      const sorted = sortVideos(sampleVideos, "name", "asc");
      expect(sorted[0].title).toBe("Apple Pie Recipe");
      expect(sorted[1].title).toBe("Episode 2 Debut");
      expect(sorted[2].title).toBe("Episode 10 Finale");
      expect(sorted[3].title).toBe("Zebra Crossing");
    });

    it("should sort by title descending", () => {
      const sorted = sortVideos(sampleVideos, "name", "desc");
      expect(sorted[0].title).toBe("Zebra Crossing");
      expect(sorted[3].title).toBe("Apple Pie Recipe");
    });

    it("should sort by date descending (newest first)", () => {
      const sorted = sortVideos(sampleVideos, "date", "desc");
      expect(sorted[0].id).toBe("vid-3"); // 2026-03-01
      expect(sorted[1].id).toBe("vid-4"); // 2026-02-20
      expect(sorted[2].id).toBe("vid-2"); // 2026-02-15
      expect(sorted[3].id).toBe("vid-1"); // 2026-01-01
    });

    it("should sort by date ascending (oldest first)", () => {
      const sorted = sortVideos(sampleVideos, "date", "asc");
      expect(sorted[0].id).toBe("vid-1");
      expect(sorted[3].id).toBe("vid-3");
    });

    it("should sort by channel name", () => {
      const sorted = sortVideos(sampleVideos, "channel", "asc");
      expect(sorted[0].channel).toBe("Anime Studio");
      expect(sorted[1].channel).toBe("Anime Studio");
      expect(sorted[2].channel).toBe("Cooking Pro");
      expect(sorted[3].channel).toBe("Nature Channel");
    });

    it("should shuffle deterministically with a fixed seed", () => {
      const shuffled1 = sortVideos(sampleVideos, "random", "desc", 12345);
      const shuffled2 = sortVideos(sampleVideos, "random", "desc", 12345);
      expect(shuffled1.map((v) => v.id)).toEqual(shuffled2.map((v) => v.id));

      const shuffledDifferent = sortVideos(
        sampleVideos,
        "random",
        "desc",
        99999,
      );
      expect(shuffledDifferent.length).toBe(sampleVideos.length);
      expect(shuffled1.length).toBe(sampleVideos.length);
    });

    it("should handle empty or single item arrays safely", () => {
      expect(sortVideos([])).toEqual([]);
      expect(sortVideos([sampleVideos[0]])).toEqual([sampleVideos[0]]);
    });
  });

  describe("sortPlaylists", () => {
    const playlists = [
      { id: "pl-1", name: "Chill Vibes", created_at: "2026-01-01" },
      { id: "pl-2", name: "Workout Jams", created_at: "2026-02-01" },
      { id: "pl-3", name: "Ambient Coding", created_at: "2026-03-01" },
    ];
    const counts = { "pl-1": 15, "pl-2": 50, "pl-3": 5 };

    it("should sort playlists by video count descending", () => {
      const sorted = sortPlaylists(playlists, counts, "count", "desc");
      expect(sorted[0].id).toBe("pl-2"); // 50
      expect(sorted[1].id).toBe("pl-1"); // 15
      expect(sorted[2].id).toBe("pl-3"); // 5
    });

    it("should sort playlists by name ascending", () => {
      const sorted = sortPlaylists(playlists, counts, "name", "asc");
      expect(sorted[0].name).toBe("Ambient Coding");
      expect(sorted[2].name).toBe("Workout Jams");
    });
  });

  describe("sortArtists", () => {
    const artists = [
      { name: "Taylor Swift", avatar_path: "" },
      { name: "Alan Walker", avatar_path: "" },
      { name: "Hans Zimmer", avatar_path: "" },
    ];
    const videoCounts = {
      "Taylor Swift": 10,
      "Alan Walker": 25,
      "Hans Zimmer": 3,
    };

    it("should sort artists by name ascending", () => {
      const sorted = sortArtists(artists, videoCounts, "name", "asc");
      expect(sorted[0].name).toBe("Alan Walker");
      expect(sorted[2].name).toBe("Taylor Swift");
    });

    it("should sort artists by video count descending", () => {
      const sorted = sortArtists(artists, videoCounts, "count", "desc");
      expect(sorted[0].name).toBe("Alan Walker");
      expect(sorted[1].name).toBe("Taylor Swift");
      expect(sorted[2].name).toBe("Hans Zimmer");
    });
  });

  describe("sortDownloadHistory", () => {
    const history: DownloadHistoryEntry[] = [
      {
        id: "h1",
        video_id: "v1",
        title: "Beta Video",
        channel: "Alpha Channel",
        url: "https://youtube.com/watch?v=v1",
        status: "done",
        dl_type: "Video",
        created_at: "2026-01-01 12:00:00",
      },
      {
        id: "h2",
        video_id: "v2",
        title: "Alpha Video",
        channel: "Beta Channel",
        url: "https://youtube.com/watch?v=v2",
        status: "error",
        dl_type: "Audio",
        created_at: "2026-02-01 12:00:00",
      },
    ];

    it("should sort history by title ascending", () => {
      const sorted = sortDownloadHistory(history, "title", "asc");
      expect(sorted[0].title).toBe("Alpha Video");
      expect(sorted[1].title).toBe("Beta Video");
    });

    it("should sort history by date descending", () => {
      const sorted = sortDownloadHistory(history, "date", "desc");
      expect(sorted[0].id).toBe("h2");
      expect(sorted[1].id).toBe("h1");
    });
  });
});
