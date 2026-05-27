# 🐳 Server Docker Stacks

Docker Compose configs for all services running in `/opt/stacks` on the home server.
No `.env` files are included — secrets live in the encrypted weekly backup.

For restoration instructions, see **[Phase 3 — Docker & Finalize](https://github.com/gravi-ctrl/homelab-blueprint#phase-3--docker--finalize)** in homelab-blueprint.

---

## 🗂️ Stacks

| Stack | What it does | Notes |
|---|---|---|
| **arrs** | Sonarr + Radarr + Prowlarr + Bazarr — media automation suite | All behind NPM, no direct port exposure |
| **audiobookshelf** | Audiobook & podcast server | |
| **dockge** | Docker Compose stack manager (UI) | First stack to bring up on restore |
| **glances** | Real-time system resource monitor | Internal access only |
| **homepage** | Personal dashboard | Links to all services |
| **jellyfin** | Media server — movies, shows, music | Hardware transcoding configured |
| **jdownloader** | Download manager | |
| **n8n** | Workflow automation | Triggers wifi-robot among other things |
| **nextcloud** | Self-hosted file sync & cloud storage | Watched by `nextcloud-dynamic-watch.sh` |
| **npm** | Nginx Proxy Manager — reverse proxy + SSL | Core infrastructure, start early |
| **paperless-ngx** | Document scanning and archival | |
| **pihole** | DNS-level ad blocking | Acts as LAN DNS resolver, start early |
| **pocket-id** | OIDC identity provider (SSO) | Handles auth for supported services |
| **qbittorrent** | Torrent client | |
| **romm** | ROM manager for game library | |
| **scrutiny** | S.M.A.R.T. drive health monitoring | Alerts via Uptime Kuma |
| **syncthing** | Continuous file sync between devices | |
| **tailscale** | VPN mesh — remote access to LAN | Requires auth key on restore (see blueprint) |
| **uptime-kuma** | Service uptime monitoring + alerting | |
| **wifi-robot** | Guest Wi-Fi toggle bot | Turns guest network on/off via script or n8n workflow |

> All services are internal-only. No ports are exposed directly to the internet — everything external goes through NPM or Tailscale Funnel.

---

## ⚠️ Secrets

`.env` files are **not** in this repo. On a fresh restore, copy each `.env.example`:

```bash
for d in /opt/stacks/*/; do
  [ -f "${d}.env.example" ] && cp --update=none "${d}.env.example" "${d}.env"
done
```

Then repopulate credentials from your password manager / the decrypted backup.

---

## 🔄 Mirroring

```bash
git remote set-url --add --push origin git@codeberg.org:gravi-ctrl/server-docker-backup.git
git remote set-url --add --push origin git@github.com:gravi-ctrl/server-docker-backup.git
git remote -v
```