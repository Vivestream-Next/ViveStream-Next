import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import Settings from "../pages/Settings";
import {
  appFontWeight,
  setAppFontWeight,
  appFontSlant,
  setAppFontSlant,
  appFontWidth,
  setAppFontWidth,
  appFontRoundness,
  setAppFontRoundness,
  resetFontSettings,
  getAppFontWeight,
  getAppFontSlant,
  getAppFontWidth,
  getAppFontRoundness,
} from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

describe("GoogleSansFlex Typography & Variable Font Studio", () => {
  beforeEach(() => {
    resetFontSettings();
  });

  it("initializes with default variable font axes values", () => {
    expect(appFontWeight()).toBe(400);
    expect(appFontSlant()).toBe(0);
    expect(appFontWidth()).toBe(100);
    expect(appFontRoundness()).toBe(0);

    expect(document.documentElement.style.getPropertyValue("--font-weight")).toBe("400");
    expect(document.documentElement.style.getPropertyValue("--font-slant")).toBe("0");
    expect(document.documentElement.style.getPropertyValue("--font-width")).toBe("100");
    expect(document.documentElement.style.getPropertyValue("--font-roundness")).toBe("0");
  });

  it("updates weight and clamps within [300, 800]", () => {
    setAppFontWeight(650);
    expect(appFontWeight()).toBe(650);
    expect(getAppFontWeight()).toBe(650);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontWeight", "650");
    expect(document.documentElement.style.getPropertyValue("--font-weight")).toBe("650");

    // Clamp below min
    setAppFontWeight(150);
    expect(appFontWeight()).toBe(300);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontWeight", "300");

    // Clamp above max
    setAppFontWeight(950);
    expect(appFontWeight()).toBe(800);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontWeight", "800");
  });

  it("updates slant and clamps within [-10, 12]", () => {
    setAppFontSlant(8);
    expect(appFontSlant()).toBe(8);
    expect(getAppFontSlant()).toBe(8);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontSlant", "8");
    expect(document.documentElement.style.getPropertyValue("--font-slant")).toBe("8");

    // Clamp below min
    setAppFontSlant(-25);
    expect(appFontSlant()).toBe(-10);

    // Clamp above max
    setAppFontSlant(30);
    expect(appFontSlant()).toBe(12);
  });

  it("updates width and clamps within [75, 125]", () => {
    setAppFontWidth(115);
    expect(appFontWidth()).toBe(115);
    expect(getAppFontWidth()).toBe(115);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontWidth", "115");
    expect(document.documentElement.style.getPropertyValue("--font-width")).toBe("115");

    // Clamp below min
    setAppFontWidth(50);
    expect(appFontWidth()).toBe(75);

    // Clamp above max
    setAppFontWidth(150);
    expect(appFontWidth()).toBe(125);
  });

  it("updates roundness and clamps within [0, 100]", () => {
    setAppFontRoundness(75);
    expect(appFontRoundness()).toBe(75);
    expect(getAppFontRoundness()).toBe(75);
    expect(localStorage.setItem).toHaveBeenCalledWith("appFontRoundness", "75");
    expect(document.documentElement.style.getPropertyValue("--font-roundness")).toBe("75");

    // Clamp below min
    setAppFontRoundness(-20);
    expect(appFontRoundness()).toBe(0);

    // Clamp above max
    setAppFontRoundness(200);
    expect(appFontRoundness()).toBe(100);
  });

  it("resets all font settings to defaults", () => {
    setAppFontWeight(700);
    setAppFontSlant(-8);
    setAppFontWidth(85);
    setAppFontRoundness(60);

    resetFontSettings();

    expect(appFontWeight()).toBe(400);
    expect(appFontSlant()).toBe(0);
    expect(appFontWidth()).toBe(100);
    expect(appFontRoundness()).toBe(0);

    expect(document.documentElement.style.getPropertyValue("--font-weight")).toBe("400");
    expect(document.documentElement.style.getPropertyValue("--font-slant")).toBe("0");
    expect(document.documentElement.style.getPropertyValue("--font-width")).toBe("100");
    expect(document.documentElement.style.getPropertyValue("--font-roundness")).toBe("0");
  });

  it("renders Typography & Variable Font Studio card in Settings", () => {
    render(() => <Settings />);

    expect(screen.getByText("Typography & Variable Font Studio")).toBeInTheDocument();
    expect(screen.getByText("Live Variable Font Preview")).toBeInTheDocument();
    expect(screen.getByText("Reset to Defaults")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Slant")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Width")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Roundness")).toBeInTheDocument();
    expect(
      screen.getByText("The quick brown fox jumps over the lazy dog"),
    ).toBeInTheDocument();
  });

  it("interacts with sliders and reset button in Settings UI", () => {
    render(() => <Settings />);

    const weightSlider = screen.getByLabelText("Font Weight");
    fireEvent.input(weightSlider, { target: { value: "600" } });
    expect(appFontWeight()).toBe(600);

    const slantSlider = screen.getByLabelText("Font Slant");
    fireEvent.input(slantSlider, { target: { value: "-5" } });
    expect(appFontSlant()).toBe(-5);

    const resetBtn = screen.getByText("Reset to Defaults");
    fireEvent.click(resetBtn);
    expect(appFontWeight()).toBe(400);
    expect(appFontSlant()).toBe(0);
  });
});
