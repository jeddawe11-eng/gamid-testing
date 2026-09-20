// GAME ID WALL - W0 PROTOTYPE - embed size lab. It answers ONE question with real players: how does each provider actually behave at
// different widths and heights on THIS device? Nothing loads until you tap "Load player"; one lab player at a time; Destroy removes the frame.
import { classifyEmbedPx, EMBED } from "./model.js?v=w0c";
import { SAMPLE_MEDIA } from "./assets.js?v=w0c";
import { el, css } from "./render.js?v=w0c";
import { buildIframe } from "./embeds.js?v=w0c";
import { startDiag } from "./diag.js?v=w0c";

const S = { provider: "spotify", kind: "playlist", w: 360, h: 352, frame: null };
const controls = document.getElementById("controls"), stage = document.getElementById("stage"), readout = document.getElementById("readout"), diagEl = document.getElementById("diag");

function button(label, onClick, cls = "pbtn") { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", onClick); return b; }
function group(label, items, current, onPick) {
  const row = el("div", "lab-row"); row.append(el("span", "plabel", label));
  for (const [key, text] of items) { const b = button(text, () => { onPick(key); render(); }); if (String(key) === String(current)) b.classList.add("on"); row.append(b); }
  return row;
}

function media() {
  if (S.provider === "youtube") return SAMPLE_MEDIA.youtube;
  return S.kind === "track" ? SAMPLE_MEDIA.spotifyTrack : SAMPLE_MEDIA.spotifyPlaylist;
}

function destroy() {
  if (S.frame) { S.frame.setAttribute("src", "about:blank"); S.frame.remove(); S.frame = null; }
}

function load() {
  destroy();
  const box = document.getElementById("box");
  S.frame = buildIframe(media(), { autoplay: false });   // the lab never requests autoplay
  box.append(S.frame);
  paint();
}

function paint() {
  const verdict = classifyEmbedPx(S.provider, S.w, S.h);
  const lines = [
    `provider   ${S.provider} ${S.provider === "spotify" ? S.kind : "video"}`,
    `box        ${S.w} x ${S.h} CSS px  (aspect ${(S.w / S.h).toFixed(2)})`,
    `device     viewport ${innerWidth} x ${innerHeight}, dpr ${devicePixelRatio}`,
    `W0 rule    ${verdict.mode.toUpperCase()} - ${verdict.reason}`,
    S.provider === "youtube" ? `YouTube    documented inline minimum ${EMBED.youtube.inlineMinPx.w}x${EMBED.youtube.inlineMinPx.h}, recommended ${EMBED.youtube.recommendedPx.w}x${EMBED.youtube.recommendedPx.h}` : `Spotify    no documented minimum / maximum. Look at what the player actually does at this size, then try other sizes.`,
    `player     ${S.frame ? "LOADED (real third-party iframe)" : "not loaded - nothing requested yet"}`,
  ];
  readout.textContent = lines.join("\n");
}

function render() {
  controls.replaceChildren();
  controls.append(group("Provider", [["spotify", "Spotify"], ["youtube", "YouTube"]], S.provider, key => { S.provider = key; destroy(); if (key === "youtube") { S.w = 320; S.h = 180; } else { S.w = 360; S.h = 352; } }));
  if (S.provider === "spotify") controls.append(group("Resource", [["playlist", "Playlist"], ["track", "Track"]], S.kind, key => { S.kind = key; destroy(); }));
  const widths = S.provider === "spotify" ? [200, 260, 300, 340, 360, 390, 412, 480, 640] : [120, 160, 200, 240, 320, 390, 480, 640];
  const heights = S.provider === "spotify" ? [80, 120, 152, 232, 300, 352, 420, 500, 600] : [70, 90, 120, 180, 200, 270, 360];
  controls.append(group("Width px", widths.map(v => [v, String(v)]), S.w, v => { S.w = Number(v); }));
  controls.append(group("Height px", heights.map(v => [v, String(v)]), S.h, v => { S.h = Number(v); }));
  const row = el("div", "lab-row");
  row.append(button("Load player (real request)", load, "pbtn primary"), button("Destroy player", () => { destroy(); paint(); }));
  controls.append(row);
  const box = document.getElementById("box") || el("div", "lab-box");
  box.id = "box";
  css(box, { width: `${S.w}px`, height: `${S.h}px` });
  if (!box.isConnected) stage.append(box);
  paint();
}

render();
startDiag(diagEl, () => ({ "lab player": S.frame ? `${S.provider} ${S.w}x${S.h}` : "none" }), 1500);
window.__w0lab = S;
