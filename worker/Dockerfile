FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/intro-worker.mjs ./intro-worker.mjs
COPY worker/intro-f2-smoke.mjs ./intro-f2-smoke.mjs
COPY worker/wall-video.mjs ./wall-video.mjs
COPY worker/usage-upload.mjs ./usage-upload.mjs
COPY worker/usage-smoke.mjs ./usage-smoke.mjs
COPY worker/intro-dispatcher.mjs ./intro-dispatcher.mjs
COPY dist/account/resumable-upload.js /dist/account/resumable-upload.js
COPY package.json /dist/package.json
USER node
CMD ["node","intro-worker.mjs","once"]
