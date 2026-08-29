import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { pyodideAssets } from "./vite.pyodide-assets";

export default defineConfig({
  optimizeDeps: { exclude: ["pyodide"] },
  plugins: [pyodideAssets(), react(), tailwindcss()],
  worker: { format: "es" },
  test: {
    include: ["src/**/*.browser.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
