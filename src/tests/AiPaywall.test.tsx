import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { AiPaywall } from "../components/AiPaywall";
import { isAiUnlocked, setIsAiUnlocked } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: any) => {
    if (cmd === "activate_lemon_license") {
      if (args?.licenseKey === "VIVESTREAM-PRO-PREVIEW") {
        return Promise.resolve({
          license_key: "VIVESTREAM-PRO-PREVIEW",
          instance_id: "preview-instance",
          is_active: true,
          status: "active",
          plan: "Developer Preview",
          customer_name: "Developer",
          customer_email: "dev@vivestream.internal",
          activated_at: new Date().toISOString(),
          expires_at: null,
        });
      }
      return Promise.reject(new Error("Invalid license key"));
    }
    if (cmd === "get_lemon_checkout_url") {
      return Promise.resolve("https://vivestream.lemonsqueezy.com/buy/demo");
    }
    return Promise.resolve();
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

describe("AiPaywall Component", () => {
  beforeEach(() => {
    setIsAiUnlocked(false);
  });

  it("renders paywall details with 6-month payment window and Lemon Squeezy notice", () => {
    render(() => <AiPaywall />);

    expect(screen.getByText("ViveStream AI Studio Pro")).toBeDefined();
    expect(screen.getByText("Semi-Annual Pro Pass")).toBeDefined();
    expect(screen.getByText("Every 6 Months")).toBeDefined();
    expect(screen.getByText(/Payments securely processed via Lemon Squeezy/i)).toBeDefined();
    expect(screen.getByText("PAYWALL LOCKED")).toBeDefined();
  });

  it("toggles key input and successfully activates with dev key", async () => {
    render(() => <AiPaywall />);

    const keyToggleBtn = screen.getByText("I Have a License Key");
    fireEvent.click(keyToggleBtn);

    const input = screen.getByPlaceholderText("e.g. VIVE-XXXX-XXXX-XXXX") as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.input(input, { target: { value: "VIVESTREAM-PRO-PREVIEW" } });

    const activateBtn = screen.getByText("Activate");
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(isAiUnlocked()).toBe(true);
    });
  });

  it("shows error when activating empty or invalid key", async () => {
    render(() => <AiPaywall />);

    const keyToggleBtn = screen.getByText("I Have a License Key");
    fireEvent.click(keyToggleBtn);

    const activateBtn = screen.getByText("Activate");
    fireEvent.click(activateBtn);

    expect(screen.getByText("Please enter a valid license key.")).toBeDefined();
    expect(isAiUnlocked()).toBe(false);
  });
});
