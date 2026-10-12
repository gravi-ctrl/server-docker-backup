# Start from a clean Python image
FROM python:3.9-slim
WORKDIR /app

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
RUN pip install selenium flask python-dotenv

# 3. Copy Application Code
COPY guest_wifi.py .

# 4. Run the script
ENTRYPOINT ["python3", "guest_wifi.py"]
