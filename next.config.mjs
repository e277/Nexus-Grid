/** @type {import('next').NextConfig} */
const nextConfig = {
  // The source caches, agent memory, and the workflow checkpointer are
  // process-local singletons held on globalThis, so every route handler
  // declares `export const runtime = "nodejs"` — the Edge runtime would give
  // each request its own module instance and lose all three.
  reactStrictMode: true,
  // Next writes AGENTS.md/CLAUDE.md to the repo root otherwise.
  agentRules: false,
  // better-sqlite3 is a native addon: bundling it breaks the binding lookup,
  // so the checkpointer's driver has to stay an external require at runtime.
  serverExternalPackages: ["better-sqlite3", "@langchain/langgraph-checkpoint-sqlite"],
};

export default nextConfig;
