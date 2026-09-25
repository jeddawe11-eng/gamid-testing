// The owner's Wall assets in the editor: list, upload, delete and hand pictures to the painter as blob: URLs. All network goes through the accepted account client (injected as
// `api`, so this is testable); every rule from wall-kit/assets.js is checked before anything is sent, and the storage bucket and database enforce the same rules again.
import { checkAssetFile, checkAssetDimensions, checkAssetCount, describeAssetError } from "../wall-kit/assets.js";
import { assetsInUse } from "../wall-kit/ops.js";

async function decodeSize(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("DECODE_FAILED")); };
    image.src = url;
  });
}

export function createAssetStore({ api, userId, onChange = () => {}, decode = decodeSize }) {
  let currentUserId = userId;
  let assets = [];
  const urls = new Map();       // assetId -> blob: URL
  const loading = new Set();    // assetIds being fetched
  const byId = id => assets.find(asset => asset.asset_id === id) ?? null;

  function ensureUrl(id) {
    if (urls.has(id) || loading.has(id)) return;
    const asset = byId(id);
    if (!asset) return;
    loading.add(id);
    Promise.resolve(api.loadWallAsset(asset.storage_path)).then(url => { if (url) urls.set(id, url); }).catch(() => { /* the picture shows as a placeholder */ }).finally(() => { loading.delete(id); onChange(); });
  }

  return {
    get assets() { return assets; },
    setUserId(id) { currentUserId = id; },
    urlFor(assetId) { const url = urls.get(assetId); if (!url) ensureUrl(assetId); return url ?? null; },
    async refresh() {
      assets = (await api.listWallAssets()) ?? [];
      for (const asset of assets) ensureUrl(asset.asset_id);
      onChange();
      return assets;
    },
    // -> { ok: true, asset } | { ok: false, message }
    async upload(file) {
      const fileCheck = checkAssetFile({ type: file.type, size: file.size });
      if (!fileCheck.ok) return fileCheck;
      const countCheck = checkAssetCount(assets.length);
      if (!countCheck.ok) return countCheck;
      let size;
      try { size = await decode(file); } catch { return { ok: false, code: "INVALID_FILE_TYPE", message: "That image could not be read. Try another file." }; }
      const sizeCheck = checkAssetDimensions(size);
      if (!sizeCheck.ok) return sizeCheck;
      try {
        const asset = await api.uploadWallAsset(file, currentUserId, size);
        if (!asset) return { ok: false, message: describeAssetError(null) };
        assets = [asset, ...assets.filter(existing => existing.asset_id !== asset.asset_id)];
        ensureUrl(asset.asset_id);
        onChange();
        return { ok: true, asset };
      } catch (error) {
        return { ok: false, code: error?.code, message: describeAssetError(error) };
      }
    },
    // The Wall being edited is checked first (a picture in use is never deleted from under it); the database checks the SAVED draft too.
    async remove(assetId, doc) {
      if (doc && assetsInUse(doc).has(assetId)) return { ok: false, code: "WALL_ASSET_IN_USE", message: describeAssetError({ code: "WALL_ASSET_IN_USE" }) };
      try {
        await api.deleteWallAsset(assetId);
        assets = assets.filter(asset => asset.asset_id !== assetId);
        const url = urls.get(assetId);
        if (url) { URL.revokeObjectURL(url); urls.delete(assetId); }
        onChange();
        return { ok: true };
      } catch (error) {
        return { ok: false, code: error?.code, message: describeAssetError(error) };
      }
    },
    dimensionsOf(assetId) { const asset = byId(assetId); return asset ? { width: asset.width, height: asset.height } : null; },
    dispose() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); },
  };
}
