# VM deploy bundle — one-time bootstrap, then every push to `main` deploys itself

These files set up the VM that hosts the running Nexus-Grid console.
Run the bootstrap steps **once** on a fresh Debian 12 host. After that,
every push to `main` runs `.github/workflows/nextjs.yml`, which builds,
ships, and verifies the deploy over SSH.

## What you'll need

- A Debian 12 (bookworm) VM, reachable from the GitHub Actions runner.
- A DNS A record pointing a hostname at the VM (e.g. `nexus.example.com`).
- An SSH keypair. The **public** half goes on the VM in
  `deploy@host:~/.ssh/authorized_keys`; the **private** half becomes the
  `VM_SSH_KEY` repo secret.

## 1. Install packages

```bash
apt-get update && apt-get install -y --no-install-recommends \
  nginx certbot python3-certbot-nginx rsync openssh-server ufw \
  ca-certificates curl gnupg jq
# Node 22 from NodeSource, matching the GitHub Actions runner and the
# Dockerfile's node:22-bookworm-slim runtime.
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

## 2. Create users

```bash
# Service user — never logs in, owns /opt/nexus-grid and its state.
useradd --system --home /opt/nexus-grid --shell /usr/sbin/nologin \
  --comment "Nexus-Grid app" nexus-grid

# Deploy user — owns the GitHub Actions SSH key, passwordless sudo
# limited to the deploy script and a few systemctl subcommands.
useradd --system --home /var/lib/deploy --shell /bin/bash --create-home \
  --comment "GH Actions deploy" deploy
mkdir -p /var/lib/deploy/.ssh
chmod 700 /var/lib/deploy/.ssh
echo "ssh-ed25519 AAAA…  github-actions-deploy" \
  > /var/lib/deploy/.ssh/authorized_keys
chmod 600 /var/lib/deploy/.ssh/authorized_keys
chown -R deploy:deploy /var/lib/deploy/.ssh
```

## 3. Place the bundle files

Copy this directory onto the VM and run the commands below. From the VM
shell, after `rsync`-ing or `scp`-ing `deploy/vm/` somewhere:

```bash
# sudoers — drop straight in (sudo reads sudoers.d/* at the right moment).
install -m 0440 deploy/vm/sudoers /etc/sudoers.d/nexus-grid-deploy

# systemd units
install -m 0644 deploy/vm/nexus-grid.service /etc/systemd/system/nexus-grid.service
install -m 0644 deploy/vm/openclaw.service   /etc/systemd/system/openclaw.service

# nginx config — set `server_name` first.
sed -i 's/nexus.example.com/YOUR.HOSTNAME.HERE/g' deploy/vm/nginx.conf
install -m 0644 deploy/vm/nginx.conf /etc/nginx/sites-available/nexus-grid.conf
ln -sf /etc/nginx/sites-available/nexus-grid.conf \
       /etc/nginx/sites-enabled/nexus-grid.conf
rm -f /etc/nginx/sites-enabled/default

# deploy script
install -d /opt/nexus-grid/bin
install -m 0750 deploy/vm/deploy.sh /opt/nexus-grid/bin/deploy.sh

# OpenClaw container
install -d /opt/openclaw
install -m 0644 deploy/vm/docker-compose.yml /opt/openclaw/docker-compose.yml

