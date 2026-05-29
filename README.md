# 🐳 Server Docker Stacks

> **Mirror Status:** Mirrored across [Codeberg](https://codeberg.org/gravi-ctrl/server-docker-backup) (Primary) and [GitHub](https://github.com/gravi-ctrl/server-docker-backup).

[![StackDeck Dashboard (Codeberg)](https://img.shields.io/badge/StackDeck-Codeberg_Pages-2185d0?style=flat-square&logo=codeberg&logoColor=white)](https://gravi-ctrl.codeberg.page/server-docker-backup/)
[![StackDeck Dashboard (GitHub)](https://img.shields.io/badge/StackDeck-GitHub_Pages-181717?style=flat-square&logo=github&logoColor=white)](https://gravi-ctrl.github.io/server-docker-backup/)

Docker Compose configs for all services running in `/opt/stacks` on the home server.
No `.env` files are included — secrets live in the encrypted weekly backup.

🖥️ **Live Interactive Dashboard:** 
* **Primary:** [gravi-ctrl.codeberg.page/server-docker-backup](https://gravi-ctrl.codeberg.page/server-docker-backup/)
* **Mirror:** [gravi-ctrl.github.io/server-docker-backup](https://gravi-ctrl.github.io/server-docker-backup/)

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

---

## 📊 Dashboard Maintenance

The interactive dashboard is generated using **StackDeck**. To regenerate the dashboard locally before pushing updates:

```bash
# 1. Update the local index.html using NPM integration
python3 docker_dash.py

# 2. Push index.html to your 'pages' branch
git checkout pages
git add index.html
git commit -m "Update StackDeck dashboard"
git push origin pages
git checkout main
```