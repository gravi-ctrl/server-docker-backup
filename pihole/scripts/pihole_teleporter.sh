#!/bin/bash
# @DESCRIPTION: Pi-hole Teleporter snapshot and restore. `backup` exports a zip into etc-pihole, keeps the newest 2, then refreshes gravity; `restore` imports the newest zip and rebuilds gravity
# @FREQUENCY: backup = daily via cron; restore = run once by container-watcher (task: pihole)
# @USES_ENV: none
#
# Usage:      pihole_teleporter.sh backup|restore [container_name]   (default: pihole)
# Exit codes: 0 = ok, 1 = failed, 2 = restore found no zip
#
# Lives in /opt/stacks/pihole/scripts/. Zips sit in etc-pihole/ (bind-mounted as
# /etc/pihole in the container), so the weekly local-opt-backup.sh archives them.

set -euo pipefail
shopt -s nullglob

MODE="${1:-}"
CONTAINER="${2:-pihole}"
KEEP=2
STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ETC_DIR="$STACK_DIR/etc-pihole"

# Newest zip by name (the name embeds the timestamp)
newest_zip() {
    local zips=("$ETC_DIR"/pi-hole_*_teleporter_*.zip)
    (( ${#zips[@]} )) || return 1
    basename "$(printf '%s\n' "${zips[@]}" | sort | tail -n 1)"
}

# ── backup ────────────────────────────────────────────────────────────────────
do_backup() {
    if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
        echo "❌ Container '$CONTAINER' is not running, nothing exported." >&2
        exit 1
    fi

    echo "→ Exporting Teleporter zip from '$CONTAINER'..."
    docker exec -w /etc/pihole "$CONTAINER" pihole-FTL --teleporter

    local zip
    zip="$(newest_zip)" || { echo "❌ Export ran but no zip found in $ETC_DIR" >&2; exit 1; }

    # Never keep a broken zip as the newest one, and never prune on top of it
    if ! python3 -m zipfile -t "$ETC_DIR/$zip" >/dev/null 2>&1; then
        echo "❌ $zip failed the zip integrity test, removing it. Older zips kept." >&2
        docker exec -w /etc/pihole "$CONTAINER" rm -f "$zip"
        exit 1
    fi

    # Prune inside the container (runs as root there): keep the newest $KEEP
    docker exec -w /etc/pihole "$CONTAINER" sh -c \
        "ls -1 pi-hole_*_teleporter_*.zip | sort -r | tail -n +$((KEEP + 1)) | while read -r f; do rm -f \"\$f\"; done"

    echo "✅ Teleporter snapshot: $zip (keeping newest $KEEP)"

    # Snapshot first, so a failing blocklist download can't cost us the zip
    echo "→ Refreshing gravity..."
    if ! docker exec "$CONTAINER" pihole -g; then
        echo "⚠️ Snapshot saved, but the gravity refresh failed" >&2
        exit 1
    fi
    echo "✅ Gravity refreshed"
}

# ── restore ───────────────────────────────────────────────────────────────────
do_restore() {
    local zip
    zip="$(newest_zip)" || { echo "⚠️ No Teleporter zip found in $ETC_DIR" >&2; exit 2; }

    # On a fresh start the container builds its own default gravity.db; let that finish
    # first so it can't overlap with our import. If pgrep is missing in the image it fails
    # at once and the loop is skipped. Gives up waiting after 5 minutes.
    for _ in $(seq 1 60); do
        docker exec "$CONTAINER" pgrep -f gravity.sh >/dev/null 2>&1 || break
        sleep 5
    done

    # A fresh container may have no gravity schema yet (missing or empty file); build it
    # first. -readonly so sqlite never creates gravity.db as a side effect of checking.
    if ! docker exec "$CONTAINER" pihole-FTL sqlite3 -readonly /etc/pihole/gravity.db "select 1 from adlist limit 1;" >/dev/null 2>&1; then
        echo "→ No gravity schema yet, building it first..."
        docker exec "$CONTAINER" pihole -g
    fi

    echo "→ Importing $zip into '$CONTAINER'..."
    docker exec "$CONTAINER" pihole-FTL --teleporter "/etc/pihole/$zip"

    echo "→ Rebuilding gravity (re-downloads every adlist)..."
    docker exec "$CONTAINER" pihole -g

    local adlists domains
    adlists=$(docker exec "$CONTAINER" pihole-FTL sqlite3 -readonly /etc/pihole/gravity.db "select count(*) from adlist;")
    domains=$(docker exec "$CONTAINER" pihole-FTL sqlite3 -readonly /etc/pihole/gravity.db "select count(*) from domainlist;")
    echo "✅ Pi-hole restored from $zip: ${adlists} adlist(s), ${domains} allow/deny entries"
}

case "$MODE" in
    backup)  do_backup ;;
    restore) do_restore ;;
    *) echo "Usage: $0 backup|restore [container_name]" >&2; exit 1 ;;
esac