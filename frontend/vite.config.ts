import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies /api/* to the FastAPI backend so the app can use
// same-origin requests in development. BACKEND_URL is set in docker-compose
// so the proxy targets the `web` container; locally it falls back to localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:8005",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