# app env (no secrets; mode 0640 root:nexus-grid)
install -d /etc/nexus-grid
install -m 0640 deploy/vm/nexus-grid.env.example /etc/nexus-grid/nexus-grid.env
chown root:nexus-grid /etc/nexus-grid/nexus-grid.env
```

Edit `/etc/nexus-grid/nexus-grid.env` to set `ENVIRONMENT=production` and
any LLM keys you want active. The `OPENCLAW_GATEWAY_TOKEN` line stays
commented — the gateway token lives in a separate file (next step).

## 4. OpenClaw gateway token

Generate a token using the gateway's own CLI inside its container
(command name depends on the pinned image version — check
`docker run --rm ghcr.io/openclaw/openclaw --help`). The token is full
operator access to the dashboard; treat it like a private API key.

Persist it to its own EnvironmentFile:

```bash
install -d /etc/openclaw
# Write only OPENCLAW_GATEWAY_TOKEN=<value>, nothing else, no comments.
umask 0337
install -m 0640 /dev/stdin /etc/openclaw/gateway.token <<EOF
OPENCLAW_GATEWAY_TOKEN=PASTE_THE_TOKEN_HERE
EOF
chown root:openclaw /etc/openclaw/gateway.token 2>/dev/null || \
  groupadd --system openclaw && chown root:openclaw /etc/openclaw/gateway.token
```

Rotating the token: re-run the install block above with the new value,
then `systemctl restart nexus-grid` (the systemd `EnvironmentFile=` chain
is only re-read on restart, not on reload).

## 5. Directory layout

Create the persistent state directories. These live OUTSIDE the release
directories so a rollback cannot lose a paused approval gate.

```bash
install -d -o nexus-grid -g nexus-grid -m 0750 /opt/nexus-grid/releases
install -d -o nexus-grid -g nexus-grid -m 0750 /opt/nexus-grid/.nexus-grid
install -d -o deploy    -g deploy    -m 0750 /opt/nexus-grid/staging
# current starts as a dangling symlink; the first deploy fills it.
ln -sfn /opt/nexus-grid/releases/.pending /opt/nexus-grid/current
```

## 6. Obtain the TLS cert

```bash
certbot --nginx -d YOUR.HOSTNAME.HERE
# Auto-renewal is installed by the certbot package; nothing to do.
```

## 7. Firewall

```bash
ufw default deny incoming
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw enable
```

Port 5180 closed externally. Port 18789 closed externally.

## 8. Reload systemd and start

```bash
systemctl daemon-reload
systemctl enable --now openclaw.service
systemctl enable --now nexus-grid.service
# First run will fail because /opt/nexus-grid/current is the placeholder
# symlink. The first GitHub Actions deploy creates the real release
# directory and restarts the service.
```

## 9. GitHub repo secrets

In `Settings → Secrets and variables → Actions`:

| Secret | Value |
|---|---|
| `VM_SSH_HOST` | The VM hostname, e.g. `nexus.example.com` |
| `VM_SSH_USER` | `deploy` |
| `VM_SSH_KEY`  | The **private** half of the deploy keypair |
| `VM_PUBLIC_URL` | `https://YOUR.HOSTNAME.HERE` |

## 10. First deploy

From the Actions tab, run the **Deploy to VM** workflow (`workflow_dispatch`).
Watch the `build` job — confirm the "Compose release directory" step prints
the `.env`-stripping `find … -delete` line. Watch the `deploy` job — it
should land the tarball, run `deploy.sh`, and the verify step should print
`OK /api/health` + `OK /api/health/db` + `pid stable: <n>`.

After the first successful deploy:

```bash
# Confirm the app is running on the loopback bind.
ss -ltnp | grep ':5180'
# Confirm the gateway is reachable only on loopback.
ss -ltnp | grep ':18789'
# Confirm cert auto-renewal is scheduled.
systemctl list-timers | grep certbot
```

## Ongoing operations

- **Logs:** `journalctl -u nexus-grid -f`, `journalctl -u openclaw -f`.
- **Manual rollback:** list `/opt/nexus-grid/releases/`, pick a known-good
  timestamp, then:
  ```bash
  sudo ln -sfn /opt/nexus-grid/releases/<known-good> /opt/nexus-grid/current
  sudo systemctl restart nexus-grid
  ```
- **OpenClaw token rotation:** rewrite `/etc/openclaw/gateway.token`,
  then `sudo systemctl restart nexus-grid`.
- **Workflow rollback input:** the `workflow_dispatch` input
  `rollback_to` is declared but not yet wired to a script. For now roll
  back from the VM shell using the commands above.
