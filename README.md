# 🐳 Server Docker Stacks

This repository contains the configuration files (`compose.yml`) for all containers running in `/opt/stacks`.

## ⚠️ Important Note on Secrets

For security reasons, config and **`.env` files are NOT included** in this repository.

### How to Restore

For restoration instructions, refer to **[Phase 2: Restore Docker Stacks](https://codeberg.org/gravi-ctrl/homelab-blueprint#phase-2-restore-docker-stacks) in [homelab-blueprint repo](https://codeberg.org/gravi-ctrl/homelab-blueprint)**

---

## 🔄 Mirroring Workflow

This repository is primary-hosted on **Codeberg** and mirrored to **GitHub**. To maintain synchronicity with a single `git push`, the local `origin` is configured with multiple push URLs.

### Setup Dual-Push (Optional)

```bash
# Set the primary push URL (Codeberg)
git remote set-url --add --push origin git@codeberg.org:gravi-ctrl/server-docker-backup.git

# Add the mirror push URL (GitHub)
git remote set-url --add --push origin git@github.com:gravi-ctrl/server-docker-backup.git

# Verify configuration
git remote -v
```