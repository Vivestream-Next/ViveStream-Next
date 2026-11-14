import { describe, it, expect, beforeEach } from "vitest";
import {
  generateMaterialPalette,
  normalizeHex,
  getRelativeLuminance,
  applyMaterialTheme,
  resolveSeedColor,
  PRESET_PALETTES,
} from "../utils/themeEngine";

describe("Material You Theme Engine", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-palette");
  });

  it("normalizes short and invalid hex colors safely", () => {
    expect(normalizeHex("#fff")).toBe("#ffffff");
    expect(normalizeHex("000")).toBe("#000000");
    expect(normalizeHex("#F25C54")).toBe("#f25c54");
    expect(normalizeHex("invalid")).toBe("#f25c54");
    expect(normalizeHex("")).toBe("#f25c54");
  });

  it("computes relative luminance accurately", () => {
    expect(getRelativeLuminance(0, 0, 0)).toBe(0);
    expect(getRelativeLuminance(255, 255, 255)).toBeCloseTo(1, 4);
    // Yellow is significantly brighter than blue
    const yellowLum = getRelativeLuminance(250, 204, 21);
    const blueLum = getRelativeLuminance(59, 130, 246);
    expect(yellowLum).toBeGreaterThan(blueLum);
  });

  it("generates harmonic tonal palettes with proper text & logo contrast for dark seeds", () => {
    const palette = generateMaterialPalette("#8b5cf6"); // Violet
    expect(palette.primary).toBe("#8b5cf6");
    expect(palette.primaryRgb).toBe("139, 92, 246");
    expect(palette.onPrimary).toBe("#ffffff");
    expect(palette.logoInner).toBe("#ffffff");
    expect(palette.primaryContainer).toBe("rgba(139, 92, 246, 0.16)");
    expect(palette.logoGlow).toBe("rgba(139, 92, 246, 0.5)");
  });

  it("generates high-contrast dark text and logo stroke for bright/light seeds", () => {
    const palette = generateMaterialPalette("#facc15"); // Bright Yellow
    expect(palette.primary).toBe("#facc15");
    expect(palette.onPrimary).toBe("#121212");
    expect(palette.logoInner).toBe("#121212");
  });

  it("applies CSS custom properties to document.documentElement", () => {
    const applied = applyMaterialTheme("#10b981", "emerald");
    const style = document.documentElement.style;

    expect(style.getPropertyValue("--primary-accent")).toBe("#10b981");
    expect(style.getPropertyValue("--primary-accent-rgb")).toBe("16, 185, 129");
    expect(style.getPropertyValue("--primary-accent-dark")).toBe(applied.primaryDark);
    expect(style.getPropertyValue("--primary-container")).toBe(applied.primaryContainer);
    expect(style.getPropertyValue("--on-primary")).toBe(applied.onPrimary);
    expect(style.getPropertyValue("--logo-inner")).toBe(applied.logoInner);
    expect(document.documentElement.getAttribute("data-palette")).toBe("emerald");
  });

  it("resolves seed colors from presets and custom colors", () => {
    expect(resolveSeedColor("sunset")).toBe("#f25c54");
    expect(resolveSeedColor("crimson")).toBe("#ef233c");
    expect(resolveSeedColor("custom", "#6366f1")).toBe("#6366f1");
    expect(resolveSeedColor("nonexistent")).toBe("#f25c54");

    // Monochrome adapts to dark and light mode
    document.documentElement.setAttribute("data-theme", "dark");
    expect(resolveSeedColor("monochrome")).toBe("#ffffff");

    document.documentElement.setAttribute("data-theme", "light");
    expect(resolveSeedColor("monochrome")).toBe("#000000");
  });

  it("includes all 9 curated presets including monochrome", () => {
    expect(PRESET_PALETTES.length).toBe(9);
    const ids = PRESET_PALETTES.map((p) => p.id);
    expect(ids).toContain("sunset");
    expect(ids).toContain("crimson");
    expect(ids).toContain("violet");
    expect(ids).toContain("cyan");
    expect(ids).toContain("emerald");
    expect(ids).toContain("amber");
    expect(ids).toContain("rose");
    expect(ids).toContain("indigo");
    expect(ids).toContain("monochrome");
  });
});

