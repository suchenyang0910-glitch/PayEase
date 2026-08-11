import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@payease/shared-money": fileURLToPath(
        new URL("../shared-money/src/index.ts", import.meta.url),
      ),
    },
  },
});
