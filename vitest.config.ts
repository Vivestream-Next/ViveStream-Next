import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin({ hot: false })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    fsModuleCache: true,
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
    deps: {
      optimizer: {
        client: {
          include: ["solid-js"],
        },
      },
    },
  },
  resolve: {
    conditions: ["development", "browser"],
  },
  ssr: {
    resolve: {
      conditions: ["development", "browser"],
    },
  },
});
