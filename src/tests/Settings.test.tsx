import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import Settings from "../pages/Settings";
import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { showConfirmDialog, addToast } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// Partially mock the store to override only the dialog and toast functions
// This ensures all the SolidJS signals in the store remain fully reactive
vi.mock("../store", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    showConfirmDialog: vi.fn(() => Promise.resolve(true)),
    addToast: vi.fn(),
  };
});

describe("Settings Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles wipe dependencies", async () => {
    render(() => <Settings />);
    const wipeBtn = screen.getByText("Wipe Engines");
    expect(wipeBtn).toBeInTheDocument();
    fireEvent.click(wipeBtn);

    await waitFor(() => {
      expect(showConfirmDialog).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("wipe_dependencies");
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining("Dependencies wiped successfully"),
        expect.anything(),
      );
    });
  });

  it("handles nuclear wipe", async () => {
    render(() => <Settings />);
    const nuclearBtn = screen.getByText("Delete Media & Database");
    expect(nuclearBtn).toBeInTheDocument();
    fireEvent.click(nuclearBtn);

    await waitFor(() => {
      expect(showConfirmDialog).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("nuclear_wipe");
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining("Nuclear wipe complete"),
        expect.anything(),
      );
    });
  });

  it("handles clean database", async () => {
    render(() => <Settings />);
    const cleanBtn = screen.getByText("Clean Data");
    expect(cleanBtn).toBeInTheDocument();
    fireEvent.click(cleanBtn);

    await waitFor(() => {
      expect(showConfirmDialog).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("clean_database_and_media");
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining(
          "Database and media have been successfully cleaned",
        ),
        expect.anything(),
      );
    });
  });

  it("handles engine updates", async () => {
    render(() => <Settings />);
    const updateBtn = screen.getByText("Update Engines");
    expect(updateBtn).toBeInTheDocument();
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("update_binaries");
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining("successfully updated"),
        expect.anything(),
      );
    });
  });

  it("handles sorting preferences and randomize on launch toggle", async () => {
    render(() => <Settings />);
    expect(
      screen.getByText("Library Sorting & Presentation"),
    ).toBeInTheDocument();

    const nameSortBtn = screen.getByText("Name");
    fireEvent.click(nameSortBtn);

    const ascBtn = screen.getByText("Ascending");
    fireEvent.click(ascBtn);

    const randomizeSection = screen.getByText("Randomize Library on Startup");
    expect(randomizeSection).toBeInTheDocument();
  });

  it("handles side-by-side app theme and design style switching", async () => {
    render(() => <Settings />);

    const lightCard = screen.getByText("Light Theme");
    expect(lightCard).toBeInTheDocument();
    fireEvent.click(lightCard);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    const darkCard = screen.getByText("Dark Theme");
    expect(darkCard).toBeInTheDocument();
    fireEvent.click(darkCard);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    const clayCard = screen.getByText("Claymorphism");
    expect(clayCard).toBeInTheDocument();
    fireEvent.click(clayCard);
    expect(document.documentElement.getAttribute("data-style")).toBe(
      "claymorphism",
    );

    const neoCard = screen.getByText("Neo-Brutalism");
    expect(neoCard).toBeInTheDocument();
    fireEvent.click(neoCard);
    expect(document.documentElement.getAttribute("data-style")).toBe(
      "neo-brutalism",
    );

    const sunsetCard = screen.getByText("Sunset");
    expect(sunsetCard).toBeInTheDocument();
    fireEvent.click(sunsetCard);
    expect(document.documentElement.getAttribute("data-palette")).toBe(
      "sunset",
    );

    const crimsonCard = screen.getByText("Crimson");
    expect(crimsonCard).toBeInTheDocument();
    fireEvent.click(crimsonCard);
    expect(document.documentElement.getAttribute("data-palette")).toBe(
      "crimson",
    );
  });

  it("handles ambient lighting studio controls (dynamic vs static mode, color swatches)", async () => {
    render(() => <Settings />);

    expect(
      screen.getByText("Ambient Lighting (Cinematic Glow)"),
    ).toBeInTheDocument();

    const staticModeCard = screen.getByText("Static Mode");
    expect(staticModeCard).toBeInTheDocument();
    fireEvent.click(staticModeCard);

    const cyberCyanSwatch = screen.getByText("Cyber Cyan");
    expect(cyberCyanSwatch).toBeInTheDocument();
    fireEvent.click(cyberCyanSwatch);

    const dynamicModeCard = screen.getByText("Dynamic Mode");
    expect(dynamicModeCard).toBeInTheDocument();
    fireEvent.click(dynamicModeCard);
  });
});
