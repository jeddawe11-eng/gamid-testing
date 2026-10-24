// The PUBLISHED Wall on a visitor's /@handle page. When the owner has published their Wall, it replaces the Public Profile body once the Intro is over (the Intro
// itself is unchanged); without a published Wall nothing here runs and the page is exactly the accepted Public Profile.
//
// Nothing new draws the Wall: it is the same pipeline Preview uses (paintDocument in VIEW mode + the player manager, posters, Game / Connection Details and the
// visitor view of live GamID data). What a visitor can get is decided by the database only:
//   - get_public_wall(handle): the published SNAPSHOT (never the private draft) of a PUBLIC GamID, with the storage location of only the assets it references;
//   - the storage policy "published wall media is readable": exactly those objects, and only while they are published (everything else stays owner-only);
//   - live GamID data: the anonymous public view (loadPublicView), the same calls the Public Profile makes - nothing the owner hid.
import * as defaultApi from "../account/supabase-client.js";
import { createPublishedVideoUrlCache } from "./published-video-url-cache.js";
import { paintDocument } from "../wall-kit/paint.js";
import { registerCustomFont } from "../wall-kit/custom-fonts.js";
import { normalizeEmbedLayering } from "../wall-kit/ops.js";
import { validateDocument } from "../wall/validate.js";
import { createPlayerManager } from "../wall-kit/embed/player.js";
import { createPosterLoader } from "../wall-kit/posters.js";
import { createVideoPool } from "../wall-kit/video-background.js";
import { createWallDetails } from "../wall-kit/gamid-details.js";
import { loadPublicView, providerLabel, PUBLIC_SOURCE_LABELS, usesGamerSections, usesGamerCovers } from "../wall-editor/gamid-data.js";
import { createArtworkStore } from "../wall-kit/gamid-artwork.js";
import { fetchGameArtwork } from "./game-artwork.js";
import { gamidHref, crewWallHref } from "./identity-link.js";
import { createWallStageNav } from "./public-wall-nav.js";
import { isFriendsStage } from "../wall/stage-types.js";
import { stickerView } from "../wall-kit/sticker-paint.js";

