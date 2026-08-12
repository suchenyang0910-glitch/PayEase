import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@payease/shared-money": fileURLToPath(
        new URL("../packages/shared-money/src/index.ts", import.meta.url),
      ),
      "@payease/shared-security": fileURLToPath(
        new URL("../packages/shared-security/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    reporters: ["default"],
  },
});
