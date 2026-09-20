// GAME ID WALL - W0 PROTOTYPE - tiny local diagnostics readout (no analytics, nothing leaves the page).
export function sampleAssetBytes() {
  let bytes = 0, files = 0;
  for (const entry of performance.getEntriesByType("resource")) {
    if (!/\/prototypes\/game-id-wall-w0\/(assets|fonts)\//.test(entry.name)) continue;
    files += 1;
    bytes += entry.transferSize || entry.encodedBodySize || 0;
  }
  return { bytes, files };
}

export function startDiag(target, collect, intervalMs = 1000) {
  const paint = () => {
    const data = collect();
    const assets = sampleAssetBytes();
    const lines = [
      `viewport      ${innerWidth} x ${innerHeight}  (visual ${Math.round(visualViewport?.width || innerWidth)} x ${Math.round(visualViewport?.height || innerHeight)})  dpr ${devicePixelRatio}`,
      ...Object.entries(data).map(([key, value]) => `${key.padEnd(13)} ${value}`),
      `sample assets ${assets.files} files, ${(assets.bytes / 1024).toFixed(0)} KB${assets.bytes ? "" : " (0 = cached / not measurable)"}`,
      `agent         ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 96)}`,
    ];
    target.textContent = lines.join("\n");
  };
  paint();
  const timer = setInterval(paint, intervalMs);
  return { paint, stop: () => clearInterval(timer) };
}
