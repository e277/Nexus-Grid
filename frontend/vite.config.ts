import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The dev server proxies /api/* to the FastAPI backend so the app can use
// same-origin requests in development. BACKEND_URL is set in docker-compose
// so the proxy targets the `web` container; locally it falls back to localhost.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawTarget = env.BACKEND_URL ?? env.VITE_BACKEND_URL ?? "http://web:8005";
  const proxyTarget = rawTarget === "http://localhost:8005" ? "http://web:8005" : rawTarget;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
