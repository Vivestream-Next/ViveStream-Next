import { render, screen, fireEvent } from "@solidjs/testing-library";
import ArcadeModal from "../components/ArcadeModal";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ArcadeModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(() => <ArcadeModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders when isOpen is true and toggles cinema/focus view", () => {
    const handleClose = vi.fn();
    render(() => <ArcadeModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText(/STREAM RUNNER/i).length).toBeGreaterThan(0);

    const viewModeBtn = screen.getByText(/Cinema View/i);
    expect(viewModeBtn).toBeInTheDocument();

    fireEvent.click(viewModeBtn);
    expect(screen.getByText(/Focus View/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText(/Close Arcade/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
