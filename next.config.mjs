/** @type {import('next').NextConfig} */
const nextConfig = {
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
  output: "standalone",
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
