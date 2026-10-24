import { render, screen, fireEvent } from "@solidjs/testing-library";
import SetupMinigame from "../components/SetupMinigame";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("SetupMinigame Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders arcade title and instructions", () => {
    render(() => (
      <SetupMinigame
        downloadProgress={25}
        isCompleted={false}
      />
    ));

    expect(screen.getAllByText(/STREAM RUNNER/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ARCADE/i)).toBeInTheDocument();
    expect(screen.getByText(/Setup: 25%/i)).toBeInTheDocument();
    expect(screen.getByText(/START RUNNING/i)).toBeInTheDocument();
    expect(screen.getByText(/STREAM SCORE/i)).toBeInTheDocument();
    expect(screen.getByText(/HIGH SCORE/i)).toBeInTheDocument();
  });

  it("toggles audio mute button and saves state to localStorage", () => {
    render(() => (
      <SetupMinigame
        downloadProgress={50}
        isCompleted={false}
      />
    ));

    const muteBtn = screen.getByLabelText(/Toggle Sound/i);
    expect(muteBtn).toBeInTheDocument();

    fireEvent.click(muteBtn);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "vivestream_minigame_muted",
      "true",
    );

    fireEvent.click(muteBtn);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "vivestream_minigame_muted",
      "false",
    );
  });

  it("displays completion state when engines are ready", () => {
    render(() => (
      <SetupMinigame
        downloadProgress={100}
        isCompleted={true}
      />
    ));

    expect(screen.getByText(/Engines Ready!/i)).toBeInTheDocument();
  });

  it("starts the game when START RUNNING is clicked", () => {
    render(() => (
      <SetupMinigame
        downloadProgress={10}
        isCompleted={false}
      />
    ));

    const startBtn = screen.getByText(/START RUNNING/i);
    fireEvent.click(startBtn);

    // Overlay is cleared
    expect(
      screen.queryByText(/Jump over ground glitch hurdles/i),
    ).not.toBeInTheDocument();
  });

  it("renders in standalone arcade mode without setup progress bar", () => {
    render(() => <SetupMinigame standalone={true} />);

    expect(screen.getAllByText(/STREAM RUNNER/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Retro Arcade/i)).toBeInTheDocument();
    expect(screen.queryByText(/Setup:/i)).not.toBeInTheDocument();
  });
});
