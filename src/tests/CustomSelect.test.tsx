import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { CustomSelect, CustomSelectOption } from "../components/CustomSelect";

describe("CustomSelect Component", () => {
  const sampleOptions: CustomSelectOption[] = [
    { value: "opt1", label: "Option One", icon: "ph-bold ph-cube", badge: "New" },
    { value: "opt2", label: "Option Two", icon: "ph-bold ph-lightning" },
    { value: "opt3", label: "Option Three" },
  ];

  it("renders trigger with active option label, icon, and badge", () => {
    const { getByRole, getAllByText } = render(() => (
      <CustomSelect
        value="opt1"
        onChange={() => {}}
        options={sampleOptions}
      />
    ));

    const trigger = getByRole("combobox");
    expect(trigger).toBeDefined();
    expect(getAllByText("Option One").length).toBeGreaterThan(0);
    expect(getAllByText("New").length).toBeGreaterThan(0);
  });

  it("opens menu when trigger is clicked and fires onChange when option selected", () => {
    const handleChange = vi.fn();
    const { getByRole, getAllByText } = render(() => (
      <CustomSelect
        value="opt1"
        onChange={handleChange}
        options={sampleOptions}
      />
    ));

    const trigger = getByRole("combobox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const optionTwoList = getAllByText("Option Two");
    fireEvent.click(optionTwoList[0]);

    expect(handleChange).toHaveBeenCalledWith("opt2");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("supports keyboard navigation with Arrow keys and Enter", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(() => (
      <CustomSelect
        value="opt1"
        onChange={handleChange}
        options={sampleOptions}
      />
    ));

    const trigger = getByRole("combobox");

    // Open via Enter
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Navigate down
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    // Select via Enter
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(handleChange).toHaveBeenCalledWith("opt2");
  });

  it("closes on Escape key press", () => {
    const { getByRole } = render(() => (
      <CustomSelect
        value="opt1"
        onChange={() => {}}
        options={sampleOptions}
      />
    ));

    const trigger = getByRole("combobox");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("respects disabled prop", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(() => (
      <CustomSelect
        disabled={true}
        value="opt1"
        onChange={handleChange}
        options={sampleOptions}
      />
    ));

    const trigger = getByRole("combobox");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(handleChange).not.toHaveBeenCalled();
  });
});
