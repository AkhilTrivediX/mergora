import type { Preview } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import "./preview.css";

function stringGlobal(globals: Record<string, unknown>, key: string, fallback: string): string {
  const value = globals[key];
  return typeof value === "string" ? value : fallback;
}

function setOptionalAttribute(
  root: HTMLElement,
  name: string,
  value: string,
  omittedValue: string,
): void {
  if (value === omittedValue) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const root = document.documentElement;
      setOptionalAttribute(
        root,
        "data-theme",
        stringGlobal(context.globals, "theme", "light"),
        "system",
      );
      setOptionalAttribute(
        root,
        "data-contrast",
        stringGlobal(context.globals, "contrast", "standard"),
        "standard",
      );
      setOptionalAttribute(
        root,
        "data-density",
        stringGlobal(context.globals, "density", "comfortable"),
        "comfortable",
      );
      setOptionalAttribute(
        root,
        "data-motion",
        stringGlobal(context.globals, "motion", "full"),
        "full",
      );
      setOptionalAttribute(
        root,
        "data-viewport",
        stringGlobal(context.globals, "viewportMode", "responsive"),
        "responsive",
      );
      root.dir = stringGlobal(context.globals, "direction", "ltr") === "rtl" ? "rtl" : "ltr";
      return Story();
    },
  ],
  globalTypes: {
    theme: {
      description: "Mergora color theme",
      defaultValue: "light",
      toolbar: {
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "system", title: "System" },
        ],
      },
    },
    contrast: {
      description: "Contrast and forced-color token presentation",
      defaultValue: "standard",
      toolbar: {
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "standard", title: "Standard contrast" },
          { value: "enhanced", title: "Enhanced contrast" },
          { value: "forced-colors", title: "Forced-color token preview" },
        ],
      },
    },
    density: {
      description: "Mergora density",
      defaultValue: "comfortable",
      toolbar: {
        icon: "grow",
        dynamicTitle: true,
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
          { value: "touch", title: "Touch" },
        ],
      },
    },
    direction: {
      description: "Document direction",
      defaultValue: "ltr",
      toolbar: {
        icon: "transfer",
        dynamicTitle: true,
        items: [
          { value: "ltr", title: "Left to right" },
          { value: "rtl", title: "Right to left" },
        ],
      },
    },
    motion: {
      description: "Motion preference preview",
      defaultValue: "full",
      toolbar: {
        icon: "time",
        dynamicTitle: true,
        items: [
          { value: "full", title: "Full motion" },
          { value: "reduced", title: "Reduced motion" },
        ],
      },
    },
    viewportMode: {
      description: "Responsive canvas width",
      defaultValue: "responsive",
      toolbar: {
        icon: "mobile",
        dynamicTitle: true,
        items: [
          { value: "responsive", title: "Responsive canvas" },
          { value: "mobile", title: "Mobile · 390px" },
          { value: "narrow", title: "Narrow · 320px" },
        ],
      },
    },
  },
  parameters: {
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};

export default preview;
