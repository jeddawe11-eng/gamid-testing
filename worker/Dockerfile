# F8-B1 (Mazen's choice 2026-10-21): a pinned, checksum-verified static FFmpeg WITH libvmaf, used ONLY to measure VMAF (GAMID_VMAF_FFMPEG). Every encode -
# the accepted Intro F2 derivative, the HEVC conversion and the renditions - keeps Debian's FFmpeg below, unchanged. A changed archive fails the build.
FROM node:24-bookworm-slim AS vmaf
ARG VMAF_FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-20-13-08/ffmpeg-n8.1.3-18-g46d899d7a0-linux64-gpl-8.1.tar.xz
ARG VMAF_FFMPEG_SHA256=e2a70912ed207cf412a28aa83f2efde7f9fb5c65370af5ad007ad60076d704a6
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL "$VMAF_FFMPEG_URL" -o /tmp/ffmpeg.tar.xz \
 && echo "$VMAF_FFMPEG_SHA256  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
 && mkdir -p /opt/vmaf && tar -xJf /tmp/ffmpeg.tar.xz -C /opt/vmaf --strip-components=2 --wildcards '*/bin/ffmpeg' \
 && /opt/vmaf/ffmpeg -hide_banner -filters | grep -q ' libvmaf ' && rm /tmp/ffmpeg.tar.xz

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=vmaf /opt/vmaf/ffmpeg /opt/vmaf/ffmpeg
ENV GAMID_VMAF_FFMPEG=/opt/vmaf/ffmpeg
WORKDIR /app
COPY worker/intro-worker.mjs ./intro-worker.mjs
COPY worker/intro-f2-smoke.mjs ./intro-f2-smoke.mjs
COPY worker/intro-timing-smoke.mjs ./intro-timing-smoke.mjs
COPY worker/wall-video.mjs ./wall-video.mjs
COPY worker/wall-rendition.mjs ./wall-rendition.mjs
COPY worker/intro-share.mjs ./intro-share.mjs
COPY worker/usage-upload.mjs ./usage-upload.mjs
COPY worker/usage-smoke.mjs ./usage-smoke.mjs
COPY worker/intro-dispatcher.mjs ./intro-dispatcher.mjs
COPY dist/account/resumable-upload.js /dist/account/resumable-upload.js
COPY package.json /dist/package.json
USER node
CMD ["node","intro-worker.mjs","once"]
