# Start from a clean Python image
FROM python:3.12-slim
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/gravi-ctrl/server-docker-backup"

# 1. Install Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates curl \
    && mkdir -p /etc/apt/keyrings \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Python Dependencies
RUN pip install --no-cache-dir selenium flask python-dotenv

# 3. Create non-root user & copy code
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
COPY --chown=appuser:appuser guest_wifi.py .

# 4. Drop to non-root
USER appuser

# 5. Run the script
ENTRYPOINT ["python3", "guest_wifi.py"]
