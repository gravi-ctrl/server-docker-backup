# 🐳 Server Docker Stacks

This repository contains the configuration files (`compose.yaml`) for all containers running in `/opt/stacks`.

## ⚠️ Important Note on Secrets

For security reasons, **`.env` files are NOT included** in this repository.
If you clone this repo to a new server, **Docker containers will fail to start** until you restore the secrets.

### How to Restore

For restoration instructions including secrets, refer to **[Phase 2: Restore Docker Stacks in server-scripts repo](https://github.com/gravi-ctrl/server-scripts/tree/main#phase-2-restore-docker-stacks)**
