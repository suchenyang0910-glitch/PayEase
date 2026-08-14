import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests must exercise the TypeScript source, not ignored JavaScript emitted
  // by a past local tsc run. Keep this in sync with vite.config.ts.
  resolve: { extensions: [".tsx", ".ts", ".jsx", ".js", ".json"] },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
});
