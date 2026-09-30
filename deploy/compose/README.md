# Server deploy: Docker Compose, one-time setup

After this setup, every push to `main` runs `.github/workflows/nextjs.yml`.
That workflow copies the source to the server, runs `docker compose up -d --build`,
and checks `/api/health` and `/api/health/db` over HTTPS.

The server runs the same stack as `docker-compose.yml` on a laptop: the app and
the OpenClaw gateway share one network namespace, and the checkpoint database
lives on a named volume. `docker-compose.prod.yml` in this directory adds
Caddy, which serves the console on 443 with a Let's Encrypt certificate.

## What you need

- A Linux server (Debian 12 or Ubuntu 24.04) with **at least 2 GB RAM**. The
  Next.js build runs on the server; on 1 GB add swap (step 1).
- A hostname whose DNS A record points at the server, e.g. `nexus.example.com`.
- Ports 22, 80 and 443 open to the internet.

## 1. Install Docker

As root:

```bash
curl -fsSL https://get.docker.com | sh

# Only if the server has less than 2 GB RAM:
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Create the deploy user

```bash
useradd --create-home --shell /bin/bash --groups docker deploy
mkdir -p /opt/nexus-grid && chown deploy:deploy /opt/nexus-grid

# On your own machine: ssh-keygen -t ed25519 -f nexus-deploy -N ""
# Put the PUBLIC half (nexus-deploy.pub) here:
mkdir -p /home/deploy/.ssh
echo "ssh-ed25519 AAAA… github-actions-deploy" > /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

Membership in the `docker` group is root-equivalent on this server. Use this
user for deploys and nothing else.

## 3. Write the server's `.env`

Deploys never overwrite this file. Create `/opt/nexus-grid/.env` as `deploy`:

```bash
cat > /opt/nexus-grid/.env <<'EOF'
# Public hostname for Caddy (no scheme)
SITE_ADDRESS=nexus.example.com

# Shared by the app and the gateway: full operator access, keep it secret
OPENCLAW_GATEWAY_TOKEN=<output of: openssl rand -hex 32>

# Optional. Without a key the app falls back to rule-derived output.
MINIMAX_API_KEY=
EOF
chmod 600 /opt/nexus-grid/.env
```

See `.env.example` in the repo root for every other setting.

## 4. Add the GitHub secrets

In the repo, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `VM_SSH_HOST` | `nexus.example.com` (or the server IP) |
| `VM_SSH_USER` | `deploy` |
| `VM_SSH_KEY` | full contents of the **private** key file `nexus-deploy` |
| `VM_PUBLIC_URL` | `https://nexus.example.com` |

## 5. Deploy

Push to `main`, or go to **Actions → Deploy → Run workflow**. The first run
takes longest: it pulls the base images, builds the app, and Caddy requests
the certificate.

## Day to day

From `/opt/nexus-grid` on the server:

```bash
C="docker compose -f docker-compose.yml -f deploy/compose/docker-compose.prod.yml"
$C ps                    # what's running
$C logs -f app           # follow the app
cat REVISION             # commit currently deployed
$C run --rm cli channels status   # gateway CLI
```

**Rollback:** revert the bad commit on `main` and push. The workflow builds
and deploys the reverted tree.

**Gateway restarts:** the app shares the gateway's network namespace. If you
restart the gateway by hand, restart the app too (`$C restart gateway app`),
or the app loses its networking.

**Data:** paused approval gates are in the `nexus-grid-state` volume and
certificates are in `caddy-data`. Neither is touched by a deploy. Don't run
`docker compose down -v` unless you mean to delete both.
