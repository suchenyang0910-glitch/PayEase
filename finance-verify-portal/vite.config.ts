import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    (): PluginOption => ({
      name: "payease-finance-verify-security-headers-s0-5",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("X-Frame-Options", "DENY");
          res.setHeader(
            "Content-Security-Policy",
            "default-src 'self'; " +
              "script-src 'self'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; " +
              "font-src 'self' data:; " +
              "connect-src 'self'; " +
              "frame-ancestors 'none'; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self';",
          );
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains; preload",
          );
          res.setHeader("Referrer-Policy", "no-referrer");
          res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
          );
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("X-Frame-Options", "DENY");
          res.setHeader("Content-Security-Policy", "frame-ancestors 'none';");
          next();
        });
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
