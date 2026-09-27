import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { AiPaywall } from "../components/AiPaywall";
import { isAiUnlocked, setIsAiUnlocked } from "../store";

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
