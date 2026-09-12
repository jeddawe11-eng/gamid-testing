export const PRESETS = Object.freeze({
  fade: { label: "Cross fade", className: "preset-fade" },
  blur: { label: "Blur fade", className: "preset-blur" },
  shrink: { label: "Shrink to center", className: "preset-shrink" },
  slide: { label: "Slide away", className: "preset-slide", direction: "left" },
  split: { label: "Split reveal", className: "preset-split" },
});

export const clampDuration = (value, fallback = 1600) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(10000, Math.max(300, parsed)) : fallback;
};

export function nextExperienceState(state, event) {
  if (event === "REPLAY") return "intro";
  if (event === "SKIP") return "profile";
  if (event === "INTRO_COMPLETE" && state === "intro") return "transitioning";
  if (event === "TRANSITION_COMPLETE" && state === "transitioning") return "profile";
  return state;
}

export function resolvePreset(name) {
  return PRESETS[name] || PRESETS.fade;
}

export const effectiveTransitionDuration = (duration, reducedMotion) => reducedMotion ? 180 : clampDuration(duration);

export const isImmersiveState = state => state === "intro" || state === "transitioning";
