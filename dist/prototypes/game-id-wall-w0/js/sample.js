// GAME ID WALL - W0 PROTOTYPE - the SAMPLE Wall. Fake content only: nothing here is real user data or a real GamID.
import { createDoc, addNode, groupNodes, sanitizeText, STAGE_H } from "./model.js?v=w0d";
import { ASSETS, BLOCKS, SAMPLE_MEDIA } from "./assets.js?v=w0d";

const text = (content, geo) => ({ content: sanitizeText({ text: "", ...content }), geo });

export function createSampleWall() {
  const doc = createDoc({ stages: 3 });
  const put = (stage, spec) => addNode(doc, stage, spec.content, spec.geo);
  const image = (asset, extra = {}) => ({ type: "image", asset, alt: ASSETS[asset].alt, opacity: 1, ...extra });
  const fit = (asset, w) => ({ w, h: Math.round((w * ASSETS[asset].h) / ASSETS[asset].w) });
  const block = (key, x, y, w) => ({ content: { type: "block", block: key, variant: "standard" }, geo: { x, y, w, h: Math.round((w * BLOCKS[key].h) / BLOCKS[key].w) } });
  const embed = (media, x, y, w, extra = {}) => {
    const content = { type: "embed", ...media, aspect: "16:9", variant: "standard", ...extra };
    const h = media.provider === "youtube" ? Math.round((w * 9) / 16) : Math.round(w * (content.variant === "compact" ? 152 / 390 : 352 / 390));
    return { content, geo: { x, y, w, h } };
  };

  // ---------------------------------------------------------------- STAGE 1: hero (title / character / identity), glow tests at the top edge and above seam 1
  put(0, text({ text: "TOP EDGE GLOW", font: "chakra", size: 64, color: "#ffffff", glow: { color: "#38e3ff", radius: 34 } }, { x: 60, y: 4, w: 880, h: 84 }));
  put(0, text({ text: "FREELANCER", font: "bebas", size: 215, color: "#2a1656", outline: { color: "#7a3bff", width: 3 } }, { x: 20, y: 200, w: 960, h: 230 }));
  put(0, { content: image("character"), geo: { x: 300, y: 400, ...fit("character", 640) } });
  put(0, text({ text: "SP1KA", font: "orbitron", size: 250, gradient: { a: "#ff4fd8", b: "#38e3ff", angle: 100 }, glow: { color: "#ff4fd8", radius: 36 } }, { x: 30, y: 640, w: 940, h: 290 }));
  put(0, text({ text: "CLUTCH PLAYER", font: "rajdhani", size: 88, color: "#ffffff", align: "left", outline: { color: "#ff4fd8", width: 2 }, shadow: { color: "#000000", x: 0, y: 6, blur: 10 } }, { x: 40, y: 960, w: 640, h: 104 }));
  put(0, block("identity.card", 40, 1330, 640));
  put(0, text({ text: "SEAM 1 - BOTTOM GLOW", font: "orbitron", size: 56, color: "#ffffff", glow: { color: "#ff4fd8", radius: 40 } }, { x: 40, y: 1690, w: 920, h: 80 }));

  // ---------------------------------------------------------------- STAGE 2: media (YouTube behind a decorative frame, Spotify, a block, images)
  put(1, text({ text: "SEAM 1 - TOP GLOW", font: "orbitron", size: 56, color: "#ffffff", glow: { color: "#ff4fd8", radius: 40 } }, { x: 40, y: 4, w: 920, h: 80 }));
  put(1, text({ text: "WATCH THE CLIP", font: "russo", size: 84, color: "#ffcf4a", align: "left" }, { x: 80, y: 96, w: 780, h: 100 }));
  // full-width 16:9: 1000 units = 360 px on the narrowest phone -> 360 x 202 CSS px, which still meets YouTube's 200x200 inline minimum
  put(1, embed(SAMPLE_MEDIA.youtube, 0, 210, 1000));
  // the gap under the YouTube box (>= 150 units) is left free on purpose: the "Close player" control lives OUTSIDE the player box, below it
  put(1, embed(SAMPLE_MEDIA.spotifyPlaylist, 200, 925, 600, { variant: "standard" }));
  put(1, block("league.rank", 460, 1480, 500));
  put(1, { content: image("photo"), geo: { x: 40, y: 1480, ...fit("photo", 340) } });
  put(1, text({ text: "SEAM 2 - BOTTOM GLOW", font: "orbitron", size: 56, color: "#ffffff", glow: { color: "#ffb84a", radius: 40 } }, { x: 40, y: 1690, w: 920, h: 80 }));

  // ---------------------------------------------------------------- STAGE 3: typography stress, small YouTube tile, Spotify compact, a pre-made group, OVERRIDE background
  put(2, text({ text: "SEAM 2 - TOP GLOW", font: "orbitron", size: 56, color: "#ffffff", glow: { color: "#ffb84a", radius: 40 } }, { x: 40, y: 4, w: 920, h: 80 }));
  const photo = put(2, { content: image("photo"), geo: { x: 60, y: 170, ...fit("photo", 420) } });
  const caption = put(2, text({ text: "GROUPED", font: "russo", size: 70, color: "#ffffff", outline: { color: "#000000", width: 4 } }, { x: 80, y: 340, w: 380, h: 84 }));
  groupNodes(doc, 2, [photo, caption]);
  put(2, text({ text: "BEBAS NEUE", font: "bebas", size: 130, color: "#ffffff", outline: { color: "#ff7a18", width: 3 }, align: "left" }, { x: 40, y: 520, w: 900, h: 140 }));
  put(2, text({ text: "RUSSO ONE", font: "russo", size: 72, gradient: { a: "#ff7a18", b: "#ffe066", angle: 90 }, shadow: { color: "#000000", x: 6, y: 8, blur: 4 }, align: "left" }, { x: 40, y: 690, w: 520, h: 90 }));
  put(2, text({ text: "CHAKRA PETCH", font: "chakra", size: 62, color: "#ffffff", shadow: { color: "#ff4fd8", x: 8, y: 8, blur: 0 }, align: "left" }, { x: 40, y: 800, w: 520, h: 80 }));
  put(2, text({ text: "RAJDHANI GLOW", font: "rajdhani", size: 100, color: "#ffffff", glow: { color: "#38e3ff", radius: 30 }, align: "left" }, { x: 40, y: 940, w: 900, h: 110 }));
  put(2, { content: image("frame"), geo: { x: 575, y: 640, ...fit("frame", 425) } });   // decorative plate BEHIND the tile (allowed)
  put(2, embed(SAMPLE_MEDIA.youtube, 640, 690, 350));                     // small YouTube TILE: above the 120x70 tile minimum on the narrowest column (346+ units), below the 200x200 inline minimum
  // the character sits BEHIND the Spotify tile (allowed: elements may be behind an embed, never in front of it)
  put(2, { content: image("character"), geo: { x: 620, y: 1190, ...fit("character", 340) } });
  put(2, embed(SAMPLE_MEDIA.spotifyTrack, 40, 1110, 640, { variant: "compact" }));
  put(2, text({ text: "OVERLAP ME", font: "orbitron", size: 84, gradient: { a: "#ffe066", b: "#ff4fd8", angle: 90 }, glow: { color: "#ff4fd8", radius: 24 } }, { x: 200, y: 1500, w: 760, h: 110 }));
  put(2, text({ text: "BOTTOM EDGE - SHADOW", font: "orbitron", size: 52, color: "#ffffff", shadow: { color: "#000000", x: 0, y: 10, blur: 26 } }, { x: 40, y: STAGE_H - 96, w: 920, h: 80 }));

  // stage 3 uses the per-stage OVERRIDE background (amber hex art); stages 1-2 inherit the continuous Wall background
  doc.stages[2].background = { mode: "own", kind: "art", asset: "stageAlt" };
  return doc;
}
