// Real posters / thumbnails for Wall facades, provider-neutral. The browser asks ONLY GamID's own media-poster Edge Function (supabase/functions/_shared/media-poster.js)
// for { provider, kind, id } - never a provider directly, so looking at a Wall sends nothing to the content's own site - and gets image bytes that the server already
// recognised by signature. They become a blob: URL (the page CSP allows img-src blob:, no new host is added). Anything that fails - no documented source, an offline
// live channel, a network error, a non-image answer - resolves to null and the facade simply keeps its neutral poster: never a broken image, and nothing autoplays.
// Which content has a poster is declared by each provider adapter (`poster: true` on a kind - the server's source table is kept identical by a test).

const MAX_CONCURRENT = 4;
const QUERY = /^[a-z_]+=[A-Za-z0-9%._:-]+(&[a-z_]+=[A-Za-z0-9%._:-]+)*$/;

export const hasPoster = descriptor => !!descriptor?.poster && typeof descriptor.providerKey === "string" && typeof descriptor.contentKind === "string" && typeof descriptor.id === "string";
export function posterQuery(descriptor) {
  if (!hasPoster(descriptor)) return null;
  return new URLSearchParams({ p: descriptor.providerKey, k: descriptor.contentKind, id: descriptor.id }).toString();
}

export function createPosterLoader({ endpoint, fetchImpl = globalThis.fetch?.bind(globalThis), createUrl = blob => globalThis.URL?.createObjectURL?.(blob) ?? null } = {}) {
  const cache = new Map();   // query -> Promise<string | null>
  const ready = new Map();   // query -> the blob: URL once loaded (a repaint shows it at once, without fading in again)
  const queue = [];
  let running = 0;
  const pump = () => {
    while (running < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      running += 1;
      job().finally(() => { running -= 1; pump(); });
    }
  };
  // `query` is a ready-made query string for the endpoint (a poster: posterQuery; a connection avatar: built by the data layer from a validated hash).
  function load(query) {
    if (typeof query !== "string" || !QUERY.test(query) || typeof endpoint !== "string" || typeof fetchImpl !== "function") return Promise.resolve(null);
    if (cache.has(query)) return cache.get(query);
    const promise = new Promise(resolve => {
      queue.push(async () => {
        try {
          const response = await fetchImpl(`${endpoint}?${query}`, { credentials: "omit", referrerPolicy: "no-referrer", cache: "default" });
          const type = response?.headers?.get?.("content-type") ?? "";
          if (!response?.ok || !/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) { resolve(null); return; }
          const url = createUrl(await response.blob());
          if (url) ready.set(query, url);
          resolve(url);
        } catch { resolve(null); }
      });
      pump();
    });
    cache.set(query, promise);
    return promise;
  }
  return {
    load,
    ready: query => ready.get(query) ?? null,
    forDescriptor: descriptor => load(posterQuery(descriptor)),
    readyFor: descriptor => ready.get(posterQuery(descriptor)) ?? null,
  };
}
