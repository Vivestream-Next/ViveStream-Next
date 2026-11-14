import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FloatingSortBar from "../components/FloatingSortBar";
import Home from "../pages/Home";
import { invoke } from "@tauri-apps/api/core";
import {
  VideoEntry,
  setAlwaysShowSortBar,
  setIsSortOpen,
  homeSortBy,
  setHomeSortBy,
  homeSortDirection,
  setHomeSortDirection,
  setForceSetup,
} from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path) => path),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useSearchParams: () => [{}],
  useLocation: () => ({ pathname: "/" }),
}));

describe("FloatingSortBar Component and Integration", () => {
  const mockVideos: VideoEntry[] = [
    {
      id: "v1",
      title: "Zeta Gundam Ep 1",
      channel: "Anime Vault",
      video_path: "/path/1.mp4",
      thumbnail_path: "/thumb/1.jpg",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-01-01 10:00:00",
    },
    {
      id: "v2",
      title: "Alpha Protocol",
      channel: "Gaming Central",
      video_path: "/path/2.mp4",
      thumbnail_path: "/thumb/2.jpg",
      avatar_path: "",
      subtitle_path: "",
      desc_path: "",
      added_at: "2026-02-01 10:00:00",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    setAlwaysShowSortBar(true);
    setIsSortOpen(true);
    setHomeSortBy("date");
    setHomeSortDirection("desc");

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "get_downloaded_videos" || cmd === "get_favorites") {
        return Promise.resolve(mockVideos);
      }
      if (cmd === "check_favorite") {
        return Promise.resolve(false);
      }
      return Promise.resolve([]);
    });
  });

  it("renders FloatingSortBar and toggles dropdown and options", async () => {
    render(() => (
      <div>
        <FloatingSortBar />
        <Home />
      </div>
    ));

    await waitFor(() => {
      expect(screen.getByText("Date Added")).toBeInTheDocument();
    });

    const trigger = screen.getByTitle("Change sorting criterion (Ctrl+S)");
    fireEvent.click(trigger);

    expect(screen.getByText("Title (A-Z)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Title (A-Z)"));

    expect(homeSortBy()).toBe("name");
  });

  it("toggles sorting direction from FloatingSortBar", async () => {
    render(() => <FloatingSortBar />);

    const dirBtn = screen.getByTitle("Descending (Click for Ascending)");
    fireEvent.click(dirBtn);

    expect(homeSortDirection()).toBe("asc");
  });

  it("does not render FloatingSortBar when alwaysShowSortBar is false and isSortOpen is false", () => {
    setAlwaysShowSortBar(false);
    setIsSortOpen(false);
    render(() => <FloatingSortBar />);

    expect(screen.queryByTitle("Change sorting criterion (Ctrl+S)")).not.toBeInTheDocument();
  });

  it("does not render FloatingSortBar when forceSetup is true", () => {
    setAlwaysShowSortBar(true);
    setIsSortOpen(true);
    setForceSetup(true);
    render(() => <FloatingSortBar />);

    expect(screen.queryByTitle("Change sorting criterion (Ctrl+S)")).not.toBeInTheDocument();
    setForceSetup(false);
  });
});