const publishedVideoUrls = createPublishedVideoUrlCache({ baseUrl: defaultApi.SUPABASE_URL });
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
export async function preparePublicWall(published, handle, api = defaultApi, videoCache = api === defaultApi ? publishedVideoUrls : null) {
  const doc = published?.document;
  if (!doc || !validateDocument(doc).valid) { videoCache?.forget?.(handle); return null; }
  const pictures = new Map(), videos = new Map();
  // Custom fonts the published Wall uses (only these are readable by visitors - storage policy "published wall fonts are readable"), registered on this page
  // before it is painted. Asked for only when the snapshot names one; a font that cannot load leaves its text in the catalog fallback.
  const fontsReady = JSON.stringify(doc).includes('"fontRef"') && typeof api.getPublicWallFonts === "function"
    ? api.getPublicWallFonts(handle).then(fonts => Promise.all((Array.isArray(fonts) ? fonts : []).map(async font => {
      try { const bytes = await api.loadPublicWallFont(font?.storage_path); if (bytes) await registerCustomFont(font.font_id, bytes); } catch { /* fallback font */ }
    }))).catch(() => null)
    : null;
  const list = Array.isArray(published.assets) ? published.assets : [];
  // F7-A: pictures used only by later stages wait for their stage; stage 1's (and the whole-Wall background) load now, during the Intro, as before
  const later = new Map([...pictureStages(doc)].filter(([, stages]) => !stages.has(0)));
  const loader = createPictureLoader(path => api.loadPublicWallPicture(path), pictures);
  // F6-A: a cached video URL belongs to this Wall, this publication and this asset; the fresh manifest is the only list that may use (or keep) one
  const publication = typeof published.published_at === "string" ? published.published_at : "";
  // F8-B1: a video whose internal rendition is READY names it in the fresh manifest; visitors play it, and the original stays the fallback (both scoped here)
  const renditionOf = asset => (typeof api.signPublicWallRendition === "function" && defaultApi.isRenditionPath(asset?.rendition_path) ? asset.rendition_path : null);
  const scoped = list.filter(asset => typeof asset?.asset_id === "string" && typeof asset?.storage_path === "string" && isVideoMime(asset.mime_type))
    .flatMap(asset => {
      const scope = { handle, publishedAt: publication, assetId: asset.asset_id };
      const rendition = renditionOf(asset);
      return [{ bucket: defaultApi.publicWallBucketFor(asset.storage_path, asset.mime_type), path: asset.storage_path, scope },
        ...(rendition ? [{ bucket: defaultApi.PUBLIC_WALL_RENDITION_BUCKET, path: rendition, scope }] : [])];
    });
  videoCache?.retain?.(handle, scoped);
  await Promise.all(list.map(async asset => {
    const id = asset?.asset_id, path = asset?.storage_path;
    if (typeof id !== "string" || typeof path !== "string") return;
    try {
      if (isVideoMime(asset.mime_type)) {
        // Only the current server-returned published asset list can consult the anonymous cache.
        const scope = { handle, publishedAt: publication, assetId: id };
        const lease = (bucket, objectPath, sign) => (videoCache ? videoCache.get({ bucket, path: objectPath, sign, scope }) : sign());
        const rendition = renditionOf(asset);
        let url = rendition ? await lease(defaultApi.PUBLIC_WALL_RENDITION_BUCKET, rendition, () => api.signPublicWallRendition(rendition)).catch(() => null) : null;
        // no READY rendition, or its lease failed: the original, exactly as before (the server decides with the same published predicate)
        if (!url) url = await lease(defaultApi.publicWallBucketFor(path, asset.mime_type), path, () => api.signPublicWallVideo(path, asset.mime_type));
        if (url) videos.set(id, url);
      }
      // F7-A: a picture no stage-1 element needs is fetched when its stage comes near (createPublicWallView), through the same RLS-checked read
      else if (later.has(id)) loader.defer(id, path, later.get(id));
      else { const url = await api.loadPublicWallPicture(path); if (url) pictures.set(id, url); }
    } catch { /* this one asset shows its placeholder */ }
  }));
  await fontsReady;
  const stickers = await prepareWallStickers(doc, handle, api);
  // My Duo opens the Duo's GamID and My Crew opens the Crew Wall - both in place (same tab), both carrying `from` so the destination offers "Back to @<this handle>"
  const pathname = globalThis.location?.pathname ?? "/";
  const view = await loadPublicView(api, handle, { duoLink: { newTab: false, href: duo => gamidHref(duo, { from: handle, pathname }) }, crewLink: { newTab: false, href: crewId => crewWallHref(crewId, { pathname, from: handle }) }, sections: usesGamerSections(doc) }).catch(() => null);
  return {
    doc: normalizeEmbedLayering(doc).doc,   // the same layering rule Preview applies (nothing is drawn over a player)
    assets: { urlFor: id => pictures.get(id) ?? null, videoUrlFor: id => videos.get(id) ?? null, whenPicture: (id, fill) => loader.whenPicture(id, fill) },
    pictureLoader: loader,
    gamid: visitorSnapshot(view),
    // Game Covers: Classic's visitor artwork read for this PUBLIC GamID (game-artwork, the route Classic uses), only when the Wall shows covers
    artwork: usesGamerCovers(doc) ? createArtworkStore(() => fetchGameArtwork(api.SUPABASE_URL ?? defaultApi.SUPABASE_URL, handle)) : null,
    stickers,
  };
}

// Friends Stickers V1: the approved stickers of this Wall's published Friends Stages (get_public_wall_stickers - never a waiting or rejected one), each with its
// sender's current public avatar (the same anonymous avatar read as the public profile; one read per sender). -> Map(stage id -> sticker views)
export async function prepareWallStickers(doc, handle, api = defaultApi) {
  const byStage = new Map();
  if (!doc?.stages?.some(isFriendsStage) || typeof api.getPublicWallStickers !== "function") return byStage;
  let rows = [];
  try { rows = await api.getPublicWallStickers(handle); } catch { return byStage; }
  const avatars = new Map();
  await Promise.all([...new Set(rows.map(row => row?.sender_avatar_media_reference).filter(Boolean))].map(async path => {
    try { avatars.set(path, await api.loadPublicAvatar(path)); } catch { /* the sender's initial shows instead */ }
  }));
  for (const row of Array.isArray(rows) ? rows : []) {
    const view = stickerView(row, avatars.get(row?.sender_avatar_media_reference) ?? null);
    if (!view) continue;
    if (!byStage.has(row.stage_id)) byStage.set(row.stage_id, []);
    byStage.get(row.stage_id).push(view);
  }
  return byStage;
}

