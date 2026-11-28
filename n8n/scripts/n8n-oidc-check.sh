#!/usr/bin/env bash
# n8n-oidc-check.sh - pre-upgrade smoke test for the n8n OIDC hook.
#
# Usage:  ./n8n-oidc-check.sh <n8n-image-tag>      e.g. ./n8n-oidc-check.sh 2.46.0
#
# Env:    STACK=/opt/stacks/n8n   stack dir (expects n8n_data/ with hooks.js)
#         CONTAINER=n8n           name of your RUNNING n8n container. The test container
#                                 mirrors its environment, networks, extra hosts, DNS and
#                                 read-only bind mounts (e.g. CA certs). Falls back to
#                                 $STACK/.env if the container isn't found.
#         PORT=5679               host port for the throwaway container
#         KEEP=1                  leave the test container running for a manual login
#         FORCE=1                 run even if the config uses Postgres (WARNING: touches the real DB)
#         ENV_FILE=/opt/rabbit-hole/.env   optional central env (SERVER_IP, STACKS_DIR)
#
# It never touches your real container or data dir: it runs the new image
# against a COPY of n8n_data (which contains hooks.js).
#
# ---------------------------------------------------------------------------
# IF A CHECK FAILS - do NOT upgrade until it passes.
# The hook reports what it found at startup; the log lines printed at the end
# of the run are the evidence. Find your failure below.
#
# "hook never loaded" (no [OIDC Hook] lines)
#    The hook file wasn't picked up. Check the EXTERNAL_HOOK_FILES listing the
#    script printed, the CONTAINER name, and that n8n_data/hooks.js exists.
#
# "OIDC DISABLED" or no "Session issuer" line
#    n8n changed how it issues login cookies; the log lists everywhere the hook looked.
#      docker run --rm --entrypoint sh n8nio/n8n:NEW -c \
#        'cd /usr/local/lib/node_modules/n8n; grep -n "issueCookie" dist/auth/jwt.js'
#    Then fix SESSION_ISSUER_SPECS / resolveSessionIssuer() in hooks.js.
#
# no "User provisioning" line (log says UNAVAILABLE)
#    n8n renamed or moved "create a user + personal project" (2.49 renamed
#    createUserWithProject -> createPersonWithProject, on PersonRepository).
#      docker run --rm --entrypoint sh n8nio/n8n:NEW -c 'cd /usr/local/lib/node_modules/n8n;
#        grep -Rho "create[A-Za-z]*WithProject" dist node_modules/@n8n/db/dist | sort -u'
#    Then add the new name as another strategy in resolveUserCreator() in hooks.js.
#    Meanwhile existing users still log in; only first-time logins fail.
#
# "/auth/oidc/login returned 500"
#    The hook can't fetch your IdP's discovery document. Read the probe line the
#    script prints: ENOTFOUND/EAI_AGAIN = DNS; ECONNREFUSED/ETIMEDOUT = network;
#    UNABLE_TO_VERIFY_LEAF_SIGNATURE = private CA not trusted (NODE_EXTRA_CA_CERTS
#    and its mount); HTTP 200 = discovery fine, read the "Login error" log instead.
#
# Everything passes but a real login fails
#    Re-run with KEEP=1, log in, then: docker logs n8n-oidc-test 2>&1 | grep -A6 "OIDC Hook"
#
# Before the REAL upgrade: back up n8n_data / the database. Downgrading after
# n8n has run its migrations is not guaranteed to work.
#
# Still stuck: pin the old tag and send the hook log lines + the image diff.
# ---------------------------------------------------------------------------

set -u

TAG=${1:?usage: $0 <n8n-image-tag>}

# Optional: central env (only used for STACKS_DIR / SERVER_IP defaults)
ENV_FILE=${ENV_FILE:-/opt/rabbit-hole/.env}
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

STACK=${STACK:-${STACKS_DIR:-/opt/stacks}/n8n}
CONTAINER=${CONTAINER:-n8n}
PORT=${PORT:-5679}
IMAGE="n8nio/n8n:$TAG"
NAME=n8n-oidc-test
TMP=$(mktemp -d)
ENVFILE=$(mktemp)
FAILS=0
EXTRA_ARGS=()
NETS=()

pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; FAILS=$((FAILS + 1)); }

cleanup() {
  rm -f "$ENVFILE"
  if [ "${KEEP:-0}" = "1" ]; then
    # Prefer the base of TEST_REDIRECT_URI, else SERVER_IP (from ENV_FILE), else localhost
    if [ -n "${TEST_REDIRECT_URI:-}" ]; then
      URL=${TEST_REDIRECT_URI%/auth/oidc/callback}
    else
      URL="http://${SERVER_IP:-localhost}:$PORT"
    fi
    echo "KEEP=1: container '$NAME' left running on port $PORT (data copy: $TMP)"
    echo "Log in at:   $URL"
    echo "Remove with: docker rm -f $NAME && rm -rf $TMP"
  else
    docker rm -f "$NAME" >/dev/null 2>&1
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

echo "== Environment"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -vE '^(PATH|HOME|HOSTNAME|NODE_VERSION|YARN_VERSION|NODE_ICU_DATA|TERM|SHLVL|PWD|N8N_VERSION|N8N_RELEASE_TYPE)=' \
    | grep -v '^$' > "$ENVFILE"
  echo "  env copied from running container '$CONTAINER'"

  # Mirror what the real container can reach: extra hosts, DNS, read-only bind mounts, networks.
  for h in $(docker inspect "$CONTAINER" --format '{{range .HostConfig.ExtraHosts}}{{.}} {{end}}'); do
    EXTRA_ARGS+=(--add-host "$h")
  done
  for d in $(docker inspect "$CONTAINER" --format '{{range .HostConfig.Dns}}{{.}} {{end}}'); do
    EXTRA_ARGS+=(--dns "$d")
  done
  while read -r src dst; do
    [ -n "$src" ] && [ -n "$dst" ] && EXTRA_ARGS+=(-v "$src:$dst:ro")
  done < <(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}} {{.Destination}}{{"\n"}}{{end}}{{end}}' \
             | grep -v ' /home/node/.n8n$')
  read -r -a NETS <<< "$(docker inspect "$CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  echo "  mirrored: networks=[${NETS[*]:-none}] extra args=${#EXTRA_ARGS[@]}"
else
  cp "$STACK/.env" "$ENVFILE" 2>/dev/null
  echo "  WARNING: container '$CONTAINER' not found; using $STACK/.env only."
  echo "  Compose-defined variables, networks and mounts will be MISSING. Set CONTAINER=<name>."
fi

[ -n "${TEST_REDIRECT_URI:-}" ] && EXTRA_ARGS+=(-e "OIDC_REDIRECT_URI=$TEST_REDIRECT_URI")

# A Postgres-backed test container would run migrations against the REAL database.
if grep -qE '^DB_TYPE=postgres' "$ENVFILE" && [ "${FORCE:-0}" != "1" ]; then
  echo "Refusing to run: config uses Postgres (DB_TYPE), so the test container would"
  echo "use your real database. Use a separate test DB, or re-run with FORCE=1."
  exit 2
fi
INNER_PORT=$(grep '^N8N_PORT=' "$ENVFILE" | head -1 | cut -d= -f2)
INNER_PORT=${INNER_PORT:-5678}

echo "== Pulling $IMAGE"
docker pull -q "$IMAGE" >/dev/null || { echo "Could not pull $IMAGE"; exit 2; }

echo "== Hook file"
if [ ! -f "$STACK/n8n_data/hooks.js" ]; then
  fail "$STACK/n8n_data/hooks.js does not exist"
elif grep -q "resolveSessionIssuer" "$STACK/n8n_data/hooks.js"; then
  pass "n8n_data/hooks.js is the patched (tolerant) version"
else
  fail "n8n_data/hooks.js is the OLD hook (no resolveSessionIssuer); copy the patched file in first"
fi

echo "== Runtime test on a copy of n8n_data"
chmod 755 "$TMP"
cp -a "$STACK/n8n_data/." "$TMP/"
chmod 755 "$TMP"
docker rm -f "$NAME" >/dev/null 2>&1

