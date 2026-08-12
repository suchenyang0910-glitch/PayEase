import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

const headers = (): PluginOption => ({
  name: "payease-broker-security-headers",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
      next();
    });
  },
});
export default defineConfig({ plugins: [react(), headers()] });
