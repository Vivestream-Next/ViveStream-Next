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
    expect(normalizeHex("invalid")).toBe("#ffffff");
    expect(normalizeHex("")).toBe("#ffffff");
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
    expect(resolveSeedColor("nonexistent")).toBe("#ffffff");

    // Special palettes adapt to dark and light mode
    document.documentElement.setAttribute("data-theme", "dark");
    expect(resolveSeedColor("monochrome")).toBe("#ffffff");
    expect(resolveSeedColor("retro-anime")).toBe("#ff5c93");
    expect(resolveSeedColor("fresh-green")).toBe("#52b788");
    expect(resolveSeedColor("muted-earthy")).toBe("#e5989b");
    expect(resolveSeedColor("peach-sorbet")).toBe("#f08080");
    expect(resolveSeedColor("cherry-bloom")).toBe("#ff4d6d");
    expect(resolveSeedColor("pink-ombre")).toBe("#ff477e");
    expect(resolveSeedColor("coral-pink")).toBe("#ef6351");
    expect(resolveSeedColor("cherry-blossom")).toBe("#da5552");
    expect(resolveSeedColor("pastel-greenery")).toBe("#56ab91");
    expect(resolveSeedColor("green-meadow")).toBe("#73a942");
    expect(resolveSeedColor("green-harmony")).toBe("#2dc653");
    expect(resolveSeedColor("turquoise-waters")).toBe("#3dccc7");

    document.documentElement.setAttribute("data-theme", "light");
    expect(resolveSeedColor("monochrome")).toBe("#000000");
    expect(resolveSeedColor("retro-anime")).toBe("#ff3377");
    expect(resolveSeedColor("fresh-green")).toBe("#40916c");
    expect(resolveSeedColor("muted-earthy")).toBe("#a06d77");
    expect(resolveSeedColor("peach-sorbet")).toBe("#e06868");
    expect(resolveSeedColor("cherry-bloom")).toBe("#c9184a");
    expect(resolveSeedColor("pink-ombre")).toBe("#ff0a54");
    expect(resolveSeedColor("coral-pink")).toBe("#d44a37");
    expect(resolveSeedColor("cherry-blossom")).toBe("#cc444b");
    expect(resolveSeedColor("pastel-greenery")).toBe("#248277");
    expect(resolveSeedColor("green-meadow")).toBe("#538d22");
    expect(resolveSeedColor("green-harmony")).toBe("#1a7431");
    expect(resolveSeedColor("turquoise-waters")).toBe("#07beb8");
  });

  it("includes all 21 curated presets with 13 special brand candidates", () => {
    expect(PRESET_PALETTES.length).toBe(21);
    const specialPalettes = PRESET_PALETTES.filter((p) => p.isSpecial);
    expect(specialPalettes.length).toBe(13);

    const ids = PRESET_PALETTES.map((p) => p.id);
    expect(ids).toContain("monochrome");
    expect(ids).toContain("retro-anime");
    expect(ids).toContain("fresh-green");
    expect(ids).toContain("muted-earthy");
    expect(ids).toContain("peach-sorbet");
    expect(ids).toContain("cherry-bloom");
    expect(ids).toContain("pink-ombre");
    expect(ids).toContain("coral-pink");
    expect(ids).toContain("cherry-blossom");
    expect(ids).toContain("pastel-greenery");
    expect(ids).toContain("green-meadow");
    expect(ids).toContain("green-harmony");
    expect(ids).toContain("turquoise-waters");
    expect(ids).toContain("sunset");
    expect(ids).toContain("crimson");
    expect(ids).toContain("violet");
    expect(ids).toContain("cyan");
    expect(ids).toContain("emerald");
    expect(ids).toContain("amber");
    expect(ids).toContain("rose");
    expect(ids).toContain("indigo");
  });

  it("generates sleek luxury tech aesthetic palettes for dark and light monochrome", () => {
    // Dark mode monochrome (#ffffff)
    const darkPalette = generateMaterialPalette("#ffffff");
    expect(darkPalette.primary).toBe("#ffffff");
    expect(darkPalette.primaryDark).toBe("#e4e4e7");
    expect(darkPalette.onPrimary).toBe("#090a0f");
    expect(darkPalette.onPrimaryContainer).toBe("#f4f4f5");
    expect(darkPalette.logoInner).toBe("#090a0f");

    // Light mode monochrome (#000000)
    const lightPalette = generateMaterialPalette("#000000");
    expect(lightPalette.primary).toBe("#09090b");
    expect(lightPalette.primaryDark).toBe("#27272a");
    expect(lightPalette.onPrimary).toBe("#ffffff");
    expect(lightPalette.onPrimaryContainer).toBe("#09090b");
    expect(lightPalette.logoInner).toBe("#ffffff");
  });
});

