#!/usr/bin/env bash
set -euo pipefail

REGEX_URL="https://raw.githubusercontent.com/mmotti/pihole-regex/master/regex.list"
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

# 1. Fetch the plain text list (DATA, not a python script)
curl -fsSL --max-time 15 "$REGEX_URL" -o "$TMP_FILE"

# 2. Feed the regexes into Pi-hole using Pi-hole's native CLI
# Skips comments (#) and blank lines
grep -vE '^\s*(#|$)' "$TMP_FILE" | while read -r regex; do
    docker exec pihole pihole --regex "$regex" >/dev/null 2>&1 || true
done

# 3. Update gravity
docker exec pihole pihole -g
