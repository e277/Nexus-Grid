#!/usr/bin/env node
// Mint an API token for a service account.
//
//   npm run token:new -- <name> <viewer|operator|admin>
//
// Prints the token once, for the integration to hold, and the AUTH_API_TOKENS
// entry for the server, which stores only its SHA-256.
import { createHash, randomBytes } from "node:crypto";

const [name, role = "viewer"] = process.argv.slice(2);
if (!name || !/^[\w.-]+$/.test(name) || !["viewer", "operator", "admin"].includes(role)) {
  console.error("Usage: npm run token:new -- <name> <viewer|operator|admin>");
  process.exit(1);
}

const token = `ngk_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(token).digest("hex");

console.log(`Token (give this to the integration; it is not shown again):\n  ${token}\n`);
console.log(`Add to AUTH_API_TOKENS (comma-separated with any others):\n  ${name}:${role}:${hash}`);
