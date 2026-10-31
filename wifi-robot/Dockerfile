# Start from a clean Python image
FROM python:3.12-slim
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/gravi-ctrl/server-docker-backup"

# 1. Install Chrome (amd64 only). wget must stay: google-chrome-stable depends on it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates curl \
    && mkdir -p /etc/apt/keyrings \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Install pinned Python dependencies (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Create non-root user & copy code
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
COPY --chown=appuser:appuser guest_wifi.py .

# 4. Drop to non-root
USER appuser

# 5. Pre-fetch chromedriver at build time (download only, never launches it)
RUN SM="$(python -c 'import selenium, pathlib; print(next(pathlib.Path(selenium.__file__).parent.rglob("selenium-manager")))')" \
    && "$SM" --browser chrome --browser-path /usr/bin/google-chrome

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:5000/health || exit 1

# 6. Run the script
ENTRYPOINT ["python3", "guest_wifi.py"]
