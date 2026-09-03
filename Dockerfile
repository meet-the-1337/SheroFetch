FROM python:3.11-slim

# Install system dependencies: ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn yt-dlp

# Copy sockseek if present
COPY sockseek* /usr/local/bin/ || true
RUN chmod +x /usr/local/bin/sockseek* 2>/dev/null || true

# Copy application source
COPY . .

EXPOSE 5050
ENV PORT=5050

CMD ["sh", "-c", "uvicorn backend_server:app --host 0.0.0.0 --port ${PORT:-5050}"]
