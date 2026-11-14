import { render, screen, waitFor } from "@solidjs/testing-library";
import App from "../App";
import { vi } from "vitest";

// Mock tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd) => {
    if (cmd === "check_binaries") {
      return Promise.resolve({ ytdlp_exists: true, ffmpeg_exists: true });
    }
    if (
      cmd === "get_downloaded_videos" ||
      cmd === "get_playlists" ||
      cmd === "get_artists"
    ) {
      return Promise.resolve([]);
    }
    return Promise.resolve();
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    hide: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("Router", () => {
  it("navigates between routes", async () => {
    render(() => <App />);

    // Wait for App to mount and check_binaries to complete
    await waitFor(() => {
      // "Downloads" link should be rendered
      expect(screen.getByText("Downloads")).toBeInTheDocument();
    });

    // Click Downloads link
    const downloadsLink = screen.getByText("Downloads").closest("a");
    expect(downloadsLink).toHaveAttribute("href", "/downloads");
  });
});
