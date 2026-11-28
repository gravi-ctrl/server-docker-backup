#!/usr/bin/env bash
set -euo pipefail
docker compose -f /opt/stacks/nextcloud/compose.yml run --rm -T calcardbackup \
  /var/www/html -o /backup/syncthing/Backup/self-hosted/contacts-calendars_backup -s
