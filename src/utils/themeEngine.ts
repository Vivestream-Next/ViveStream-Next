/**
 * Material You Dynamic Theming Engine for ViveStream Next (v4.0.0)
 * Generates an adaptive harmonic tonal palette from any seed color,
 * dynamically updating the entire UI, buttons, controls, surfaces, and logo colors.
 */

export interface PalettePreset {
  id: string;
  name: string;
  seed: string;
  description: string;
  icon: string;
  isSpecial?: boolean;
  tokens?: string[];
}

export interface MaterialTonalPalette {
  seed: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryRgb: string;
  primaryContainer: string;
  onPrimary: string;
  onPrimaryContainer: string;
  logoInner: string;
  logoWave: string;
  logoGlow: string;
  surfaceTint: string;
  focusRing: string;
}

export const PRESET_PALETTES: PalettePreset[] = [
  // ── SPECIAL BRAND CANDIDATE PALETTES ──────────────────────────────
  {
    id: "monochrome",
    name: "Monochrome",
    seed: "#ffffff",
    description: "Ultra-modern Obsidian & Gallery luxury tech aesthetic",
    icon: "ph-circle-half",
    isSpecial: true,
    tokens: ["#090a0f", "#12141a", "#1a1d26", "#a1a1aa", "#f4f4f5", "#ffffff"],
  },
  {
    id: "retro-anime",
    name: "Retro Anime",
    seed: "#ff5c93",
    description: "90s City Pop & Kawaii Arcade aesthetic with pixel anime vibes",
    icon: "ph-sparkle",
    isSpecial: true,
    tokens: ["#130a1c", "#1c0e27", "#ff5c93", "#e02266", "#ffd6e5", "#ffffff"],
  },
  {
    id: "fresh-green",
    name: "Fresh Green",
    seed: "#52b788",
    description: "Botanical Frosted Mint & Deep Evergreen woodland gradient",
    icon: "ph-leaf",
    isSpecial: true,
    tokens: ["#081c15", "#1b4332", "#2d6a4f", "#52b788", "#95d5b2", "#d8f3dc"],
  },
  {
    id: "muted-earthy",
    name: "Muted Earthy Tones",
    seed: "#b5838d",
    description: "Warm Peach Fuzz, Powder Blush & Dusty Rose velvety elegance",
    icon: "ph-feather",
    isSpecial: true,
    tokens: ["#6d6875", "#b5838d", "#e5989b", "#ffb4a2", "#ffcdb2"],
  },
  {
    id: "peach-sorbet",
    name: "Peach Sorbet",
    seed: "#f08080",
    description: "Sweet Coral, Candied Salmon & Soft Apricot refreshing nectar",
    icon: "ph-cookie",
    isSpecial: true,
    tokens: ["#f08080", "#f4978e", "#f8ad9d", "#fbc4ab", "#ffdab9"],
  },
  {
    id: "cherry-bloom",
    name: "Cherry Blossom Bloom",
    seed: "#ff4d6d",
    description: "Night Bordeaux, Cherry Rose & Cotton Candy high-contrast bloom",
    icon: "ph-flower-lotus",
    isSpecial: true,
    tokens: ["#590d22", "#800f2f", "#a4133c", "#c9184a", "#ff4d6d", "#ff758f", "#ff8fa3", "#ffb3c1", "#ffccd5", "#fff0f3"],
  },
  {
    id: "pink-ombre",
    name: "Pink Ombre",
    seed: "#ff0a54",
    description: "Electric Hot Fuchsia to Soft Petal Blush monochromatic neon ramp",
    icon: "ph-paint-brush",
    isSpecial: true,
    tokens: ["#ff0a54", "#ff477e", "#ff5c8a", "#ff7096", "#ff85a1", "#ff99ac", "#fbb1bd", "#f9bec7", "#f7cad0", "#fae0e4"],
  },
  {
    id: "coral-pink",
    name: "Coral Pink Delight",
    seed: "#ef6351",
    description: "Vibrant Tomato, Sunny Salmon & Delicate Powder Blush warmth",
    icon: "ph-heart",
    isSpecial: true,
    tokens: ["#ef6351", "#f38375", "#f7a399", "#fbc3bc", "#ffe3e0"],
  },
  {
    id: "cherry-blossom",
    name: "Cherry Blossom",
    seed: "#da5552",
    description: "Blushed Brick, Lobster Coral & Light Rosewood floral balance",
    icon: "ph-flower",
    isSpecial: true,
    tokens: ["#cc444b", "#da5552", "#df7373", "#e39695", "#e4b1ab"],
  },
  {
    id: "pastel-greenery",
    name: "Pastel Greenery",
    seed: "#56ab91",
    description: "Celadon Mint, Seagrass & Deep Blue Spruce tranquil ocean forestry",
    icon: "ph-plant",
    isSpecial: true,
    tokens: ["#036666", "#14746f", "#248277", "#358f80", "#469d89", "#56ab91", "#67b99a", "#78c6a3", "#88d4ab", "#99e2b4"],
  },
  {
    id: "green-meadow",
    name: "Green Meadow",
    seed: "#73a942",
    description: "Black Forest canopy, Forest Moss & Sunlit Willow Meadow",
    icon: "ph-tree",
    isSpecial: true,
    tokens: ["#143601", "#1a4301", "#245501", "#538d22", "#73a942", "#aad576"],
  },
  {
    id: "green-harmony",
    name: "Green Harmony",
    seed: "#2dc653",
    description: "Rich Dark Emerald, Forest Turf & Radiant Jade Green vitality",
    icon: "ph-yin-yang",
    isSpecial: true,
    tokens: ["#10451d", "#155d27", "#1a7431", "#208b3a", "#25a244", "#2dc653", "#4ad66d", "#6ede8a", "#92e6a7", "#b7efc5"],
  },
  {
    id: "turquoise-waters",
    name: "Turquoise Waters",
    seed: "#07beb8",
    description: "Light Sea Green, Strong Cyan & Icy Aqua crystalline waves",
    icon: "ph-drop",
    isSpecial: true,
    tokens: ["#07beb8", "#3dccc7", "#68d8d6", "#9ceaef", "#c4fff9"],
  },

  // ── CLASSIC STANDARD HARMONIES ────────────────────────────────────
  {
    id: "sunset",
    name: "Sunset",
    seed: "#f25c54",
    description: "Warm Tangerine & Coral energized highlights",
    icon: "ph-sun-horizon",
  },
  {
    id: "crimson",
    name: "Crimson",
    seed: "#ef233c",
    description: "Bold Scarlet & Ruby intense high-contrast tones",
    icon: "ph-fire",
  },
  {
    id: "violet",
    name: "Violet",
    seed: "#8b5cf6",
    description: "Cyber Lavender & Deep Purple electric glow",
    icon: "ph-sparkle",
  },
  {
    id: "cyan",
    name: "Cyan",
    seed: "#06b6d4",
    description: "Arctic Ice & Neon Teal futuristic accents",
    icon: "ph-drop",
  },
  {
    id: "emerald",
    name: "Emerald",
    seed: "#10b981",
    description: "Fresh Botanical & Cyberpunk Jade aesthetics",
    icon: "ph-plant",
  },
  {
    id: "amber",
    name: "Amber",
    seed: "#f59e0b",
    description: "Honey Sunlight & High-Voltage Warmth",
    icon: "ph-lightning",
  },
  {
    id: "rose",
    name: "Rose",
    seed: "#ec4899",
    description: "Vibrant Flamingo & Synthwave Fuchsia",
    icon: "ph-heart",
  },
  {
    id: "indigo",
    name: "Indigo",
    seed: "#6366f1",
    description: "Deep Space & Modern Tech Indigo precision",
    icon: "ph-planet",
  },
];

