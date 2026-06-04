import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    environmentMatch: {
      "tests/unit/renderer/**": "jsdom",
      "tests/integration/renderer/**": "jsdom",
    },
    coverage: {
      provider: "v8",
      include: ["electron/**", "src/**"],
      exclude: ["src/vite-env.d.ts"],
    },
  },
})
