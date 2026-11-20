FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Soulseek client (upstream fiso64/sockseek release)
ARG SOCKSEEK_VERSION=3.0.5
RUN curl -fsSL https://github.com/fiso64/sockseek/releases/download/v${SOCKSEEK_VERSION}/sockseek_${SOCKSEEK_VERSION}_linux-x64.tar.gz \
    | tar xz -C /usr/local/bin sockseek \
    && chmod +x /usr/local/bin/sockseek

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5050
ENV PORT=5050
# Hosted gateway: accept internet clients; set SHEROFETCH_TOKEN in the host dashboard to require a token
ENV SHEROFETCH_ALLOW_PUBLIC=1
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

CMD ["sh", "-c", "uvicorn backend_server:app --host 0.0.0.0 --port ${PORT:-5050}"]
