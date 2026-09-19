import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { pyodideAssets } from "./vite.pyodide-assets";

export default defineConfig({
  optimizeDeps: { exclude: ["pyodide"] },
  plugins: [pyodideAssets(), react(), tailwindcss()],
  worker: { format: "es" },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "src/**/*.browser.test.ts"],
    // The committed Z3 module is eleven megabytes on one line; letting Node
    // import it directly instead of running it through Vite's transform turns
    // forty seconds of test start-up into half a second.
    server: { deps: { external: [/\/src\/z3\/wasm\/z3\.mjs$/] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
