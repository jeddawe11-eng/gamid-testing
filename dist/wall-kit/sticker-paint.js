// Friends Stickers V1 (2026-10-24): draws the approved stickers of one Friends Stage, and the official Friends Stage background. Display only - nothing here is a
// Wall element, layer or asset of the owner's, and nothing decides who may see what (the server returns only what may be shown).
//
// One sticker = one group, positioned by its centre in stage units (dist/wall/stickers.js) and scaled with the stage:
//   - the animated sticker (the reduced-motion still under prefers-reduced-motion), in the shared square box, sized by its dynamic size %;
//   - the sender's attribution, ALWAYS visible just below the box: their current GamID avatar (or initial) and @username, moving and scaling with the sticker
//     (never smaller than readable);
//   - only when the sender attached one: a small clip button that opens the link in a new tab (nothing is embedded or played).
import { STICKER_BASE, stickerByKey, stickerFile, stickerStillFile, stickerSenderHandle } from "../wall/stickers.js";
import { safeStickerClip, STICKER_CLIP_LABELS } from "./embed/providers/clip-links.js";

const kitUrl = path => new URL(path, import.meta.url).href;
export const stickerArtUrl = key => kitUrl(stickerFile(key));
export const stickerStillUrl = key => kitUrl(stickerStillFile(key));
export const FRIENDS_STAGE_BACKGROUND = "friends/friends-stage-bg.webp";   // relative to dist/wall-kit/ (wall-kit.css .wall-friends-bg names the same file)

// The official GamID Friends Stage background: every Friends Stage shows it, behind its stickers. It is not the owner's and cannot be changed (V1: no catalog).
export function paintFriendsBackground(createNode) {
  const layer = createNode("div");
  layer.className = "wall-friends-bg";
  layer.setAttribute("aria-hidden", "true");
  return layer;
}

// A placement row (any of the three reads) -> what the painter needs, or null when it cannot be drawn safely.
export function stickerView(row, avatarUrl = null) {
  const sticker = stickerByKey(row?.sticker_key);
  const x = Number(row?.pos_x), y = Number(row?.pos_y), size = Number(row?.size_percent ?? 100);
  if (!sticker || !Number.isFinite(x) || !Number.isFinite(y) || !(size >= 50 && size <= 100)) return null;
  const handle = stickerSenderHandle(row?.sender_handle);
  return {
    id: String(row.placement_id), key: sticker.key, name: sticker.name, x, y, size, seq: Number(row?.approval_seq) || 0, status: row?.status ?? "approved",
    sender: { handle, name: typeof row?.sender_display_name === "string" ? row.sender_display_name : "", avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null },
    clip: row?.clip_url ? safeStickerClip(row.clip_url, row.clip_provider) : null,
  };
}

const initialOf = sender => (sender.name || sender.handle || "G").trim().charAt(0).toUpperCase() || "G";

// One sticker group at `scale` (stage px per stage unit). `interactive`: the clip button is a real link (visitor page, Preview); in the editor it only shows.
export function paintSticker(view, scale, createNode, { interactive = true, draggable = false } = {}) {
  const box = STICKER_BASE * (view.size / 100) * scale;
  const group = createNode("figure");
  group.className = `wall-sticker${draggable ? " is-movable" : ""}`;
  group.setAttribute("data-sticker", view.id);
  group.setAttribute("data-sticker-key", view.key);
  group.style.setProperty("left", `${view.x * scale - box / 2}px`);
  group.style.setProperty("top", `${view.y * scale - box / 2}px`);
  group.style.setProperty("width", `${box}px`);
  group.style.setProperty("height", `${box}px`);
  group.style.setProperty("--sticker-px", `${box}px`);
  group.style.setProperty("z-index", String(10 + view.seq));
  const by = view.sender.handle ? `@${view.sender.handle}` : "a GamID player";
  group.setAttribute("aria-label", `${view.name} sticker from ${by}${view.clip ? ", with a gaming clip" : ""}`);

  const art = createNode("picture");
  art.className = "wall-sticker-art";
  const still = createNode("source");
  still.setAttribute("media", "(prefers-reduced-motion: reduce)");
  still.setAttribute("srcset", stickerStillUrl(view.key));
  const img = createNode("img");
  img.setAttribute("src", stickerArtUrl(view.key));
  img.setAttribute("alt", "");
  img.setAttribute("decoding", "async");
  img.setAttribute("loading", "lazy");   // a sticker on a stage far below the screen waits until it comes near
  img.setAttribute("draggable", "false");
  art.append(still, img);

  const caption = createNode("figcaption");
  caption.className = "wall-sticker-by";
  const avatar = createNode("span");
  avatar.className = "wall-sticker-avatar";
  if (view.sender.avatarUrl) {
    const face = createNode("img");
    face.setAttribute("src", view.sender.avatarUrl);
    face.setAttribute("alt", "");
    face.setAttribute("draggable", "false");
    avatar.append(face);
  } else avatar.textContent = initialOf(view.sender);
  const name = createNode("span");
  name.className = "wall-sticker-name";
  name.textContent = by;
  caption.append(avatar, name);
  group.append(art, caption);

  if (view.clip) {
    const label = `Watch ${by}'s clip on ${STICKER_CLIP_LABELS[view.clip.provider] ?? "its site"}`;
    const clip = createNode(interactive ? "a" : "span");
    clip.className = "wall-sticker-clip";
    clip.setAttribute("data-provider", view.clip.provider);
    if (interactive) {
      clip.setAttribute("href", view.clip.url);
      clip.setAttribute("target", "_blank");
      clip.setAttribute("rel", "noopener noreferrer nofollow");
      clip.setAttribute("data-interactive", "");
    }
    clip.setAttribute("aria-label", label);
    clip.setAttribute("title", label);
    const icon = createNode("span");
    icon.className = "wall-sticker-clip-icon";
    icon.setAttribute("aria-hidden", "true");
    clip.append(icon);
    group.append(clip);
  }
  return group;
}

// Every sticker of one stage, oldest first (newer ones on top), in a layer over the stage that takes no taps of its own.
export function paintStickerLayer(views, scale, createNode, options = {}) {
  const layer = createNode("div");
  layer.className = "wall-stickers";
  layer.setAttribute("data-sticker-layer", "");
  for (const view of [...views].sort((a, b) => a.seq - b.seq)) layer.append(paintSticker(view, scale, createNode, options));
  return layer;
}
