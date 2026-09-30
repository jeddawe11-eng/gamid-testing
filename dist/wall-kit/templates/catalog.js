// Curated recipes contain canonical Wall data, never HTML or flattened artwork.
import { createDocument, createElement } from "../../wall/schema.js";
import { createTextPayload } from "../text.js";
import "../register.js";

const recipe = createDocument();
const stage = recipe.stages[0];
stage.background = { kind: "gradient", from: "#101c29", to: "#05080e", angle: 155 };
const add = (type, id, x, y, width, height, payload, rotation) => stage.elements.push(createElement({
  id, type, x, y, width, height, z: stage.elements.length, payload, rotation,
}));
const shape = (id, x, y, w, h, fill, extra = {}, rotation) => add("rect", id, x, y, w, h, { fill, ...extra }, rotation);
const text = (id, x, y, w, h, value, size, extra = {}) => add("text", id, x, y, w, h,
  createTextPayload({ text: value, fontFamily: "system-sans", fontSize: size, align: "left", ...extra }));

shape("rail", 52, 65, 5, 1625, "#80ffcf", { opacity: 0.35 });
shape("signal", 740, 265, 180, 180, "#163d3c", { stroke: "#80ffcf", strokeWidth: 2, opacity: 0.7 }, 45);
shape("signal-core", 792, 317, 76, 76, "#80ffcf", { opacity: 0.9 }, 45);
text("eyebrow", 90, 75, 700, 45, "GAMID  /  PLAYER DOSSIER", 25, { letterSpacing: 5, color: "#80ffcf" });
text("title", 85, 172, 650, 250, "NIGHT\nSIGNAL", 108, { fontWeight: 900, lineHeight: 0.95, letterSpacing: -4 });
text("subtitle", 90, 440, 800, 60, "YOUR IDENTITY. YOUR FREQUENCY.", 26, { color: "#a4b9c6", letterSpacing: 2 });
shape("divider", 90, 530, 820, 2, "#80ffcf", { opacity: 0.5 });
text("profile-label", 90, 570, 820, 42, "01 / CALLSIGN", 23, { color: "#80ffcf", letterSpacing: 3 });
add("gamid", "identity", 90, 640, 820, 260, { block: "profile", layout: "card", style: {
  bgMode: "none", border: false, primaryColor: "#ffffff", secondaryColor: "#a4b9c6", accentColor: "#80ffcf",
  headingColor: "#80ffcf", avatarShape: "rounded", nameSize: "l", padding: 25,
} });
shape("role-panel", 90, 950, 820, 290, "#12242e", { radius: 20, stroke: "#315453", strokeWidth: 2 });
add("gamid", "roles", 115, 980, 770, 225, { block: "roles", layout: "compact", style: {
  bgMode: "none", border: false, headingColor: "#80ffcf", primaryColor: "#ffffff", accentColor: "#80ffcf", chipStyle: "outline", padding: 20,
} });
text("manifesto-label", 90, 1310, 800, 42, "02 / PLAYER MINDSET", 23, { color: "#80ffcf", letterSpacing: 3 });
text("manifesto", 90, 1385, 810, 175, "PLAY WITH INTENT.\nLEAVE YOUR SIGNAL.", 49, { fontWeight: 800, lineHeight: 1.2 });
shape("footer-line", 90, 1630, 820, 2, "#315453");
text("footer", 90, 1665, 820, 40, "GAMID     /     BUILT TO BE YOURS", 20, { color: "#a4b9c6", letterSpacing: 3 });

function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const NIGHT_SIGNAL = freeze({
  templateSchemaVersion: 1,
  id: "gamid.official.night-signal", name: "Night Signal", version: "1.0.0",
  description: "A tactical player dossier with live GamID identity, mint signal geometry and an editable player statement.",
  category: "Gaming identity", tags: ["tactical", "neon", "identity"],
  preview: { kind: "recipe", stageId: "stage_1" },
  supportedScopes: ["wall", "stage"],
  recipe: { kind: "wall", document: recipe },
});
export const TEMPLATES = Object.freeze([NIGHT_SIGNAL]);
