// The PUBLISHED Wall on a visitor's /@handle page. When the owner has published their Wall, it replaces the Public Profile body once the Intro is over (the Intro
// itself is unchanged); without a published Wall nothing here runs and the page is exactly the accepted Public Profile.
//
// Nothing new draws the Wall: it is the same pipeline Preview uses (paintDocument in VIEW mode + the player manager, posters, Game / Connection Details and the
// visitor view of live GamID data). What a visitor can get is decided by the database only:
//   - get_public_wall(handle): the published SNAPSHOT (never the private draft) of a PUBLIC GamID, with the storage location of only the assets it references;
//   - the storage policy "published wall media is readable": exactly those objects, and only while they are published (everything else stays owner-only);
//   - live GamID data: the anonymous public view (loadPublicView), the same calls the Public Profile makes - nothing the owner hid.
import * as defaultApi from "../account/supabase-client.js";
import { paintDocument } from "../wall-kit/paint.js";
import { normalizeEmbedLayering } from "../wall-kit/ops.js";
import { validateDocument } from "../wall/validate.js";
import { createPlayerManager } from "../wall-kit/embed/player.js";
import { createPosterLoader } from "../wall-kit/posters.js";
import { createVideoPool } from "../wall-kit/video-background.js";
import { createWallDetails } from "../wall-kit/gamid-details.js";
import { loadPublicView, providerLabel, PUBLIC_SOURCE_LABELS } from "../wall-editor/gamid-data.js";

export const WALL_MAX_WIDTH = 900;
export const WALL_MIN_WIDTH = 280;
const CONNECTION_KEYS = ["steam", "discord", "riot", "league", "xbox", "playstation"];
const isVideoMime = mime => /^video\//.test(String(mime));

// The GamID data a visitor's Wall is drawn from: ONLY the anonymous public view (VIEW mode reads `public`; the profile / roles blocks read the same public fields).
export function visitorSnapshot(view) {
  const connectionLabels = Object.fromEntries(CONNECTION_KEYS.map(key => [key, providerLabel(key)]));
  if (!view?.available) return { public: view ?? { available: false, games: null, connections: [] }, profile: { displayName: "", handle: "", initial: "G", avatarUrl: null, bio: "" }, roles: [], connections: [], games: { total: 0, items: [], playtimeAllowed: false }, connectionLabels };
  return { public: view, profile: view.profile, roles: view.roles, connections: view.connections, games: { total: 0, items: [], playtimeAllowed: false }, connectionLabels };
}

// Loads what one published Wall needs: its pictures (blob: URLs, like the public avatar), its videos (short-lived signed stream addresses) and the visitor view of
// live GamID data. A media file that cannot be loaded just shows its placeholder; it never breaks the page. -> { doc, assets, gamid } | null (not a valid Wall)
export async function preparePublicWall(published, handle, api = defaultApi) {
  const doc = published?.document;
  if (!doc || !validateDocument(doc).valid) return null;
  const pictures = new Map(), videos = new Map();
  const list = Array.isArray(published.assets) ? published.assets : [];
  await Promise.all(list.map(async asset => {
    const id = asset?.asset_id, path = asset?.storage_path;
    if (typeof id !== "string" || typeof path !== "string") return;
    try {
      if (isVideoMime(asset.mime_type)) { const url = await api.signPublicWallVideo(path, asset.mime_type); if (url) videos.set(id, url); }
      else { const url = await api.loadPublicWallPicture(path); if (url) pictures.set(id, url); }
    } catch { /* this one asset shows its placeholder */ }
  }));
  const view = await loadPublicView(api, handle).catch(() => null);
  return {
    doc: normalizeEmbedLayering(doc).doc,   // the same layering rule Preview applies (nothing is drawn over a player)
    assets: { urlFor: id => pictures.get(id) ?? null, videoUrlFor: id => videos.get(id) ?? null },
    gamid: visitorSnapshot(view),
  };
}

const ensureStyles = (doc, hrefs) => {
  for (const href of hrefs) {
    if ([...doc.querySelectorAll("link[rel=stylesheet]")].some(link => link.getAttribute("href") === href)) continue;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    doc.head.append(link);
  }
};

// The Wall's place on the page and its lifecycle: show() paints it (once it is prepared) at the column's width, hide() stops any playing player. Re-paints when the
// column's width changes (the Wall scales with the page, like Preview's mobile / desktop sizes).
export function createPublicWallView({ host, prepared, handle, api = defaultApi, doc = document, win = window }) {
  let players = null, videos = null, details = null, posters = null, paintedWidth = 0, showing = false, resizeTimer = 0;
  ensureStyles(doc, ["../wall-kit/wall-kit.css", "../wall-kit/game-details.css"]);
  const width = () => Math.max(WALL_MIN_WIDTH, Math.min(WALL_MAX_WIDTH, Math.floor(host.clientWidth || win.innerWidth || WALL_MAX_WIDTH)));
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

  async function paint() {
    const ready = await prepared;
    if (!showing || !ready) return;
    const target = width();
    players?.destroyAll();
    players = createPlayerManager();
    videos ??= createVideoPool();
    posters ??= createPosterLoader({ endpoint: api.MEDIA_POSTER_URL });
    details ??= createWallDetails({ element: make, handle, api, mount: node => doc.body.append(node), sourceLabels: PUBLIC_SOURCE_LABELS, posters });
    const painted = paintDocument(ready.doc, target, undefined, { mode: "view", assets: ready.assets, gamid: ready.gamid, players, posters, details, videos });
    if (!painted.ok) return;
    const column = make("div", "public-wall-column");
    column.style.setProperty("width", `${target}px`);
    column.append(...painted.stages);
    host.replaceChildren(column);
    paintedWidth = target;
  }
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (showing && Math.abs(width() - paintedWidth) > 1) paint(); }, 150); };
  // the column follows its container's real width (which changes when the page's own scrollbar appears, not only when the window is resized)
  if (typeof win.ResizeObserver === "function") new win.ResizeObserver(onResize).observe(host);
  else win.addEventListener("resize", onResize);

  return {
    show() { if (showing) return; showing = true; host.hidden = false; paint(); },
    hide() { if (!showing) return; showing = false; host.hidden = true; players?.destroyAll(); details?.closeAll?.(); },
    get showing() { return showing; },
  };
}
