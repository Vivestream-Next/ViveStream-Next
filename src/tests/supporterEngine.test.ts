import { describe, it, expect, beforeEach } from "vitest";
import {
  computeSupporterTier,
  SUPPORTER_BADGES,
  supporterWatchSeconds,
  supporterAdsCompleted,
  supporterTier,
  addSupporterWatchSeconds,
  recordCompletedAd,
  updateSupporterAutoLoop,
  updateSupporterMuted,
  supporterAutoLoop,
  supporterMuted,
  resetSupporterStats,
  type SupporterTierId,
} from "../store";

describe("Supporter Engine & Badge Progression", () => {
  beforeEach(() => {
    resetSupporterStats();
  });

  it("calculates correct supporter tiers based on watch time and completed ads", () => {
    expect(computeSupporterTier(0, 0)).toBe("none");
    expect(computeSupporterTier(59, 0)).toBe("none");

    // Tier 1: Spark (60s or 1 ad)
    expect(computeSupporterTier(60, 0)).toBe("spark");
    expect(computeSupporterTier(0, 1)).toBe("spark");

    // Tier 2: Copper (300s or 5 ads)
    expect(computeSupporterTier(300, 0)).toBe("copper");
    expect(computeSupporterTier(0, 5)).toBe("copper");

    // Tier 3: Silver (900s or 15 ads)
    expect(computeSupporterTier(900, 0)).toBe("silver");
    expect(computeSupporterTier(0, 15)).toBe("silver");

    // Tier 4: Gold (1800s or 30 ads)
    expect(computeSupporterTier(1800, 0)).toBe("gold");
    expect(computeSupporterTier(0, 30)).toBe("gold");

    // Tier 5: Obsidian (3600s or 60 ads)
    expect(computeSupporterTier(3600, 0)).toBe("obsidian");
    expect(computeSupporterTier(0, 60)).toBe("obsidian");
  });

  it("provides comprehensive metadata for all badge tiers", () => {
    const tiers: SupporterTierId[] = ["none", "spark", "copper", "silver", "gold", "obsidian"];
    for (const tier of tiers) {
      const badge = SUPPORTER_BADGES[tier];
      expect(badge).toBeDefined();
      expect(badge.id).toBe(tier);
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.color).toMatch(/^#/);
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.respectTag.length).toBeGreaterThan(0);
    }
  });

  it("accumulates watch time and completed ads correctly", () => {
    expect(supporterWatchSeconds()).toBe(0);
    expect(supporterAdsCompleted()).toBe(0);
    expect(supporterTier()).toBe("none");

    addSupporterWatchSeconds(30);
    expect(supporterWatchSeconds()).toBe(30);
    expect(supporterTier()).toBe("none");

    addSupporterWatchSeconds(35);
    expect(supporterWatchSeconds()).toBe(65);
    expect(supporterTier()).toBe("spark");

    recordCompletedAd();
    recordCompletedAd();
    recordCompletedAd();
    recordCompletedAd();
    recordCompletedAd();
    expect(supporterAdsCompleted()).toBe(5);
    expect(supporterTier()).toBe("copper");
  });

  it("toggles auto-loop and mute preferences", () => {
    updateSupporterAutoLoop(false);
    expect(supporterAutoLoop()).toBe(false);
    updateSupporterAutoLoop(true);
    expect(supporterAutoLoop()).toBe(true);

    updateSupporterMuted(false);
    expect(supporterMuted()).toBe(false);
    updateSupporterMuted(true);
    expect(supporterMuted()).toBe(true);
  });

  it("resets supporter stats completely", () => {
    addSupporterWatchSeconds(120);
    recordCompletedAd();
    expect(supporterWatchSeconds()).toBe(120);
    expect(supporterAdsCompleted()).toBe(1);

    resetSupporterStats();
    expect(supporterWatchSeconds()).toBe(0);
    expect(supporterAdsCompleted()).toBe(0);
    expect(supporterTier()).toBe("none");
  });
});
