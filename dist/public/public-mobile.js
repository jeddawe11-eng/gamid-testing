// Mobile Public Visitor V2 (below 1280px, no published Wall): the page draws the same Classic Profile components as the desktop (public-desktop.js hero and
// About Me, Favorite Games, the sections panel, Connected Games, My Games) in one mobile-first column (public.css, html.is-public-mobile). This module holds
// only the mobile-specific pieces: the stats row (real public counts) and the adaptive My Socials sizing. createElement / textContent only.

// My Socials icon sizing by count: few accounts get large, balanced icons; more accounts get gradually smaller ones that wrap. `per` is the number of icons a
// row aims for, `max` the largest size (px) and `cap` a second row width that also bounds the size: from six accounts it is five, so on a narrow phone a larger
// count can never get bigger icons than five in a row would. The CSS fits them to the card width (container query units), never below the 44px touch target.
const SOCIAL_SIZING = [
  null,
  { per: 1, max: 80 }, { per: 2, max: 76 }, { per: 3, max: 72 }, { per: 4, max: 66 }, { per: 5, max: 60 },
  { per: 3, max: 58 }, { per: 4, max: 56 }, { per: 4, max: 54 }, { per: 5, max: 52 }, { per: 5, max: 50 }, { per: 6, max: 48 }, { per: 6, max: 48 },
];
export function socialSizing(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return null;
  const sizing = SOCIAL_SIZING[Math.min(n, SOCIAL_SIZING.length - 1)];
  return { ...sizing, cap: n <= 5 ? sizing.per : 5 };
}
export function adaptSocials(container) {
  if (!container) return null;
  const count = container.querySelectorAll(".public-social").length;
  const sizing = socialSizing(count);
  container.dataset.count = String(count);
  if (sizing) { container.style.setProperty("--social-per", String(sizing.per)); container.style.setProperty("--social-cap", String(sizing.cap)); container.style.setProperty("--social-max", `${sizing.max}px`); }
  return sizing;
}

const reduceMotion = () => typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
// scroll a section into view and give it focus (keyboard users land on it), smooth unless the visitor prefers reduced motion
export function revealSection(target) {
  if (!target || target.hidden) return false;
  target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  return true;
}

// The hero's stats row (mobile only, .mob-only): only counts the visitor can already see on this page - the public My Games count (when My Games is public),
// the Crews the public crews section lists, and the Duo. Each opens what it counts. -> element, or null when there is nothing to count.
export function mobileStats({ doc = globalThis.document, gamesCount = 0, crewsCount = 0, hasDuo = false, onGames = null, onCrews = null, onDuo = null } = {}) {
  const items = [];
  const make = (value, singular, plural, label, onActivate, popup = false) => {
    const button = doc.createElement("button");
    button.type = "button"; button.className = "mob-stat";
    const word = value === 1 ? singular : plural;
    button.setAttribute("aria-label", `${value} ${word.toLowerCase()} - ${label}`);
    if (popup) button.setAttribute("aria-haspopup", "dialog");
    const v = doc.createElement("span"); v.className = "mob-stat-value"; v.textContent = String(value);
    const l = doc.createElement("span"); l.className = "mob-stat-label"; l.textContent = word;
    button.append(v, l);
    button.addEventListener("click", () => onActivate?.(button));
    items.push(button);
  };
  if (gamesCount > 0 && typeof onGames === "function") make(gamesCount, "Game", "Games", "go to My Games", onGames);
  if (crewsCount > 0 && typeof onCrews === "function") make(crewsCount, "Crew", "Crews", "open My Crews", onCrews, true);
  if (hasDuo && typeof onDuo === "function") make(1, "Duo", "Duo", "go to My Duo", onDuo);
  if (!items.length) return null;
  const row = doc.createElement("div");
  row.className = "mob-stats mob-only";
  row.dataset.count = String(items.length);
  row.append(...items);
  return row;
}
