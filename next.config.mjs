const isDev = process.env.NODE_ENV !== "production";

/**
 * Sent on every response.
 *
 * The CSP allows inline scripts because the App Router streams its payload in
 * inline <script> tags and the layout stamps the theme before paint; moving to
 * nonces is the next step if a third-party script is ever added. Everything
 * else is same-origin only: the console calls its own API, and the upstream
 * publishers are fetched by the server, never the browser.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${isDev ? " ws:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The source caches, agent memory, and the workflow checkpointer are
  // process-local singletons held on globalThis, so every route handler
  // declares `export const runtime = "nodejs"` — the Edge runtime would give
  // each request its own module instance and lose all three.
  reactStrictMode: true,
  /**
   * Trace the server bundle into `.next/standalone`, so the container ships
   * the application and the modules it actually reaches rather than the whole
   * dependency tree. `serverExternalPackages` below is excluded from that
   * trace by design, so the Dockerfile copies those modules explicitly.
   */
  // Vercel packages each route as its own function and sets VERCEL during the
  // build, so the self-contained server bundle is only built elsewhere.
  output: process.env.VERCEL ? undefined : "standalone",
  // Next writes AGENTS.md/CLAUDE.md to the repo root otherwise.
  agentRules: false,
  /**
   * Hosts the dev server will serve `/_next/*` to.
   *
   * Next blocks cross-site requests to those assets in development. It decides
   * "cross-site" by comparing the request's origin against the host the dev
   * server was loaded from, and `localhost` and `127.0.0.1` are different
   * hosts to that check even though they are the same machine. Opening the app
   * on one while the server considers itself the other 403s every chunk, so
   * the HTML renders, React never hydrates, and the page looks like a dead
   * screenshot: nothing clickable, the health poll stuck on "Connecting…".
   *
   * Listing both makes either address work. A LAN address needs adding here
   * too if you open the dev server from another device.
   */
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // better-sqlite3 is a native addon: bundling it breaks the binding lookup,
  // so the checkpointer's driver has to stay an external require at runtime.
  serverExternalPackages: ["better-sqlite3", "@langchain/langgraph-checkpoint-sqlite"],
};

export default nextConfig;
