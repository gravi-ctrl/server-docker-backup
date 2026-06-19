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

## ⚠️ Secrets

`.env` files are **not** in this repo. On a fresh restore, copy each `.env.example`:

```bash
for d in /opt/stacks/*/; do [ -f "${d}.env.example" ] && cp --update=none "${d}.env.example" "${d}.env"; done
```
Fill in what you can from your password manager. Some secrets (e.g. OIDC client credentials) can only be obtained after spinning up their respective services first.

---

## 🔄 Mirroring

```bash
git remote set-url --add --push origin git@codeberg.org:gravi-ctrl/server-docker-backup.git
git remote set-url --add --push origin git@github.com:gravi-ctrl/server-docker-backup.git
git remote -v
```