# 🐳 Server Docker Stacks

This repository contains the configuration files (`compose.yml`) for all containers running in `/opt/stacks`.

## ⚠️ Important Note on Secrets

For security reasons, config and **`.env` files are NOT included** in this repository.

### How to Restore

For restoration instructions, refer to **[Phase 2: Restore Docker Stacks](/gravi-ctrl/homelab-blueprint#phase-2-restore-docker-stacks) in [homelab-blueprint repo](/gravi-ctrl/homelab-blueprint)**

---

## 🔄 Mirroring Workflow

```bash
git remote set-url --add --push origin git@codeberg.org:gravi-ctrl/server-docker-backup.git
git remote set-url --add --push origin git@github.com:gravi-ctrl/server-docker-backup.git
git remote -v
```