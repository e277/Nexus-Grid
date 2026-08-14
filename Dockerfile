# Nexus-Grid: the console and the agent runtime, one service.
#
# Debian slim rather than Alpine throughout. `better-sqlite3` is a native
# addon, and the workflow checkpointer loads it at runtime to keep a paused
# approval gate resumable across restarts; on musl it has to be rebuilt from
# source and the resulting binding is the kind of thing that works on the
# machine that built it and nowhere else. Every stage shares one base so the
# addon is compiled against exactly the runtime that will load it.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# python3/make/g++ are for better-sqlite3's node-gyp build. They stay in this
# stage; the runtime image below never sees a compiler.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next reads .env at build time for anything inlined into the client bundle.
# Nothing here is: every secret is read server-side through getSettings(), so
# the image carries no configuration and the same image runs any deployment.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5180
ENV HOSTNAME=0.0.0.0

# Next's standalone output carries its own minimal node_modules, but the
# checkpointer's driver is deliberately excluded from the bundle
# (serverExternalPackages), so it has to be copied as a real module.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build /app/node_modules/bindings ./node_modules/bindings
COPY --from=build /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# The checkpoint database lives here, mounted as a volume by compose so a
# paused approval gate survives the container being replaced.
RUN mkdir -p /app/.nexus-grid && chown -R node:node /app/.nexus-grid

USER node
EXPOSE 5180

# Answers as soon as the process is serving; the source caches warm behind it
# and each publisher reports its own state in the console.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:5180/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
