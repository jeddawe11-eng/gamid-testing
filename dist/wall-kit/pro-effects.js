// Pro Effects (Mazen's task "GamID Pro Effects Integration", 2026-10-25): the dedicated category of advanced visual text effects in the Wall editor, separate from
// fonts and typography. This registry is the ONE place that names them; the editor's cards and Properties sections, and any later entitlement, read it.
//
//   Neon              payload.glow        the existing glow (the Gaming Title neon)
//   Living Fire       payload.fire        living-fire.js (V3, accepted)
//   Living Ice        payload.ice         living-ice.js (V5 materials)
//   Living Radiation  payload.radiation   living-radiation.js (V1 waveform refinement)
//
// Every effect is FREE and fully usable: `tier` only identifies each effect for a future subscription entitlement - nothing reads it to restrict, prompt, save or
// publish today. A text shows ONE Pro Effect at a time: choosing an animated effect removes the other animated ones (a text's earlier glow is kept, as Living Fire
// always allowed: it is hidden while the animated effect draws and shows in its static fallback). Choosing an effect a text already has keeps its settings.
import { createFire } from "./living-fire.js";
import { createIce } from "./living-ice.js";
import { createRadiation } from "./living-radiation.js";

export const NEON_GLOW = Object.freeze({ color: "#62e7ff", blur: 22 });
export const PRO_EFFECT_PLACEHOLDER = "Write something about yourself here";
export const PRO_EFFECTS = Object.freeze([
  Object.freeze({ key: "neon", label: "Neon", title: "NEON EFFECTS", field: "glow", tier: "free", animated: false, note: "A glowing neon light around the letters", create: () => ({ ...NEON_GLOW }) }),
  Object.freeze({ key: "living-fire", label: "Living Fire", title: "LIVING FIRE EFFECTS", field: "fire", tier: "free", animated: true, note: "Living flames in your own letters: Organic, Cinematic or Mythic", create: () => createFire("organic") }),
  Object.freeze({ key: "living-ice", label: "Living Ice", title: "LIVING ICE EFFECTS", field: "ice", tier: "free", animated: true, note: "Your letters freeze into living ice crystals: Glacier, Arctic or Deep", create: () => createIce("glacier") }),
  Object.freeze({ key: "living-radiation", label: "Living Radiation", title: "LIVING RADIATION EFFECTS", field: "radiation", tier: "free", animated: true, note: "A radiation wave runs through your letters: Reactor, Meltdown or Phantom", create: () => createRadiation("reactor") }),
]);
export const proEffect = key => PRO_EFFECTS.find(effect => effect.key === key) ?? null;
const ANIMATED = PRO_EFFECTS.filter(effect => effect.animated);
const isSet = value => value !== undefined && value !== null;

// The Pro Effect a text shows: its animated effect if it has one (a saved text has at most one; an older one with several shows the first, Fire first), else Neon
// when it glows, else none.
export function proEffectOf(payload) {
  if (!payload) return null;
  return ANIMATED.find(effect => isSet(payload[effect.field])) ?? (isSet(payload.glow) ? proEffect("neon") : null);
}

// What choosing `key` writes to a text payload: the effect (kept when the text already has it), the other animated effects removed, and the placeholder when the text
// is empty, so an effect is never applied to nothing. Returns {} when nothing changes (choosing it again).
export function proEffectPatch(payload, key) {
  const effect = proEffect(key);
  if (!effect || !payload) return {};
  const patch = {};
  if (!isSet(payload[effect.field])) patch[effect.field] = effect.create();
  for (const other of ANIMATED) if (other !== effect && isSet(payload[other.field])) patch[other.field] = undefined;
  if (!String(payload.text ?? "").trim()) patch.text = PRO_EFFECT_PLACEHOLDER;
  return patch;
}

// Remove effect: only the effect the text shows goes (its glow too when that is Neon).
export function removeProEffectPatch(payload) {
  const effect = proEffectOf(payload);
  return effect ? { [effect.field]: undefined } : {};
}
