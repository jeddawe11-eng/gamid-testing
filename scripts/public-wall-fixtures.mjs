// Synthetic published Walls for the Mobile Public Wall Visitor V2 browser review (scripts/public-wall-mobile-browser.mjs). Built with the editor's own ops and
// payload creators and checked with validateDocument, so every fixture is a document the real editor could have published. No real account or media is used.
import "../dist/wall-kit/register.js";
import * as ops from "../dist/wall-kit/ops.js";
import { createDocument } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { createTextPayload } from "../dist/wall-kit/text.js";
import { createImagePayload } from "../dist/wall-kit/image.js";
import { createIconsPayload } from "../dist/wall-kit/icons.js";
import { createImageBackground, createVideoBackground } from "../dist/wall-kit/background.js";
import { createGamidPayload, GAMID_BLOCK_INFO } from "../dist/wall-kit/gamid.js";
import { createFire } from "../dist/wall-kit/living-fire.js";

export const OWNER = "00000000-0000-4000-8000-0000000000a1";
const uuid = n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
export const ASSETS = {
  wallBg: { asset_id: uuid(1), mime_type: "image/jpeg" },
  photo: { asset_id: uuid(2), mime_type: "image/jpeg" },
  gif: { asset_id: uuid(3), mime_type: "image/gif" },
  clip: { asset_id: uuid(4), mime_type: "video/mp4" },
  stageVideo: { asset_id: uuid(5), mime_type: "video/mp4" },
  lateBg: { asset_id: uuid(6), mime_type: "image/jpeg" },
};
for (const [key, asset] of Object.entries(ASSETS)) Object.assign(asset, { key, storage_path: `${OWNER}/${asset.asset_id}.${asset.mime_type.split("/")[1].replace("jpeg", "jpg")}` });
export const FONT_ID = "22222222-2222-4222-8222-000000000001";

function build(stageCount, steps) {
  let doc = createDocument({ stageCount });
  const api = {
    add(stage, spec) { const result = ops.addCustomElement(doc, doc.stages[stage].id, spec); if (!result.ok) throw new Error(`fixture add: ${JSON.stringify(result.error ?? result)}`); doc = result.doc; return result.ids[0]; },
    background(scope, bg) { const result = ops.setBackground(doc, scope === "wall" ? "wall" : doc.stages[scope].id, bg); if (!result.ok) throw new Error("fixture background"); doc = result.doc; },
  };
  steps(api);
  const check = validateDocument(doc);
  if (!check.valid) throw new Error(`fixture invalid: ${check.errors.join(", ")}`);
  return doc;
}
const text = (value, over = {}) => ({ ...createTextPayload(), text: value, ...over });
const label = (value, y) => ({ type: "text", payload: text(value, { fontSize: 80, color: "#ffffff", align: "center" }), width: 900, height: 140, x: 50, y });

// one stage: a title, a picture and a shape
export function oneStage() {
  return build(1, ({ add }) => {
    add(0, label("ONE STAGE WALL", 120));
    add(0, { type: "image", payload: createImagePayload(ASSETS.photo.asset_id), width: 800, height: 600, x: 100, y: 420 });
    add(0, { type: "rect", payload: { fill: "#8b5dff", radius: 1000 }, width: 300, height: 300, x: 350, y: 1200 });
  });
}

