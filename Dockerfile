FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download sockseek binary during build
RUN curl -L -o /usr/local/bin/sockseek https://github.com/meet-the-1337/sockseek/releases/download/v1.0.0/sockseek-linux-x64 \
    && chmod +x /usr/local/bin/sockseek

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn yt-dlp

COPY . .

EXPOSE 5050
ENV PORT=5050

CMD ["sh", "-c", "uvicorn backend_server:app --host 0.0.0.0 --port ${PORT:-5050}"]
