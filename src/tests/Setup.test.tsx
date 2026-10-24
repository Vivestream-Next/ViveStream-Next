import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import Setup from "../pages/Setup";
import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

// Mock Tauri invoke and listen
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd, _args) => {
    if (cmd === "check_binaries") {
      return Promise.resolve({
        ytdlp_exists: false,
        ffmpeg_exists: false,
        bin_folder: "/mock/bin/folder",
      });
    }
    if (cmd === "download_binaries") {
      return Promise.resolve();
    }
    return Promise.resolve();
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("Setup Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show DEPLOYING ENGINES when binaries are missing and start setup", async () => {
    render(() => <Setup />);

    // Wait for the initial check to finish and logs to be populated
    await waitFor(() => {
      expect(
        screen.getByText(/Target Data Path: \/mock\/bin\/folder/i),
      ).toBeInTheDocument();
    });

    const deployBtn = screen.getByText(/INITIALIZE DEPLOYMENT/i);
    expect(deployBtn).toBeInTheDocument();

    fireEvent.click(deployBtn);

    // Verify loading state
    expect(screen.getByText(/DEPLOYING ENGINES/i)).toBeInTheDocument();

    // Verify invoke was called
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("download_binaries");
    });
  });

  it("should switch between Deployment Console and Stream Runner minigame", async () => {
    render(() => <Setup />);

    const gameTab = screen.getByRole("tab", { name: /Stream Runner/i });
    expect(gameTab).toBeInTheDocument();

    fireEvent.click(gameTab);

    // Minigame should now be visible
    expect(screen.getByText(/STREAM RUNNER \/\/ BIT DASH/i)).toBeInTheDocument();

    // Switch back to console
    const consoleTab = screen.getByRole("tab", { name: /Deployment Console/i });
    fireEvent.click(consoleTab);

    expect(consoleTab).toHaveClass("active");
  });
});

