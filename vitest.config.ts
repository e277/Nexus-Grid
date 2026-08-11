import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suite covers the server-side logic that decides things — the graph
    // runtime, the projection, the caching rules. Anything that reaches a
    // public API is verified against the real thing, not mocked here.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
