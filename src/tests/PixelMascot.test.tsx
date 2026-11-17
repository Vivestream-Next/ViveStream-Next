import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import {
  PixelMascot,
  SakuraPixelSvg,
  NekoPixelSvg,
  BytePixelSvg,
} from "../components/PixelMascot";
import {
  showPixelMascot,
  setShowPixelMascot,
  pixelMascotCharacter,
  updatePixelMascotCharacter,
} from "../store";

describe("PixelMascot Components", () => {
  beforeEach(() => {
    setShowPixelMascot(true);
    updatePixelMascotCharacter("sakura");
  });

  it("renders SVG pixel art for all three mascots with crisp pixel edges", () => {
    const { container: sakuraContainer } = render(() => <SakuraPixelSvg />);
    const sakuraSvg = sakuraContainer.querySelector("svg");
    expect(sakuraSvg).not.toBeNull();
    expect(sakuraSvg?.getAttribute("shape-rendering")).toBe("crispEdges");

    const { container: nekoContainer } = render(() => <NekoPixelSvg />);
    const nekoSvg = nekoContainer.querySelector("svg");
    expect(nekoSvg).not.toBeNull();
    expect(nekoSvg?.getAttribute("shape-rendering")).toBe("crispEdges");

    const { container: byteContainer } = render(() => <BytePixelSvg />);
    const byteSvg = byteContainer.querySelector("svg");
    expect(byteSvg).not.toBeNull();
    expect(byteSvg?.getAttribute("shape-rendering")).toBe("crispEdges");
  });

  it("renders PixelMascot when showPixelMascot is true", () => {
    const { getByRole } = render(() => <PixelMascot />);
    const mascotBtn = getByRole("button", { name: /sakura-chan/i });
    expect(mascotBtn).toBeDefined();
  });

  it("opens speech bubble when mascot is clicked and displays retro quotes", () => {
    const { getByRole, queryByRole } = render(() => <PixelMascot />);
    expect(queryByRole("dialog")).toBeNull();

    const mascotBtn = getByRole("button", { name: /sakura-chan/i });
    fireEvent.click(mascotBtn);

    const dialog = queryByRole("dialog");
    expect(dialog).not.toBeNull();
  });

  it("cycles between Sakura, Neko, and Byte characters cleanly", () => {
    expect(pixelMascotCharacter()).toBe("sakura");
    updatePixelMascotCharacter("neko");
    expect(pixelMascotCharacter()).toBe("neko");
    updatePixelMascotCharacter("byte");
    expect(pixelMascotCharacter()).toBe("byte");
  });
});
