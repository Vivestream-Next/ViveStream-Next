import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import Downloads from "../pages/Downloads";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd, _args) => {
    if (cmd === "get_video_metadata") {
      return Promise.resolve({
        entries: [
          {
            id: "mock_id_123",
            title: "Mock Video Title",
            channel: "Mock Channel",
            video_path: "/mock/videos/mock_id_123.mp4",
            thumbnail_path: "/mock/thumbs/mock_id_123.jpg",
          },
        ],
      });
    }
    if (cmd === "download_video") {
      return Promise.resolve();
    }
    if (cmd === "get_downloaded_videos") {
      return Promise.resolve([]);
    }
    return Promise.resolve();
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("Tauri IPC Mocking (Integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call download_video with correctly parsed VideoEntry struct and playerClient", async () => {
    render(() => <Downloads />);

    const input = screen.getByPlaceholderText("Paste video or playlist URL...");
    fireEvent.input(input, {
      target: { value: "https://youtube.com/watch?v=mock_id_123" },
    });

    const downloadBtn = document.querySelector(
      ".dl-action-btn",
    ) as HTMLButtonElement;
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_video_metadata", {
        url: "https://youtube.com/watch?v=mock_id_123",
        playerClient: "default",
      });

      expect(invoke).toHaveBeenCalledWith(
        "download_video",
        expect.objectContaining({
          url: "https://www.youtube.com/watch?v=mock_id_123",
          metadata: {
            id: "mock_id_123",
            title: "Mock Video Title",
            channel: "Mock Channel",
            video_path: "/mock/videos/mock_id_123.mp4",
            thumbnail_path: "/mock/thumbs/mock_id_123.jpg",
          },
          quality: "1440p",
          playerClient: "default",
        }),
      );
    });
  });
});