/**
 * Normalizes a hex color string into standard 6-digit #RRGGBB format.
 */
export function normalizeHex(hex: string): string {
  if (!hex || typeof hex !== "string") return "#ffffff";
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return "#ffffff";
  }
  return `#${clean.toLowerCase()}`;
}

export function hexToRgbComponents(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex).slice(1);
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}

export function rgbToHexFormat(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const toHex = (v: number) => {
    const h = clamp(v).toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculates WCAG relative luminance (0..1) of an RGB color.
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue2rgb = (p: number, q: number, t: number) => {
    let nt = t;
    if (nt < 0) nt += 1;
    if (nt > 1) nt -= 1;
    if (nt < 1 / 6) return p + (q - p) * 6 * nt;
    if (nt < 1 / 2) return q;
    if (nt < 2 / 3) return p + (q - p) * (2 / 3 - nt) * 6;
    return p;
  };

  const hNorm = (h % 360 + 360) % 360 / 360;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Computes a complete Material You tonal palette from a seed color.
 */
export function generateMaterialPalette(rawSeed: string): MaterialTonalPalette {
  const seed = normalizeHex(rawSeed);

  // Specialized sleek luxury tech aesthetic for Monochrome (Dark: #ffffff, Light: #000000)
  if (seed === "#ffffff") {
    return {
      seed: "#ffffff",
      primary: "#ffffff",
      primaryDark: "#e4e4e7",
      primaryLight: "#ffffff",
      primaryRgb: "255, 255, 255",
      primaryContainer: "rgba(255, 255, 255, 0.12)",
      onPrimary: "#090a0f",
      onPrimaryContainer: "#f4f4f5",
      logoInner: "#090a0f",
      logoWave: "#090a0f",
      logoGlow: "rgba(255, 255, 255, 0.35)",
      surfaceTint: "rgba(255, 255, 255, 0.04)",
      focusRing: "rgba(255, 255, 255, 0.4)",
    };
  }

  if (seed === "#000000") {
    return {
      seed: "#000000",
      primary: "#09090b",
      primaryDark: "#27272a",
      primaryLight: "#3f3f46",
      primaryRgb: "9, 9, 11",
      primaryContainer: "rgba(9, 9, 11, 0.08)",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#09090b",
      logoInner: "#ffffff",
      logoWave: "#ffffff",
      logoGlow: "rgba(0, 0, 0, 0.25)",
      surfaceTint: "rgba(9, 9, 11, 0.04)",
      focusRing: "rgba(9, 9, 11, 0.35)",
    };
  }

  const rgb = hexToRgbComponents(seed);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const luminance = getRelativeLuminance(rgb.r, rgb.g, rgb.b);

  // Generate darker shade for hover/pressed states (lightness -14%)
  const darkL = Math.max(0.12, hsl.l - 0.14);
  const darkRgb = hslToRgb(hsl.h, Math.min(1, hsl.s * 1.05), darkL);
  const primaryDark = rgbToHexFormat(darkRgb.r, darkRgb.g, darkRgb.b);

  // Generate lighter shade for subtle highlights (lightness +14%)
  const lightL = Math.min(0.92, hsl.l + 0.14);
  const lightRgb = hslToRgb(hsl.h, Math.max(0, hsl.s * 0.9), lightL);
  const primaryLight = rgbToHexFormat(lightRgb.r, lightRgb.g, lightRgb.b);

  // High-contrast text on primary: dark on light colors, white on dark colors
  const onPrimary = luminance > 0.48 ? "#121212" : "#ffffff";
  const onPrimaryContainer = luminance > 0.48 ? primaryDark : primaryLight;

  // Logo contrast:
  // Outer squircle is filled with primary color.
  // The inner 'V' chevron stroke requires high contrast against the squircle:
  // If the primary color is bright (e.g. yellow, lime, pale cyan), inner stroke is #121212.
  // If the primary color is dark or vibrant (e.g. crimson, purple, deep blue), inner stroke is #ffffff.
  const logoInner = luminance > 0.45 ? "#121212" : "#ffffff";
  const logoWave = luminance > 0.45 ? "#121212" : "#ffffff";

  return {
    seed,
    primary: seed,
    primaryDark,
    primaryLight,
    primaryRgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    primaryContainer: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
    onPrimary,
    onPrimaryContainer,
    logoInner,
    logoWave,
    logoGlow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`,
    surfaceTint: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)`,
    focusRing: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`,
  };
}

/**
 * Applies the computed palette CSS variables dynamically to the document root.
 */
export function applyMaterialTheme(seedHex: string, paletteId?: string): MaterialTonalPalette {
  const palette = generateMaterialPalette(seedHex);
  if (typeof document === "undefined" || !document.documentElement) {
    return palette;
  }

  const root = document.documentElement;
  root.style.setProperty("--primary-accent", palette.primary);
  root.style.setProperty("--primary-accent-dark", palette.primaryDark);
  root.style.setProperty("--primary-accent-light", palette.primaryLight);
  root.style.setProperty("--primary-accent-rgb", palette.primaryRgb);
  root.style.setProperty("--primary-container", palette.primaryContainer);
  root.style.setProperty("--on-primary", palette.onPrimary);
  root.style.setProperty("--on-primary-container", palette.onPrimaryContainer);
  root.style.setProperty("--logo-inner", palette.logoInner);
  root.style.setProperty("--logo-wave", palette.logoWave);
  root.style.setProperty("--logo-glow", palette.logoGlow);
  root.style.setProperty("--surface-tint", palette.surfaceTint);
  root.style.setProperty("--focus-ring", palette.focusRing);

  if (paletteId) {
    root.setAttribute("data-palette", paletteId);
  }

  return palette;
}

/**
 * Resolves a palette identifier to its seed color (custom or preset).
 */
export function resolveSeedColor(paletteId: string, customHex?: string): string {
  if (paletteId === "custom" && customHex) {
    return normalizeHex(customHex);
  }
  const isLight =
    typeof document !== "undefined" &&
    document.documentElement?.getAttribute("data-theme") === "light";

  switch (paletteId) {
    case "monochrome":
      return isLight ? "#000000" : "#ffffff";
    case "retro-anime":
      return isLight ? "#ff3377" : "#ff5c93";
    case "fresh-green":
      return isLight ? "#40916c" : "#52b788";
    case "muted-earthy":
      return isLight ? "#a06d77" : "#e5989b";
    case "peach-sorbet":
      return isLight ? "#e06868" : "#f08080";
    case "cherry-bloom":
      return isLight ? "#c9184a" : "#ff4d6d";
    case "pink-ombre":
      return isLight ? "#ff0a54" : "#ff477e";
    case "coral-pink":
      return isLight ? "#d44a37" : "#ef6351";
    case "cherry-blossom":
      return isLight ? "#cc444b" : "#da5552";
    case "pastel-greenery":
      return isLight ? "#248277" : "#56ab91";
    case "green-meadow":
      return isLight ? "#538d22" : "#73a942";
    case "green-harmony":
      return isLight ? "#1a7431" : "#2dc653";
    case "turquoise-waters":
      return isLight ? "#07beb8" : "#3dccc7";
    default: {
      const match = PRESET_PALETTES.find((p) => p.id === paletteId);
      return match ? match.seed : "#ffffff";
    }
  }
}
