import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Prefer source files over stale ignored JavaScript emitted by tsc.
  resolve: { extensions: [".tsx", ".ts", ".jsx", ".js", ".json"] },
});
