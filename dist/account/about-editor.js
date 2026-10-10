// About Me (Profile Editor; DEC-0005): Location (manual city / country, max 60), Languages (max 5) and Favorite Genres (max 5), each with its own explicit
// "Show on my GamID" switch - OFF by default, unavailable while the value is empty, and switched OFF again when the value is cleared. Member Since (the date
// the GamID was created) is read-only and always shown on the public profile. Draft-only: nothing is sent until the section's Save Changes. The server
// (set_my_about) validates everything again. Built with createElement / textContent only.
export const ABOUT_LIMITS = Object.freeze({ location: 60, languages: 5, genres: 5 });
export const ABOUT_MESSAGES = Object.freeze({
  INVALID_ABOUT_LOCATION: "Use a city or country only - up to 60 characters, without links or special symbols.",
  TOO_MANY_LANGUAGES: "Choose up to 5 languages.",
  TOO_MANY_GENRES: "Choose up to 5 genres.",
  DUPLICATE_LANGUAGE: "Each language can be chosen once.",
  DUPLICATE_GENRE: "Each genre can be chosen once.",
  INVALID_LANGUAGE: "Choose languages from the list.",
  INVALID_GENRE: "Choose genres from the list.",
});
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// The registration date the server sends as a plain calendar date (UTC, 'YYYY-MM-DD') -> "10 October 2026". No Date object and no time zone are involved, so every
// visitor sees the same day. -> "" when it is not a valid date.
export function formatMemberSince(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return "";
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return "";
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
// the same rules the server applies -> { ok: true, value } | { ok: false, code }
export function normalizeLocation(text) {
  const raw = String(text ?? "");
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: true, value: null };
  // eslint-disable-next-line no-control-regex
  if (value.length > ABOUT_LIMITS.location || /[\u0000-\u001f\u007f]/.test(raw) || /(:\/\/|www\.|[<>{}[\]\\`])/i.test(value)) return { ok: false, code: "INVALID_ABOUT_LOCATION" };
  return { ok: true, value };
}
export function validateAbout(draft, catalogs) {
  const location = normalizeLocation(draft.location);
  if (!location.ok) return location;
  const langs = [...new Set(draft.languages || [])], genres = [...new Set(draft.genres || [])];
  if (langs.length > ABOUT_LIMITS.languages) return { ok: false, code: "TOO_MANY_LANGUAGES" };
  if (genres.length > ABOUT_LIMITS.genres) return { ok: false, code: "TOO_MANY_GENRES" };
  const known = (list, key) => new Set((list || []).map(x => x[key]));
  if (catalogs && langs.some(x => !known(catalogs.languages, "code").has(x))) return { ok: false, code: "INVALID_LANGUAGE" };
  if (catalogs && genres.some(x => !known(catalogs.genres, "key").has(x))) return { ok: false, code: "INVALID_GENRE" };
  return { ok: true, value: { location: location.value, languages: langs, genres, showLocation: Boolean(draft.showLocation && location.value), showLanguages: Boolean(draft.showLanguages && langs.length), showGenres: Boolean(draft.showGenres && genres.length) } };
}

export function createAboutEditor(doc, { onChange = () => {} } = {}) {
  const h = (tag, className, text) => { const n = doc.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const element = h("div", "about-editor");
  element.append(h("p", "connections-lede", "Optional details for your public GamID on large screens. Each one stays private until you switch it on."));
  let catalogs = { languages: [], genres: [] };
  let saved = { location: null, languages: [], genres: [], showLocation: false, showLanguages: false, showGenres: false, memberSince: null };
  let draft = { ...saved };

  const switchButton = (label, key) => {
    const button = h("button", "visibility-switch");
    button.type = "button"; button.setAttribute("role", "switch"); button.setAttribute("aria-label", `Show ${label} on my GamID`); button.dataset.aboutSwitch = key;
    button.append(h("span", "visibility-switch-knob"), h("span", "visibility-switch-text", "OFF"));
    button.addEventListener("click", () => { if (button.disabled) return; draft[key] = !draft[key]; render(); onChange(); });
    return button;
  };
  const row = (title, control, switchEl, hintEl) => {
    const block = h("section", "about-field");
    const head = h("div", "about-field-head");
    head.append(h("strong", "", title), h("span", "section-visibility-label", "Show on my GamID"), switchEl);
    block.append(head, control, hintEl);
    return block;
  };

  // Location
  const locationInput = h("input"); locationInput.id = "aboutLocation"; locationInput.maxLength = ABOUT_LIMITS.location; locationInput.autocomplete = "address-level2"; locationInput.placeholder = "City, Country";
  locationInput.setAttribute("aria-label", "Location (city or country)");
  const locationError = h("p", "social-error"); locationError.id = "aboutLocationError"; locationError.setAttribute("role", "alert"); locationError.hidden = true;
  const locationSwitch = switchButton("Location", "showLocation"), locationHint = h("small", "about-hint");
  const locationWrap = h("div"); locationWrap.append(locationInput, locationError);
  locationInput.addEventListener("input", () => { draft.location = locationInput.value; showFieldError(""); render(); onChange(); });

  // Languages / Genres: checkbox chips, at most 5 each
  const chipGroup = (name, max) => {
    const group = h("div", "about-chips"); group.setAttribute("role", "group"); group.setAttribute("aria-label", name); group.dataset.aboutGroup = name;
    return group;
  };
  const languagesGroup = chipGroup("Languages"), genresGroup = chipGroup("Favorite Genres");
  const languagesSwitch = switchButton("Languages", "showLanguages"), genresSwitch = switchButton("Favorite Genres", "showGenres");
  const languagesHint = h("small", "about-hint"), genresHint = h("small", "about-hint");
  const memberSince = h("p", "about-member-since");

  element.append(
    row("Location", locationWrap, locationSwitch, locationHint),
    row("Languages", languagesGroup, languagesSwitch, languagesHint),
    row("Favorite Genres", genresGroup, genresSwitch, genresHint),
    memberSince,
  );

  function showFieldError(text) { locationError.textContent = text || ""; locationError.hidden = !text; if (text) { locationInput.setAttribute("aria-invalid", "true"); locationInput.setAttribute("aria-describedby", locationError.id); } else { locationInput.removeAttribute("aria-invalid"); locationInput.removeAttribute("aria-describedby"); } }
  function renderChips(group, list, key, field, max) {
    const chosen = new Set(draft[field]);
    // the chips are rebuilt on every change: a keyboard user keeps focus on the same chip (it would otherwise fall back to the page)
    const active = doc.activeElement;
    const focused = active && group.contains(active) ? active.value : null;
    group.replaceChildren(...list.map(item => {
      const label = h("label", "about-chip");
      const box = h("input"); box.type = "checkbox"; box.value = item[key]; box.checked = chosen.has(item[key]);
      box.disabled = !box.checked && chosen.size >= max;
      box.addEventListener("change", () => {
        const next = new Set(draft[field]);
        if (box.checked && next.size < max) next.add(item[key]); else next.delete(item[key]);
        draft[field] = [...next];
        render(); onChange();
      });
      label.classList.toggle("is-on", box.checked);
      label.append(box, h("span", "", item.label));
      return label;
    }));
    if (focused !== null) [...group.querySelectorAll("input")].find(box => box.value === focused)?.focus();
  }
  function setSwitch(button, on, available) {
    button.disabled = !available;
    button.setAttribute("aria-checked", String(on && available));
    button.classList.toggle("is-on", on && available);
    button.querySelector(".visibility-switch-text").textContent = on && available ? "ON" : "OFF";
  }
  const hint = (on, available, empty) => !available ? empty : on ? "Shown on your public GamID (large screens)." : "Private - not shown on your public GamID.";
  function render() {
    const loc = normalizeLocation(draft.location);
    const hasLoc = loc.ok && Boolean(loc.value), hasLang = draft.languages.length > 0, hasGenre = draft.genres.length > 0;
    if (locationInput.value !== (draft.location ?? "")) locationInput.value = draft.location ?? "";
    setSwitch(locationSwitch, draft.showLocation, hasLoc); setSwitch(languagesSwitch, draft.showLanguages, hasLang); setSwitch(genresSwitch, draft.showGenres, hasGenre);
    locationHint.textContent = hint(draft.showLocation, hasLoc, "Add a city or country first.");
    languagesHint.textContent = `${draft.languages.length}/${ABOUT_LIMITS.languages} · ${hint(draft.showLanguages, hasLang, "Choose at least one language first.")}`;
    genresHint.textContent = `${draft.genres.length}/${ABOUT_LIMITS.genres} · ${hint(draft.showGenres, hasGenre, "Choose at least one genre first.")}`;
    renderChips(languagesGroup, catalogs.languages, "code", "languages", ABOUT_LIMITS.languages);
    renderChips(genresGroup, catalogs.genres, "key", "genres", ABOUT_LIMITS.genres);
    memberSince.textContent = saved.memberSince ? `Member since ${saved.memberSince} - always shown on your public GamID (the date your GamID was created).` : "";
  }
  const snapshot = d => { const v = validateAbout(d, null); return JSON.stringify(v.ok ? v.value : d); };
  render();
  return {
    element,
    setSaved(row) {
      if (row?.catalogs) catalogs = { languages: row.catalogs.languages || [], genres: row.catalogs.genres || [] };
      saved = { location: row?.about_location ?? null, languages: row?.about_languages || [], genres: row?.about_genres || [], showLocation: Boolean(row?.show_location), showLanguages: Boolean(row?.show_languages), showGenres: Boolean(row?.show_genres), memberSince: formatMemberSince(row?.member_since_date) || row?.member_since_year || null };
      draft = { ...saved, languages: [...saved.languages], genres: [...saved.genres] };
      showFieldError(""); render();
    },
    // -> the validated payload for setMyAbout; throws (with the field marked) when the browser check refuses it
    payload() {
      const check = validateAbout(draft, catalogs);
      if (!check.ok) { if (check.code === "INVALID_ABOUT_LOCATION") { showFieldError(ABOUT_MESSAGES[check.code]); locationInput.focus(); } throw Object.assign(new Error(ABOUT_MESSAGES[check.code]), { code: check.code, aboutValidation: true }); }
      return check.value;
    },
    showServerError(code) { if (code === "INVALID_ABOUT_LOCATION") showFieldError(ABOUT_MESSAGES[code]); },
    isDirty: () => snapshot(draft) !== snapshot(saved),
    status: () => { const parts = [saved.location && saved.showLocation ? "Location" : null, saved.showLanguages ? "Languages" : null, saved.showGenres ? "Genres" : null].filter(Boolean); return parts.length ? `Public: ${parts.join(", ")}` : "Private by default"; },
    reset() { saved = { location: null, languages: [], genres: [], showLocation: false, showLanguages: false, showGenres: false, memberSince: null }; draft = { ...saved, languages: [], genres: [] }; showFieldError(""); render(); },
  };
}
