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

// fills every artwork slot under `root`: [data-game-key] tiles (icon, else grid), [data-artwork-row="<name>|<year>"] My Games tiles, [data-game-bg] backgrounds
// (hero, else grid). A slot that already has an image is left alone. -> number of images placed
export function applyGameArtwork(root, data) {
  if (!root || !data?.artwork) return 0;
  const doc = root.ownerDocument || globalThis.document;
  const art = key => (typeof key === "string" && Object.hasOwn(data.artwork, key) ? data.artwork[key] : null);
  const pick = (entry, kinds) => kinds.map(kind => entry?.[kind]).find(url => typeof url === "string" && CDN_URL.test(url)) || null;
  let placed = 0;
  const place = (el, url, cls) => { if (!url || el.querySelector(".game-art")) return; el.append(image(doc, url, cls)); el.classList.add("has-art"); placed++; };
  for (const el of root.querySelectorAll("[data-game-key]")) place(el, pick(art(el.getAttribute("data-game-key")), ["icon", "grid"]), "game-art");
  for (const el of root.querySelectorAll("[data-artwork-row]")) place(el, pick(art(data.myGames?.[el.getAttribute("data-artwork-row")]), ["icon", "grid"]), "game-art");
  // Favorite Games: a portrait cover only (never a landscape image squeezed into a portrait card)
  for (const el of root.querySelectorAll("[data-game-cover]")) place(el, pick(art(el.getAttribute("data-game-cover")), ["cover"]), "game-art is-cover");
  for (const el of root.querySelectorAll("[data-game-bg]")) {
    const url = pick(art(el.getAttribute("data-game-bg")), ["hero", "grid"]);
    if (!url || el.querySelector(".game-art-bg")) continue;
    // a background layer over the gradient: an image that fails to load leaves the gradient (the URL is a checked provider CDN path: no quotes, no parentheses)
    const layer = doc.createElement("span"); layer.className = "game-art-bg"; layer.style.backgroundImage = `url("${url}")`;
    el.append(layer); el.classList.add("has-art"); placed++;
  }
  return placed;
}
