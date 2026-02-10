import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/yarborough/" : "/",
  plugins: [wasm(), topLevelAwait(), react(), tailwindcss()],
  server: {
    watch: {
      // Watch the wasm-pack output directory (gitignored, so Vite may skip it)
      ignored: ["!**/crates/*/pkg/**"],
    },
  },
}));
