import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  type Component,
} from "solid-js";
import "./CustomSelect.css";

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: string;
  badge?: string;
}

export interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  class?: string;
  size?: "sm" | "md";
}

let uniqueIdCounter = 0;

export const CustomSelect: Component<CustomSelectProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [focusedIndex, setFocusedIndex] = createSignal(-1);

  const selectId = `custom-select-${++uniqueIdCounter}`;
  const menuId = `${selectId}-menu`;

  let containerRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  const optionRefs: (HTMLDivElement | undefined)[] = [];

  const size = () => props.size || "md";

  const selectedOption = createMemo(() =>
    props.options.find((opt) => opt.value === props.value)
  );

  const selectedIndex = createMemo(() =>
    props.options.findIndex((opt) => opt.value === props.value)
  );

  const toggleDropdown = () => {
    if (props.disabled) return;
    if (!isOpen()) {
      const idx = selectedIndex();
      setFocusedIndex(idx >= 0 ? idx : 0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (val: string) => {
    if (props.disabled) return;
    props.onChange(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return;

    if (!isOpen()) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        const idx = selectedIndex();
        setFocusedIndex(idx >= 0 ? idx : 0);
        setIsOpen(true);
      }
      return;
    }

    // When dropdown is open
    const optsCount = props.options.length;
    if (optsCount === 0) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;

      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % optsCount);
        break;

      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + optsCount) % optsCount);
        break;

      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;

      case "End":
        e.preventDefault();
        setFocusedIndex(optsCount - 1);
        break;

      case "Enter":
      case " ": {
        e.preventDefault();
        const currentIdx = focusedIndex();
        if (currentIdx >= 0 && currentIdx < optsCount) {
          handleSelect(props.options[currentIdx].value);
        }
        break;
      }

      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  // Scroll active option into view when navigating via keyboard
  createEffect(() => {
    const idx = focusedIndex();
    if (isOpen() && idx >= 0 && optionRefs[idx]) {
      const el = optionRefs[idx];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  });

  // Handle click outside to close dropdown
  onMount(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    });
  });

  return (
    <div
      ref={containerRef}
      class={`custom-select-container custom-select-size-${size()} ${
        isOpen() ? "is-open" : ""
      } ${props.disabled ? "is-disabled" : ""} ${props.class || ""}`}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen()}
        aria-controls={menuId}
        aria-disabled={props.disabled}
        tabIndex={props.disabled ? -1 : 0}
        class="custom-select-trigger"
        onClick={toggleDropdown}
      >
        <div class="custom-select-trigger-content">
          <Show when={selectedOption()?.icon}>
            <i class={`custom-select-trigger-icon ${selectedOption()!.icon}`} />
          </Show>
          <span
            class={`custom-select-trigger-label ${
              !selectedOption() ? "custom-select-placeholder" : ""
            }`}
          >
            {selectedOption()
              ? selectedOption()!.label
              : props.placeholder || "Select an option..."}
          </span>
          <Show when={selectedOption()?.badge}>
            <span class="custom-select-badge">{selectedOption()!.badge}</span>
          </Show>
        </div>
        <i
          class={`ph-bold ph-caret-down custom-select-chevron ${
            isOpen() ? "open" : ""
          }`}
        />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        class={`custom-select-menu ${
          isOpen() ? "custom-select-menu-open" : ""
        }`}
        role="listbox"
        aria-label={selectedOption()?.label || "Select menu"}
        tabIndex={-1}
      >
        <For each={props.options}>
          {(opt, idx) => {
            const isSelected = () => opt.value === props.value;
            const isFocused = () => idx() === focusedIndex();

            return (
              <div
                ref={(el) => (optionRefs[idx()] = el)}
                id={`${menuId}-opt-${idx()}`}
                role="option"
                aria-selected={isSelected()}
                class={`custom-select-option ${
                  isSelected() ? "selected" : ""
                } ${isFocused() ? "focused" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.value);
                }}
                onMouseEnter={() => setFocusedIndex(idx())}
              >
                <div class="custom-select-option-left">
                  <Show when={opt.icon}>
                    <i class={`custom-select-option-icon ${opt.icon}`} />
                  </Show>
                  <span class="custom-select-option-label">{opt.label}</span>
                </div>
                <div class="custom-select-option-right">
                  <Show when={opt.badge}>
                    <span class="custom-select-badge">{opt.badge}</span>
                  </Show>
                  <Show when={isSelected()}>
                    <i class="ph-bold ph-check custom-select-check" />
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default CustomSelect;