NET_ARGS=()
[ "${#NETS[@]}" -gt 0 ] && [ -n "${NETS[0]}" ] && NET_ARGS=(--network "${NETS[0]}")

docker run -d --name "$NAME" -p "$PORT:$INNER_PORT" --env-file "$ENVFILE" \
  ${NET_ARGS[@]+"${NET_ARGS[@]}"} ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} \
  -v "$TMP:/home/node/.n8n" "$IMAGE" >/dev/null || { echo "Container failed to start"; exit 2; }
for ((i = 1; i < ${#NETS[@]}; i++)); do
  docker network connect "${NETS[$i]}" "$NAME" >/dev/null 2>&1
done

for _ in $(seq 1 60); do
  logs=$(docker logs "$NAME" 2>&1)
  echo "$logs" | grep -qE "Editor is now accessible|Exiting due to an error" && break
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = "true" ] || break
  sleep 2
done
logs=$(docker logs "$NAME" 2>&1)

echo "$logs" | grep -q "Editor is now accessible" && pass "n8n booted" || fail "n8n did not finish booting"

if ! echo "$logs" | grep -q "OIDC Hook"; then
  fail "hook never loaded (no [OIDC Hook] log lines)"
  echo "      EXTERNAL_HOOK_FILES in test container: $(docker exec "$NAME" printenv EXTERNAL_HOOK_FILES 2>/dev/null || echo '<unset, or container stopped>')"
  docker exec "$NAME" sh -c 'for f in $(echo "$EXTERNAL_HOOK_FILES" | tr ":" " "); do ls -l "$f" 2>&1; done' 2>/dev/null | sed 's/^/      /'
else
  echo "$logs" | grep -q "OIDC DISABLED" && fail "hook disabled itself (see hook log below)" || pass "hook loaded and did not disable itself"
  issuer=$(echo "$logs" | grep -o "Session issuer: .*" | head -1)
  [ -n "$issuer" ] && pass "$issuer" || fail "no 'Session issuer' log line"
  prov=$(echo "$logs" | grep -o "User provisioning: .*" | head -1)
  [ -n "$prov" ] && pass "$prov" || fail "no 'User provisioning' log line (new users could not be created)"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://localhost:$PORT/auth/oidc/login")
if [ "$code" = "302" ]; then
  pass "/auth/oidc/login returns 302"
else
  fail "/auth/oidc/login returned $code (want 302)"
  echo "      Probing the IdP discovery URL from inside the test container:"
  probe=$(docker exec "$NAME" node -e 'fetch(process.env.OIDC_ISSUER_URL.replace(/\/$/,"")+"/.well-known/openid-configuration").then(r=>console.log("HTTP "+r.status)).catch(e=>console.log("ERR "+((e.cause&&e.cause.code)||e.message)))' 2>&1)
  echo "      -> ${probe:-<no output>}   (see the 'IF A CHECK FAILS' guide for what this means)"
fi

js=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 10 "http://localhost:$PORT/assets/oidc-frontend-hook.js")
echo "$js" | grep -q '^200 text/javascript' && pass "frontend script served as JavaScript" || fail "frontend script: $js"

# Re-read logs AFTER probing so request-time errors (e.g. "Login error") are included.
logs=$(docker logs "$NAME" 2>&1)

echo
echo "== Hook log lines"
echo "$logs" | grep "OIDC Hook" || echo "  (none)"
if echo "$logs" | grep -q "Login error"; then
  echo "-- Login error detail:"
  echo "$logs" | grep -A6 "Login error" | head -20
fi
echo

if [ "$FAILS" -eq 0 ]; then
  echo "ALL AUTOMATED CHECKS PASSED."
  echo "Still do ONE real login through your IdP (re-run with KEEP=1 to keep the test container up):"
  echo "e.g. KEEP=1 TEST_REDIRECT_URI=\"http://${SERVER_IP:-YOUR_SERVER_IP}:$PORT/auth/oidc/callback\" ./n8n-oidc-check.sh $TAG"
  echo "these checks cannot exercise the callback, user lookup, or session cookie."
  exit 0
else
  echo "$FAILS CHECK(S) FAILED: do not upgrade yet. See the 'IF A CHECK FAILS' guide at the top of this script."
  exit 1
fi
