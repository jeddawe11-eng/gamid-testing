export const AVATAR_PREVIEW_SIZE = 320;
export const AVATAR_MAX_OUTPUT = 512;
export const AVATAR_MIN_SOURCE_CROP = 128;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function coverScale(width, height, viewport = AVATAR_PREVIEW_SIZE) {
  if (!(width > 0 && height > 0 && viewport > 0)) throw new Error("INVALID_IMAGE_DIMENSIONS");
  return Math.max(viewport / width, viewport / height);
}

export class AvatarCropState {
  constructor(width, height, viewport = AVATAR_PREVIEW_SIZE) {
    this.width = width;
    this.height = height;
    this.viewport = viewport;
    this.baseScale = coverScale(width, height, viewport);
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.maxZoom = Math.max(1, Math.min(8, Math.min(width, height) / AVATAR_MIN_SOURCE_CROP));
  }

  constrain() {
    const scale = this.baseScale * this.zoom;
    const maxX = Math.max(0, (this.width * scale - this.viewport) / 2);
    const maxY = Math.max(0, (this.height * scale - this.viewport) / 2);
    this.offsetX = clamp(this.offsetX, -maxX, maxX);
    this.offsetY = clamp(this.offsetY, -maxY, maxY);
    return this;
  }

  pan(deltaX, deltaY) {
    this.offsetX += deltaX;
    this.offsetY += deltaY;
    return this.constrain();
  }

  setZoom(nextZoom, anchorX = this.viewport / 2, anchorY = this.viewport / 2) {
    const previous = this.zoom;
    this.zoom = clamp(Number(nextZoom) || 1, 1, this.maxZoom);
    const ratio = this.zoom / previous;
    this.offsetX = anchorX - this.viewport / 2 + (this.offsetX - (anchorX - this.viewport / 2)) * ratio;
    this.offsetY = anchorY - this.viewport / 2 + (this.offsetY - (anchorY - this.viewport / 2)) * ratio;
    return this.constrain();
  }

  sourceRect() {
    const scale = this.baseScale * this.zoom;
    const size = this.viewport / scale;
    return {
      x: this.width / 2 - (this.viewport / 2 + this.offsetX) / scale,
      y: this.height / 2 - (this.viewport / 2 + this.offsetY) / scale,
      size,
    };
  }

  outputSize() {
    return Math.max(1, Math.min(AVATAR_MAX_OUTPUT, Math.floor(this.sourceRect().size)));
  }
}

const htmlImageUrls = new WeakMap();
const errorKind = error => error?.name || "Error";

async function loadHtmlImage(file, { report = () => {} } = {}) {
  const url = URL.createObjectURL(file);
  report("fallback-url-created");
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = () => { report("fallback-load-success"); resolve(); };
      image.onerror = () => { report("fallback-load-failure"); reject(new Error("IMAGE_DECODE_FAILED")); };
      image.src = url;
    });
    // Keep the Blob URL alive for as long as the crop session can draw this
    // image. Android may discard a decoded <img> resource if its URL is
    // revoked immediately after onload.
    htmlImageUrls.set(image, { url, report });
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    report("fallback-url-released-after-failure", errorKind(error));
    throw error;
  }
}

export function releaseOrientedImage(image) {
  const owned = image && htmlImageUrls.get(image);
  if (owned) {
    htmlImageUrls.delete(image);
    image.removeAttribute?.("src");
    URL.revokeObjectURL(owned.url);
    owned.report("fallback-url-released");
  }
  if (typeof image?.close === "function") image.close();
}

export async function loadOrientedImage(file, {
  createBitmap = globalThis.createImageBitmap,
  fallback = loadHtmlImage,
  report = () => {},
} = {}) {
  if (typeof createBitmap === "function") {
    try {
      report("bitmap-start");
      const bitmap = await createBitmap(file, { imageOrientation: "from-image" });
      report("bitmap-success");
      return bitmap;
    } catch (error) {
      report("bitmap-failure", errorKind(error));
      /* Some mobile decoders intermittently reject valid gallery Files; use the browser image path. */
    }
  }
  report("fallback-start");
  return fallback(file, { report });
}

export class AvatarDecodeSession {
  constructor({ loader = loadOrientedImage, releaser = releaseOrientedImage, report = () => {} } = {}) {
    this.loader = loader;
    this.releaser = releaser;
    this.report = report;
    this.generation = 0;
    this.activeImage = null;
  }

  async open(file) {
    const operation = ++this.generation;
    this.report("session-open", `g${operation}`);
    if (this.activeImage) {
      this.report("session-release-previous", `g${operation}`);
      this.releaser(this.activeImage);
    }
    this.activeImage = null;
    let image;
    try {
      image = await this.loader(file);
    } catch (error) {
      if (operation !== this.generation) {
        this.report("session-stale-failure", `g${operation}`);
        return { stale: true };
      }
      this.report("session-current-failure", `g${operation}:${errorKind(error)}`);
      throw error;
    }
    if (operation !== this.generation) {
      this.report("session-stale-success", `g${operation}`);
      this.releaser(image);
      return { stale: true };
    }
    this.activeImage = image;
    this.report("session-current-success", `g${operation}`);
    return { stale: false, image, operation };
  }

  isCurrent(operation, image = this.activeImage) {
    return operation === this.generation && image === this.activeImage;
  }

  reset(reason = "reset") {
    ++this.generation;
    this.report("session-reset", `g${this.generation}:${reason}`);
    if (this.activeImage) this.releaser(this.activeImage);
    this.activeImage = null;
  }
}

export function drawCropPreview(context, image, state) {
  const size = state.viewport;
  const scale = state.baseScale * state.zoom;
  const drawWidth = state.width * scale;
  const drawHeight = state.height * scale;
  const left = (size - drawWidth) / 2 + state.offsetX;
  const top = (size - drawHeight) / 2 + state.offsetY;
  context.clearRect(0, 0, size, size);
  context.drawImage(image, left, top, drawWidth, drawHeight);
  context.save();
  context.beginPath();
  context.rect(0, 0, size, size);
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.fillStyle = "rgba(4, 3, 9, .68)";
  context.fill("evenodd");
  context.restore();
}

function canvasBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function createNormalizedAvatar(image, state) {
  const { x, y, size } = state.sourceRect();
  const outputSize = state.outputSize();
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  canvas.getContext("2d", { alpha: false }).drawImage(image, x, y, size, size, 0, 0, outputSize, outputSize);
  let blob = await canvasBlob(canvas, "image/webp", .9);
  if (blob?.type !== "image/webp") blob = await canvasBlob(canvas, "image/jpeg", .92);
  if (!blob) throw new Error("AVATAR_EXPORT_FAILED");
  return { blob, width: outputSize, height: outputSize };
}
