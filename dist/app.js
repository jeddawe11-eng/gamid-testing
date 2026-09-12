import { PRESETS, clampDuration, effectiveTransitionDuration, nextExperienceState, resolvePreset } from "./transition-engine.js";

const els = Object.fromEntries(["experience","profile","introLayer","mediaStage","introVideo","introImage","skipButton","panelSkipButton","replayButton","presetSelect","introDuration","transitionDuration","introOutput","transitionOutput","progressBar","mediaSelect","stateBadge"].map(id => [id, document.getElementById(id)]));
let state = "intro";
let introTimer;
let transitionTimer;
let animationFrame;
let runToken = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

for (const [value, preset] of Object.entries(PRESETS)) els.presetSelect.add(new Option(preset.label, value));

function setState(event) {
  state = nextExperienceState(state, event);
  els.experience.dataset.state = state;
  els.profile.setAttribute("aria-hidden", String(state === "intro"));
  els.stateBadge.textContent = state === "profile" ? "REVEALED" : state === "transitioning" ? "REVEALING" : "PLAYING";
}

function clearRun() {
  clearTimeout(introTimer); clearTimeout(transitionTimer); cancelAnimationFrame(animationFrame);
  runToken += 1;
}

function applyConfig() {
  const preset = resolvePreset(els.presetSelect.value);
  els.introLayer.className = `intro-layer ${preset.className}`;
  els.experience.dataset.preset = els.presetSelect.value;
  els.experience.style.setProperty("--transition-ms", `${clampDuration(els.transitionDuration.value)}ms`);
  els.experience.style.setProperty("--intro-ms", `${clampDuration(els.introDuration.value)}ms`);
  els.introOutput.value = `${(Number(els.introDuration.value) / 1000).toFixed(1)}s`;
  els.transitionOutput.value = `${(Number(els.transitionDuration.value) / 1000).toFixed(1)}s`;
}

function showSelectedMedia() {
  const videoMode = els.mediaSelect.value === "video";
  els.introVideo.hidden = !videoMode; els.introImage.hidden = videoMode;
  if (!videoMode) els.introVideo.pause();
}

function finishTransition(token) {
  if (token !== runToken) return;
  setState("TRANSITION_COMPLETE");
  els.introLayer.style.visibility = els.presetSelect.value === "shrink" ? "visible" : "hidden";
}

function beginTransition() {
  if (state !== "intro") return;
  const token = runToken;
  setState("INTRO_COMPLETE");
  const duration = effectiveTransitionDuration(els.transitionDuration.value, reduceMotion.matches);
  els.experience.style.setProperty("--transition-ms", `${duration}ms`);
  transitionTimer = setTimeout(() => finishTransition(token), duration + 60);
}

function replay() {
  clearRun();
  state = "profile"; setState("REPLAY");
  applyConfig(); showSelectedMedia();
  els.introLayer.style.visibility = "visible";
  els.progressBar.style.animation = "none";
  void els.introLayer.offsetWidth;
  els.progressBar.style.animation = `progress var(--intro-ms) linear forwards`;
  if (!els.introVideo.hidden) { els.introVideo.currentTime = 0; els.introVideo.play().catch(() => {}); }
  const token = runToken;
  introTimer = setTimeout(() => token === runToken && beginTransition(), clampDuration(els.introDuration.value));
}

function skip() {
  clearRun();
  els.introVideo.pause();
  state = "intro"; setState("SKIP");
  els.introLayer.style.visibility = "hidden";
}

els.replayButton.addEventListener("click", replay);
els.skipButton.addEventListener("click", skip);
els.panelSkipButton.addEventListener("click", skip);
els.presetSelect.addEventListener("change", replay);
els.mediaSelect.addEventListener("change", replay);
[els.introDuration, els.transitionDuration].forEach(input => input.addEventListener("input", applyConfig));
els.introDuration.addEventListener("change", replay);
reduceMotion.addEventListener?.("change", replay);
window.addEventListener("pagehide", clearRun, { once: true });
document.addEventListener("keydown", event => { if (event.key === "Escape") skip(); });

applyConfig();
requestAnimationFrame(replay);