// Who may add a sticker here: a signed-in visitor whose own GamID is public (visitors see who sent each sticker), never the Wall's owner. The server decides again
// when the sticker is sent. -> true / false (false for every anonymous visitor, without any extra request).
export async function canAddSticker(handle, api = defaultApi) {
  try {
    const session = await api.restoreSession?.();
    if (!session || typeof api.getMyStickerSender !== "function") return false;
    const me = await api.getMyStickerSender();
    return Boolean(me?.can_send && me.gamid_handle && me.gamid_handle !== String(handle).toLowerCase());
  } catch { return false; }
}

// F7-A: assetId -> the stage indexes that show it as a picture (an artwork element or a stage background). The whole-Wall background shows on every stage, so it
// counts as stage 1 (loaded with the Intro). Videos are not pictures here (F3 gates them).
export function pictureStages(doc) {
  const map = new Map();
  const add = (id, index) => { if (typeof id !== "string" || !id) return; if (!map.has(id)) map.set(id, new Set()); map.get(id).add(index); };
  if (doc?.background?.kind === "image") add(doc.background.assetId, 0);
  (Array.isArray(doc?.stages) ? doc.stages : []).forEach((stage, index) => {
    if (stage?.background?.kind === "image") add(stage.background.assetId, index);
    for (const element of Array.isArray(stage?.elements) ? stage.elements : []) if (element?.type === "image" && element.payload?.media !== "video") add(element.payload?.assetId, index);
  });
  return map;
}

