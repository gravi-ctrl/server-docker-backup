#!/bin/bash

# 1. Setup
STATE_FILE="/data/alerted_history.txt"
touch "$STATE_FILE"
DOCKCHECK_URL="https://raw.githubusercontent.com/mag37/dockcheck/main/dockcheck.sh"

# Install dependencies
# ADDED 'jq' here, which is critical for parsing Docker Hub JSON
apk add --no-cache curl bash grep sed bc coreutils jq > /dev/null 2>&1

# Download latest dockcheck if not present
if [ ! -f "./dockcheck.sh" ]; then
    echo "Downloading dockcheck..."
    curl -s -o dockcheck.sh "$DOCKCHECK_URL"
    chmod +x dockcheck.sh
fi

echo "--- Starting Scan at $(date) ---"

# 2. Get list of all running containers
CONTAINERS=$(docker ps --format "{{.Names}}")

for CONTAINER in $CONTAINERS; do
    # Skip myself
    if [ "$CONTAINER" == "dockcheck-updater" ]; then continue; fi

    echo "Checking container: $CONTAINER..."

    # 3. Run dockcheck for this specific container
    # REMOVED '2>/dev/null' so we can see errors in docker logs if it fails
    OUTPUT=$(./dockcheck.sh -n -y "$CONTAINER")

    # Check if dockcheck found an update
    # We look for "Latest:" which indicates a version comparison was successful and found a newer one
    if echo "$OUTPUT" | grep -q "Latest:"; then
        
        # Extract versions
        IMAGE=$(echo "$OUTPUT" | grep "Image:" | head -n 1 | awk '{print $2}')
        CURRENT=$(echo "$OUTPUT" | grep "Current:" | head -n 1 | awk '{$1=$1;print}' | cut -d ' ' -f 2-)
        NEW=$(echo "$OUTPUT" | grep "Latest:" | head -n 1 | awk '{$1=$1;print}' | cut -d ' ' -f 2-)
        
        # Sanity check: ensure we found versions and they are different
        if [ "$CURRENT" != "$NEW" ] && [ ! -z "$NEW" ]; then
            
            # 4. Check State (Prevent Spam)
            UPDATE_SIG="$CONTAINER:$NEW"
            
            if grep -Fxq "$UPDATE_SIG" "$STATE_FILE"; then
                echo "  -> Update found ($NEW), but already alerted."
            else
                echo "  -> New update found! Sending Telegram alert..."
                
                # 5. Send Telegram Notification
                # Construct Docker Hub Link
                if [[ "$IMAGE" != *"/"* ]]; then
                   LINK="https://hub.docker.com/_/$IMAGE"
                else
                   LINK="https://hub.docker.com/r/$IMAGE"
                fi

                MSG="🚀 <b>Update Available</b>%0A%0A"
                MSG+="<b>Service:</b> $CONTAINER%0A"
                MSG+="<b>Image:</b> $IMAGE%0A"
                MSG+="<b>Current:</b> $CURRENT%0A"
                MSG+="<b>New:</b> $NEW%0A%0A"
                MSG+="<a href=\"$LINK\">View on Docker Hub</a>"

                curl -s -X POST "https://api.telegram.org/bot$TELE_TOK/sendMessage" \
                    -d chat_id="$CHAT_ID" \
                    -d text="$MSG" \
                    -d parse_mode="HTML" > /dev/null

                # Save to history
                echo "$UPDATE_SIG" >> "$STATE_FILE"
            fi
        fi
    else
        echo "  -> No updates found."
    fi
done

echo "--- Scan Complete ---"
