FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY intro-worker.mjs ./intro-worker.mjs
COPY intro-dispatcher.mjs ./intro-dispatcher.mjs
USER node
CMD ["node","intro-worker.mjs","once"]
