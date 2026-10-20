// Game artwork on the public Classic Profile (desktop) - PROVISIONAL TESTING evaluation of SteamGridDB through GamID's own game-artwork Edge Function (the
// provider key never reaches the browser). The response only ever names images the server matched reliably; every tile keeps its initials underneath, so a
// missing, refused, slow or broken image simply leaves the initials. Images load from the provider's CDN with no referrer. Nothing is stored in the browser.
const CDN_URL = /^https:\/\/cdn2\.steamgriddb\.com\/[A-Za-z0-9/._-]{1,200}$/;
export const artworkRowKey = (name, year) => `${name}|${Number.isInteger(year) ? year : ""}`;

export async function fetchGameArtwork(baseUrl, handle, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  try {
    const response = await fetchImpl(`${baseUrl}/functions/v1/game-artwork/${encodeURIComponent(handle)}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = await response.json();
    return body && body.enabled && body.artwork && typeof body.artwork === "object" ? body : null;
  } catch { return null; }
}

// one Crew's game (its Crew Wall must be published): the Crew header logo
export async function fetchCrewArtwork(baseUrl, crewId, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  try {
    const response = await fetchImpl(`${baseUrl}/functions/v1/game-artwork/crew/${encodeURIComponent(crewId)}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = await response.json();
    return body && body.enabled && body.artwork && typeof body.artwork === "object" ? body : null;
  } catch { return null; }
}

function image(doc, url, className) {
  const img = doc.createElement("img");
  img.className = className; img.alt = ""; img.decoding = "async"; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.remove(), { once: true });   // the initials stay
  img.src = url;
  return img;
}

// F7-C (Mazen's choice 2026-10-21): a Favorite Games cover offers the provider's own thumbnail of the SAME grid (thumb/<hash>.jpg, 267 x 400, about 50-95 KB)
// beside the full 600 x 900 image (about 0.7-1.1 MB). The browser picks the thumbnail only where it is sharp enough (srcset / sizes: the cover's displayed
// width x device pixel ratio <= 267) and the full image otherwise, so the artwork never changes. A thumbnail that fails falls back to the full image once.
const COVER_GRID = /^https:\/\/cdn2\.steamgriddb\.com\/grid\/([0-9a-f]{8,64})\.(?:png|jpe?g|webp)$/;
export const COVER_THUMB_WIDTH = 267, COVER_FULL_WIDTH = 600;
export const coverThumbUrl = url => { const match = COVER_GRID.exec(typeof url === "string" ? url : ""); return match ? `https://cdn2.steamgriddb.com/thumb/${match[1]}.jpg` : null; };
function coverImage(doc, url, className, slot) {
  const thumb = coverThumbUrl(url);
  if (!thumb) return image(doc, url, className);
  const img = doc.createElement("img");
  img.className = className; img.alt = ""; img.decoding = "async"; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
  let retried = false;
  img.addEventListener("error", () => {
    if (!retried && (img.currentSrc || "") !== url) { retried = true; img.removeAttribute?.("srcset"); img.removeAttribute?.("sizes"); img.src = url; return; }   // the thumbnail failed: the full image
    img.remove();   // the full image failed too: the initials stay
  });
  // the slot's laid-out width when known (a hidden slot measures 0: then the full width, never a soft cover); "auto" lets lazy images use their real size
  const width = Math.round(Number(slot?.clientWidth) || 0);
  img.setAttribute("sizes", `auto, ${width > 0 ? width : COVER_FULL_WIDTH}px`);
  img.setAttribute("srcset", `${thumb} ${COVER_THUMB_WIDTH}w, ${url} ${COVER_FULL_WIDTH}w`);
  img.src = url;   // browsers without srcset keep today's image
  return img;
}

// fills every artwork slot under `root`: [data-game-key] tiles (icon, else grid), [data-artwork-row="<name>|<year>"] My Games tiles, [data-game-bg] backgrounds
// (hero, else grid). A slot that already has an image is left alone. -> number of images placed
export function applyGameArtwork(root, data) {
  if (!root || !data?.artwork) return 0;
  const doc = root.ownerDocument || globalThis.document;
  const art = key => (typeof key === "string" && Object.hasOwn(data.artwork, key) ? data.artwork[key] : null);
  const pick = (entry, kinds) => kinds.map(kind => entry?.[kind]).find(url => typeof url === "string" && CDN_URL.test(url)) || null;
  let placed = 0;
  const place = (el, url, cls, make = image) => { if (!url || el.querySelector(".game-art")) return; el.append(make(doc, url, cls, el)); el.classList.add("has-art"); placed++; };
  for (const el of root.querySelectorAll("[data-game-key]")) place(el, pick(art(el.getAttribute("data-game-key")), ["icon", "grid"]), "game-art");
  for (const el of root.querySelectorAll("[data-artwork-row]")) place(el, pick(art(data.myGames?.[el.getAttribute("data-artwork-row")]), ["icon", "grid"]), "game-art");
  // Favorite Games: a portrait cover only (never a landscape image squeezed into a portrait card)
  for (const el of root.querySelectorAll("[data-game-cover]")) place(el, pick(art(el.getAttribute("data-game-cover")), ["cover"]), "game-art is-cover", coverImage);
  for (const el of root.querySelectorAll("[data-game-bg]")) {
    const url = pick(art(el.getAttribute("data-game-bg")), ["hero", "grid"]);
    if (!url || el.querySelector(".game-art-bg")) continue;
    // a background layer over the gradient: an image that fails to load leaves the gradient (the URL is a checked provider CDN path: no quotes, no parentheses)
    const layer = doc.createElement("span"); layer.className = "game-art-bg"; layer.style.backgroundImage = `url("${url}")`;
    el.append(layer); el.classList.add("has-art"); placed++;
  }
  return placed;
}