// three stages, every supported content type: a Whole-Wall picture background, a stage video background, a stage-3 picture background (read when its stage comes
// near), text with a custom font, glow and outline, Living Fire, a picture, a GIF, a video layer, shapes (library + freeform), an Icon Group, a YouTube player,
// a text link and GamID blocks - layered and overlapping
export function mixed() {
  return build(3, ({ add, background }) => {
    background("wall", createImageBackground(ASSETS.wallBg.asset_id));
    background(1, createVideoBackground(ASSETS.stageVideo.asset_id));
    background(2, createImageBackground(ASSETS.lateBg.asset_id, { fit: "contain" }));
    // stage 1
    add(0, { type: "text", payload: text("CUSTOM FONT TITLE", { fontSize: 110, fontRef: `font:${FONT_ID}`, color: "#ffd36b", align: "center", glow: { color: "#62e7ff", blur: 18 }, stroke: { color: "#000000", width: 3 } }), width: 940, height: 220, x: 30, y: 60 });
    add(0, { type: "image", payload: createImagePayload(ASSETS.photo.asset_id, { radius: 40 }), width: 700, height: 500, x: 150, y: 330 });
    add(0, { type: "rect", payload: { fill: "#ff4fd8", opacity: 0.6 }, width: 500, height: 200, x: 80, y: 760 });
    add(0, { type: "image", payload: createImagePayload(ASSETS.gif.asset_id), width: 300, height: 300, x: 620, y: 700 });
    add(0, { type: "text", payload: text("Living Fire", { fontSize: 110, color: "#ffffff", align: "center", fire: createFire() }), width: 900, height: 180, x: 50, y: 1080 });
    add(0, { type: "text", payload: text("Visit my site", { fontSize: 64, color: "#62e7ff", align: "center", underline: true, link: { url: "https://example.com/gamid" } }), width: 700, height: 110, x: 150, y: 1300 });
    add(0, { type: "icons", payload: createIconsPayload([{ providerKey: "twitch", kind: "channel", id: "fixturegamer" }, { url: "https://example.com/" }]), width: 600, height: 200, x: 200, y: 1480 });
    // stage 2: shapes over a video background, a video layer and a YouTube player
    add(1, label("STAGE TWO", 60));
    add(1, { type: "rect", payload: { fill: "#62e7ff", shape: "triangle" }, width: 300, height: 260, x: 80, y: 260 });
    add(1, { type: "rect", payload: { fill: "#ffd36b", shape: "custom", path: { closed: true, points: [{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.7 }] } }, width: 300, height: 300, x: 600, y: 240 });
    add(1, { type: "image", payload: createImagePayload(ASSETS.clip.asset_id, { media: "video" }), width: 800, height: 450, x: 100, y: 620 });
    add(1, { type: "embed", payload: { providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" } }, width: 800, height: 450, x: 100, y: 1160 });
    // stage 3: GamID blocks over a contained picture background
    add(2, label("STAGE THREE", 60));
    add(2, { type: "gamid", payload: createGamidPayload("profile"), ...GAMID_BLOCK_INFO.profile.size, x: 100, y: 300 });
    add(2, { type: "gamid", payload: createGamidPayload("roles"), ...GAMID_BLOCK_INFO.roles.size, x: 100, y: 900 });
    add(2, { type: "embed", payload: { providerKey: "twitch", data: { kind: "channel", id: "fixturegamer", presentation: "card" } }, width: 800, height: 220, x: 100, y: 1450 });
  });
}

// a long Wall: eight stages, alternating colour and gradient backgrounds, a numbered title on each
export function long() {
  return build(8, ({ add, background }) => {
    background("wall", { kind: "gradient", from: "#1a1040", to: "#062a33", angle: 180 });
    for (let i = 0; i < 8; i++) {
      if (i % 2) background(i, { kind: "color", color: ["#2a0f3d", "#0f2a3d", "#3d2a0f", "#0f3d1e"][i % 4] });
      add(i, label(`STAGE ${i + 1} OF 8`, 120));
      add(i, { type: "rect", payload: { fill: "#8b5dff", radius: 48 }, width: 700, height: 400, x: 150, y: 600 + (i % 3) * 200 });
      add(i, label(`bottom of ${i + 1}`, 1600));
    }
  });
}

// a published Wall with one empty stage
export function empty() { return build(1, () => {}); }

export const SCENARIOS = { one: oneStage, mixed, long, empty };
export const assetsFor = doc => { const used = ops.assetsInUse(doc); return Object.values(ASSETS).filter(asset => used.has(asset.asset_id)).map(({ asset_id, storage_path, mime_type }) => ({ asset_id, storage_path, mime_type })); };
