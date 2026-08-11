/** @type {import('next').NextConfig} */
const nextConfig = {
  // Agents, the workflow graph, and the in-memory store are process-local
  // singletons, so every route handler must run on the Node.js runtime
  // (never the Edge runtime, which would give each request its own module
  // instance). Route handlers declare `export const runtime = "nodejs"`.
  reactStrictMode: true,
  // Next generates AGENTS.md/CLAUDE.md at the repo root otherwise.
  agentRules: false,
};

export default nextConfig;