// F7-A: the later pictures. One read per asset, shared by every frame that shows it; a frame registered after the read finished is filled at once (or gets the
// placeholder when the read failed). Nothing here decides access: the read is the same RLS-checked anonymous one, for assets of the fresh manifest only.
export function createPictureLoader(load, pictures = new Map()) {
  const paths = new Map(), stagesOf = new Map(), waiting = new Map(), started = new Map(), done = new Set();
  const finish = id => { done.add(id); const url = pictures.get(id) ?? null; for (const fill of waiting.get(id) ?? []) { try { fill(url); } catch { /* a detached frame */ } } waiting.delete(id); };
  const start = id => {
    if (started.has(id) || !paths.has(id)) return;
    started.set(id, Promise.resolve().then(() => load(paths.get(id))).then(url => { if (url) pictures.set(id, url); }, () => {}).then(() => finish(id)));
  };
  return {
    defer(id, path, stages) { paths.set(id, path); stagesOf.set(id, new Set(stages)); },
    // -> true when the painter should wait for this picture (it is a later one); false: not a later picture (the painter shows its usual placeholder)
    whenPicture(id, fill) {
      if (!paths.has(id)) return false;
      if (done.has(id)) { const url = pictures.get(id) ?? null; queueMicrotask(() => fill(url)); return true; }
      if (!waiting.has(id)) waiting.set(id, []);
      waiting.get(id).push(fill);
      return true;
    },
    requestStage(index) { for (const [id, stages] of stagesOf) if (stages.has(index)) start(id); },
    requestAll() { for (const id of paths.keys()) start(id); },
    get pending() { return [...paths.keys()].filter(id => !started.has(id)).length; },
    get deferred() { return paths.size; },
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

// Mobile Public Wall Visitor V2 (2026-10-22): the screens that get the phone presentation - portrait phones and landscape phones (at most 500px tall). Tablets and
// desktops keep the accepted column exactly as before.
export const WALL_PHONE_QUERY = "(max-width: 599px), (orientation: landscape) and (max-height: 500px) and (max-width: 1023px)";
// the room the portrait stage bar takes under the stage (public-wall-mobile.css .wall-stage-nav: a 44px button row in a 52px pill, .5rem above the screen's edge):
// a phone stage is sized so the whole stage AND the bar fit on the screen together
export const WALL_PHONE_BAR_PX = 64;
export const WALL_PHONE_MIN_WIDTH = 120;

// The width a stage is painted at. Tablets / desktops: the column's width (280..900px), as before. Phones: no wider than the column, and no taller than the screen
// (its stable height, so a browser toolbar sliding in or out never repaints the Wall) - the visitor sees one whole stage at a time, in the owner's proportions.
// Landscape "Wide" fills the column's width instead (the stage is then taller than the screen and scrolls).
export function stageWidthFor({ column, viewportHeight, canvas, phone, landscape = false, wide = false, multi = false }) {
  const columnWidth = Math.floor(column || WALL_MAX_WIDTH);
  if (!phone) return Math.max(WALL_MIN_WIDTH, Math.min(WALL_MAX_WIDTH, columnWidth));
  const fitsColumn = Math.max(WALL_PHONE_MIN_WIDTH, Math.min(WALL_MAX_WIDTH, columnWidth));
  if (landscape && wide) return fitsColumn;
  const ratio = canvas?.width > 0 && canvas?.height > 0 ? canvas.width / canvas.height : 1000 / 1778;
  const height = Math.max(0, viewportHeight - (!landscape && multi ? WALL_PHONE_BAR_PX : 0));
  return Math.max(WALL_PHONE_MIN_WIDTH, Math.min(fitsColumn, Math.floor(height * ratio)));
}

// The Wall's place on the page and its lifecycle: show() paints it (once it is prepared) at the column's width, hide() stops any playing player. Re-paints when the
// column's width changes (the Wall scales with the page, like Preview's mobile / desktop sizes).
export function createPublicWallView({ host, prepared, handle, api = defaultApi, doc = document, win = window }) {
  let players = null, videos = null, details = null, posters = null, paintedWidth = 0, showing = false, resizeTimer = 0, column = null, waiting = false, lastReady = null;
  ensureStyles(doc, ["../wall-kit/wall-kit.css", "../wall-kit/game-details.css", "public-wall-mobile.css"]);
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const phoneQuery = typeof win.matchMedia === "function" ? win.matchMedia(WALL_PHONE_QUERY) : null;
  const phone = () => Boolean(phoneQuery?.matches);
  const landscape = () => win.innerWidth > win.innerHeight;
  // the screen's height without the browser's sliding toolbars (100svh); innerHeight where svh is unknown
  const probe = make("div", "public-wall-vh");
  probe.setAttribute("aria-hidden", "true");
  const viewportHeight = () => { if (!probe.isConnected) doc.body.append(probe); return probe.offsetHeight || win.innerHeight || 0; };
  const nav = createWallStageNav({ doc, win, onWide: () => paint(), topInset: () => (phone() ? parseFloat(win.getComputedStyle?.(host).paddingTop) || 0 : 0) });
  host.after(nav.element);
  const columnWidth = () => { const style = win.getComputedStyle?.(host); const pad = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0; return (host.clientWidth || win.innerWidth || WALL_MAX_WIDTH) - pad; };
  const width = ready => stageWidthFor({ column: columnWidth(), viewportHeight: viewportHeight(), canvas: ready?.doc?.canvas, phone: phone(), landscape: landscape(), wide: nav.wide, multi: (ready?.doc?.stages?.length ?? 0) > 1 });
  const fullscreen = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  const layoutClasses = () => { const root = doc.documentElement; root.classList.toggle("is-wall-phone", phone()); root.classList.toggle("is-wall-phone-wide", phone() && landscape() && nav.wide); };

  async function paint() {
    const ready = await prepared;
    if (!showing) return;
    lastReady = ready;
    const wasPhone = doc.documentElement.classList.contains("is-wall-phone");
    layoutClasses();
    // a Wall that cannot be drawn (it failed validation here, or could not be prepared) says so instead of leaving an empty page
    if (!ready) { host.replaceChildren(make("p", "public-wall-state", "This Wall can't be shown right now. Please try again later.")); nav.hide(); return; }
    const target = width(ready);
    // on a phone a repaint (rotation, Fit / Wide) brings the visitor back to the same stage and place (tablets / desktops: as before)
    const anchor = column && (wasPhone || phone()) ? nav.anchor() : null;
    players?.destroyAll();
    players = createPlayerManager();
    videos ??= createVideoPool({ viewport: { win, doc } });
    posters ??= createPosterLoader({ endpoint: api.MEDIA_POSTER_URL });
    details ??= createWallDetails({ element: make, handle, api, mount: node => doc.body.append(node), sourceLabels: PUBLIC_SOURCE_LABELS, posters });
    const painted = paintDocument(ready.doc, target, undefined, { mode: "view", assets: ready.assets, gamid: ready.gamid, players, posters, details, videos, artwork: ready.artwork ?? null, stickersFor: stage => ready.stickers?.get(stage.id) ?? [] });
    if (!painted.ok) { host.replaceChildren(make("p", "public-wall-state", "This Wall can't be shown right now. Please try again later.")); nav.hide(); return; }
    column = make("div", "public-wall-column");
    column.style.setProperty("width", `${target}px`);
    column.append(...painted.stages);
    host.replaceChildren(column);
    videos.resume();
    paintedWidth = target;
    waiting = false;
    nav.attach(painted.stages, phone(), landscape());
    if (anchor) nav.restore(anchor);
    watchStages(ready.pictureLoader, painted.stages);
    addStickerButtons(ready, painted.stages);
  }
  // Friends Stickers V1: "Add sticker" on each Friends Stage, only for a visitor who may send one (signed in, public GamID, not the owner). The send flow is loaded
  // only when it is opened; sending changes nothing on this page (the sticker waits for the owner's approval).
  let mayAdd = null;
  async function addStickerButtons(ready, stages) {
    if (!ready.doc.stages.some(isFriendsStage)) return;
    mayAdd ??= canAddSticker(handle, api);
    if (!(await mayAdd) || !showing) return;
    ensureStyles(doc, ["../wall-kit/stickers.css"]);
    ready.doc.stages.forEach((stage, index) => {
      const node = stages[index];
      if (!isFriendsStage(stage) || !node?.isConnected || node.querySelector(".wall-add-sticker")) return;
      const add = make("button", "wall-add-sticker");
      add.type = "button";
      const plus = make("span", "", "+");
      plus.setAttribute("aria-hidden", "true");
      add.append(plus, " Add sticker");
      add.setAttribute("aria-label", `Add a sticker to @${handle}'s Friends Stage`);
      add.addEventListener("click", async () => {
        add.disabled = true;
        try {
          const { openStickerComposer } = await import("../wall-kit/sticker-composer.js");
          openStickerComposer({ api, doc, win, handle, stageId: stage.id, onClose: () => { add.disabled = false; } });
        } catch { add.disabled = false; }
      });
      node.append(add);
    });
  }
  // F7-A: a stage's later pictures are fetched once the stage is within one viewport height of the screen (above or below); without IntersectionObserver
  // every later picture is fetched at once (the previous behaviour)
  let stageObserver = null;
  function watchStages(loader, stages) {
    stageObserver?.disconnect();
    stageObserver = null;
    if (!loader?.pending) return;
    if (typeof win.IntersectionObserver !== "function") { loader.requestAll(); return; }
    stageObserver = new win.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) loader.requestStage(stages.indexOf(entry.target));
      if (!loader.pending) { stageObserver?.disconnect(); stageObserver = null; }
    }, { rootMargin: "100% 0px", threshold: 0 });
    for (const stage of stages) stageObserver.observe(stage);
  }
  // A new size (rotation, the column's width, Fit / Wide) repaints the Wall at its new width - except under a player: while a player is fullscreen nothing is
  // repainted (it would end the fullscreen), and while an inline player is open the painted Wall is only scaled (the player keeps playing). Either way the real
  // repaint follows as soon as the player is closed or leaves fullscreen.
  const relayout = () => {
    if (!showing || !lastReady) return;
    if (fullscreen()) { waiting = true; return; }
    layoutClasses();
    const target = width(lastReady);
    if (Math.abs(target - paintedWidth) <= 1) { column?.style.removeProperty("zoom"); if (!waiting) return; }
    if (column && players?.activeProviders?.().length) { column.style.setProperty("zoom", String(target / paintedWidth)); waiting = true; return; }
    paint();
  };
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 150); };
  // the column follows its container's real width (which changes when the page's own scrollbar appears, not only when the window is resized)
  if (typeof win.ResizeObserver === "function") new win.ResizeObserver(onResize).observe(host);
  win.addEventListener("resize", onResize);   // a phone's height alone decides its stage size
  phoneQuery?.addEventListener?.("change", onResize);
  for (const name of ["fullscreenchange", "webkitfullscreenchange"]) doc.addEventListener(name, () => { if (waiting && !fullscreen()) onResize(); });
  // a player closed: a repaint that waited for it happens now
  host.addEventListener("click", () => setTimeout(() => { if (waiting && !players?.activeProviders?.().length && !fullscreen()) relayout(); }, 0), true);

  return {
    show() { if (showing) return; showing = true; host.hidden = false; paint(); },
    hide() { if (!showing) return; showing = false; host.hidden = true; videos?.suspend(); players?.destroyAll(); details?.closeAll?.(); nav.hide(); doc.documentElement.classList.remove("is-wall-phone", "is-wall-phone-wide"); },
    get showing() { return showing; },
  };
}
