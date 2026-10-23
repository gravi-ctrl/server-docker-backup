# 🐳 Server Docker Stacks

Docker Compose configs for all services running in `/opt/stacks` on the home server.
No `.env` files are included — secrets live in the encrypted weekly backup.

🖥️ **Live Interactive Dashboard:** 
* [gravi-ctrl.github.io/server-docker-backup](https://gravi-ctrl.github.io/server-docker-backup/)

For restoration instructions, see **[Phase 3 — Docker & Finalize](https://github.com/gravi-ctrl/homelab-blueprint#phase-3--docker--finalize)** in homelab-blueprint.

---

## ⚠️ Secrets

`.env` files are **not** in this repo. On a fresh restore, copy each `.env.example`:

```bash
for d in /opt/stacks/*/; do [ -f "${d}.env.example" ] && cp --update=none "${d}.env.example" "${d}.env"; done
```
Fill in what you can from your password manager. Some secrets (e.g. OIDC client credentials) can only be obtained after spinning up their respective services first.
