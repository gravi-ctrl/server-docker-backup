# Start from a clean Python image
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/gravi-ctrl/server-docker-backup"

# 1. Install Chromium + matching driver from Debian (versions stay in lockstep).
#    Upgrade base OS packages to pick up published Debian security patches.
#    curl is kept for the HEALTHCHECK.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
       chromium chromium-driver ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Fail the build loudly if Debian renames/moves either binary
RUN chromium --version && chromedriver --version

# 2. Install pinned Python dependencies (cached unless requirements.txt changes),
#    then remove pip: the app never needs it at runtime
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y pip

# 3. Create non-root user & copy code
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
COPY --chown=appuser:appuser guest_wifi.py .

# 4. Drop to non-root
USER appuser

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:5000/health || exit 1

# 5. Run the script
ENTRYPOINT ["python3", "guest_wifi.py"]
