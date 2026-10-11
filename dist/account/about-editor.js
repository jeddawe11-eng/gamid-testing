// About Me (Profile Editor; DEC-0005, consolidated update 2026-10-11): Location (a catalog country, then a city of THAT country - searchable in English or
// Arabic; never GPS), Languages (max 5) and Favorite Genres (any number of catalog genres, all shown on the public profile), each with its own explicit
// "Show on my GamID" switch - OFF by default, unavailable while the value is empty, and switched OFF again when the value is cleared. Every public genre is shown. An older free-text Location
// is kept as it is until the owner chooses a country (a suggestion is offered only when the text matches exactly one place; using it is the owner's choice).
// Member Since (the date the GamID was created) is read-only and always shown on the public profile. Draft-only: nothing is sent until the section's Save
// Changes. The server (set_my_about) validates everything again. Built with createElement / textContent only.
import { filterCountries, arabicCountryName, locationSearchKey } from "./location.js";

export const ABOUT_LIMITS = Object.freeze({ languages: 5 });
export const ABOUT_MESSAGES = Object.freeze({
  INVALID_COUNTRY: "Choose a country from the list.",
  INVALID_CITY: "Choose a city of the selected country from the list.",
  TOO_MANY_LANGUAGES: "Choose up to 5 languages.",
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
export function validateAbout(draft, catalogs) {
  const langs = [...new Set(draft.languages || [])], genres = [...new Set(draft.genres || [])];
  if (langs.length > ABOUT_LIMITS.languages) return { ok: false, code: "TOO_MANY_LANGUAGES" };
  const known = (list, key) => new Set((list || []).map(x => x[key]));
  if (catalogs && langs.some(x => !known(catalogs.languages, "code").has(x))) return { ok: false, code: "INVALID_LANGUAGE" };
  if (catalogs && genres.some(x => !known(catalogs.genres, "key").has(x))) return { ok: false, code: "INVALID_GENRE" };
  const countryCode = draft.countryCode || null, cityId = countryCode && Number.isSafeInteger(draft.cityId) ? draft.cityId : null;
  if (countryCode && catalogs && !known(catalogs.countries, "code").has(countryCode)) return { ok: false, code: "INVALID_COUNTRY" };
  if (draft.cityId && !countryCode) return { ok: false, code: "INVALID_CITY" };
  const keepLegacy = !countryCode && Boolean(draft.legacy) && draft.keepLegacy !== false;
  const hasLocation = Boolean(countryCode) || keepLegacy;
  return { ok: true, value: { countryCode, cityId, keepLegacy, languages: langs, genres, showLocation: Boolean(draft.showLocation && hasLocation), showLanguages: Boolean(draft.showLanguages && langs.length), showGenres: Boolean(draft.showGenres && genres.length) } };
}

// An accessible combobox (input + listbox, ARIA 1.2 pattern): typing filters, Arrow keys move, Enter picks, Escape closes; mouse and touch pick by press.
// search(query) -> Promise<[{ value, label, hint? }]>; onPick(option)
function combobox(doc, h, { id, label, placeholder, search, onPick, delay = 0 }) {
  const wrap = h("div", "about-combo");
  const input = h("input", "about-combo-input"); input.id = id; input.type = "text"; input.autocomplete = "off"; input.spellcheck = false; input.placeholder = placeholder;
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-label", label);
  const list = h("ul", "about-combo-list"); list.id = `${id}List`; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", label); list.hidden = true;
  input.setAttribute("aria-controls", list.id);
  const status = h("span", "about-sr"); status.setAttribute("role", "status");
  wrap.append(input, list, status);
  let options = [], active = -1, timer = null, token = 0;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const paint = () => {
    list.replaceChildren(...options.map((opt, i) => {
      const li = h("li", `about-combo-option${i === active ? " is-active" : ""}`); li.id = `${id}Opt${i}`; li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === active));
      li.append(h("span", "", opt.label)); if (opt.hint) li.append(h("span", "about-combo-hint", opt.hint));
      li.addEventListener("mousedown", event => { event.preventDefault(); pick(i); });
      return li;
    }));
    const open = options.length > 0 && doc.activeElement === input;
    list.hidden = !open; input.setAttribute("aria-expanded", String(open));
    if (active >= 0) input.setAttribute("aria-activedescendant", `${id}Opt${active}`); else input.removeAttribute("aria-activedescendant");
    status.textContent = doc.activeElement === input ? (options.length ? `${options.length} suggestions` : input.value.trim() ? "No matches" : "") : "";
  };
  const pick = i => { const opt = options[i]; if (!opt) return; close(); onPick(opt); };
  const refresh = () => {
    clearTimeout(timer);
    const mine = ++token;
    timer = setTimeout(async () => {
      let found = [];
      try { found = await search(input.value); } catch { found = []; }
      if (mine !== token) return;
      options = found.slice(0, 12); active = options.length ? 0 : -1; paint();
    }, delay);
  };
  input.addEventListener("input", refresh);
  input.addEventListener("focus", refresh);
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) { refresh(); return; }
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = options.length ? (active + step + options.length) % options.length : -1; paint();
    } else if (event.key === "Enter") { if (!list.hidden && active >= 0) { event.preventDefault(); pick(active); } }
    else if (event.key === "Escape") { if (!list.hidden) { event.preventDefault(); close(); } }
  });
  return { wrap, input, close, set disabled(value) { input.disabled = value; if (value) close(); } };
}

export function createAboutEditor(doc, { onChange = () => {}, searchCities = async () => [] } = {}) {
  const h = (tag, className, text) => { const n = doc.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const element = h("div", "about-editor");
  element.append(h("p", "connections-lede", "Optional details for your public GamID on large screens. Each one stays private until you switch it on."));
  let catalogs = { languages: [], genres: [], countries: [] };
  const empty = () => ({ countryCode: null, countryName: null, cityId: null, cityName: null, legacy: null, keepLegacy: true, suggestion: null, languages: [], genres: [], showLocation: false, showLanguages: false, showGenres: false, memberSince: null });
  let saved = empty();
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

  // Location: country, then city (of that country); an older typed Location stays until replaced
  const countryLabel = c => { const ar = arabicCountryName(c.code); return ar ? `${c.name} · ${ar}` : c.name; };
  const country = combobox(doc, h, {
    id: "aboutCountry", label: "Country", placeholder: "Search a country (English or العربية)",
    search: async q => filterCountries(catalogs.countries, q).map(c => ({ value: c.code, label: c.name, hint: c.nameAr || "" })),
    onPick: opt => { draft.countryCode = opt.value; draft.countryName = opt.label; draft.cityId = null; draft.cityName = null; country.input.value = opt.label; city.input.value = ""; render(); onChange(); city.input.focus(); },
  });
  const city = combobox(doc, h, {
    id: "aboutCity", label: "City", placeholder: "Search a city in this country", delay: 200,
    search: async q => (draft.countryCode ? (await searchCities(draft.countryCode, locationSearchKey(q))) : []).map(c => ({ value: c.city_id, label: c.name, hint: c.name_ar || "" })),
    onPick: opt => { draft.cityId = Number(opt.value); draft.cityName = opt.label; city.input.value = opt.label; render(); onChange(); },
  });
  const clearLocation = h("button", "text-button about-location-clear", "Clear location"); clearLocation.type = "button";
  clearLocation.addEventListener("click", () => { draft.countryCode = null; draft.countryName = null; draft.cityId = null; draft.cityName = null; draft.keepLegacy = false; render(); onChange(); });
  const legacyNote = h("p", "about-legacy"); legacyNote.id = "aboutLegacyLocation";
  const useSuggestion = h("button", "secondary about-use-suggestion"); useSuggestion.type = "button";
  useSuggestion.addEventListener("click", () => {
    const s = draft.suggestion; if (!s) return;
    draft.countryCode = s.country_code; draft.countryName = s.country_name; draft.cityId = s.city_id ?? null; draft.cityName = s.city_name ?? null; render(); onChange();
  });
  const locationGrid = h("div", "about-location");
  const field = (text, control) => { const l = h("div", "about-location-field"); l.append(h("span", "about-location-label", text), control); return l; };
  locationGrid.append(field("Country", country.wrap), field("City", city.wrap));
  const locationWrap = h("div");
  locationWrap.append(locationGrid, legacyNote, useSuggestion, clearLocation, h("small", "about-attribution", "Places: GeoNames (CC BY 4.0)."));
  const locationSwitch = switchButton("Location", "showLocation"), locationHint = h("small", "about-hint");

  // Languages / Genres: checkbox chips (languages at most 5; genres: any)
  const chipGroup = name => { const group = h("div", "about-chips"); group.setAttribute("role", "group"); group.setAttribute("aria-label", name); group.dataset.aboutGroup = name; return group; };
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

  function renderChips(group, list, key, field, max) {
    const chosen = new Set(draft[field]);
    // the chips are rebuilt on every change: a keyboard user keeps focus on the same chip (it would otherwise fall back to the page)
    const active = doc.activeElement;
    const focused = active && group.contains(active) ? active.value : null;
    group.replaceChildren(...list.map(item => {
      const label = h("label", "about-chip");
      const box = h("input"); box.type = "checkbox"; box.value = item[key]; box.checked = chosen.has(item[key]);
      box.disabled = max !== null && !box.checked && chosen.size >= max;
      box.addEventListener("change", () => {
        const next = new Set(draft[field]);
        if (box.checked && (max === null || next.size < max)) next.add(item[key]); else next.delete(item[key]);
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
  const hint = (on, available, emptyText) => !available ? emptyText : on ? "Shown on your public GamID (large screens)." : "Private - not shown on your public GamID.";
  function render() {
    const keepsLegacy = !draft.countryCode && Boolean(draft.legacy) && draft.keepLegacy !== false;
    const hasLoc = Boolean(draft.countryCode) || keepsLegacy, hasLang = draft.languages.length > 0, hasGenre = draft.genres.length > 0;
    const countryName = draft.countryCode ? (catalogs.countries.find(c => c.code === draft.countryCode)?.name || draft.countryName || draft.countryCode) : "";
    if (doc.activeElement !== country.input) country.input.value = countryName;
    if (doc.activeElement !== city.input) city.input.value = draft.cityName || "";
    city.disabled = !draft.countryCode;
    legacyNote.textContent = keepsLegacy ? `Current location (typed earlier): ${draft.legacy}. Choose a country and city to replace it, or clear it.` : "";
    legacyNote.hidden = !keepsLegacy;
    const s = keepsLegacy ? draft.suggestion : null;
    useSuggestion.hidden = !s;
    useSuggestion.textContent = s ? `Use ${s.city_name ? `${s.city_name}, ` : ""}${s.country_name}` : "";
    clearLocation.hidden = !hasLoc;
    setSwitch(locationSwitch, draft.showLocation, hasLoc); setSwitch(languagesSwitch, draft.showLanguages, hasLang); setSwitch(genresSwitch, draft.showGenres, hasGenre);
    locationHint.textContent = hint(draft.showLocation, hasLoc, "Choose a country first (a city is optional).");
    languagesHint.textContent = `${draft.languages.length}/${ABOUT_LIMITS.languages} · ${hint(draft.showLanguages, hasLang, "Choose at least one language first.")}`;
    genresHint.textContent = `${draft.genres.length} selected · ${hint(draft.showGenres, hasGenre, "Choose at least one genre first.")}`;
    renderChips(languagesGroup, catalogs.languages, "code", "languages", ABOUT_LIMITS.languages);
    renderChips(genresGroup, catalogs.genres, "key", "genres", null);
    memberSince.textContent = saved.memberSince ? `Member since ${saved.memberSince} - always shown on your public GamID (the date your GamID was created).` : "";
  }
  const snapshot = d => { const v = validateAbout(d, null); return JSON.stringify(v.ok ? v.value : d); };
  render();
  return {
    element,
    setSaved(row) {
      if (row?.catalogs) catalogs = { languages: row.catalogs.languages || [], genres: row.catalogs.genres || [], countries: row.catalogs.countries || [] };
      saved = {
        countryCode: row?.about_country_code ?? null, countryName: null, cityId: row?.about_city_id ?? null, cityName: row?.about_city_name ?? null,
        legacy: row?.legacy_location ?? null, keepLegacy: true, suggestion: row?.location_suggestion ?? null,
        languages: row?.about_languages || [], genres: row?.about_genres || [], showLocation: Boolean(row?.show_location), showLanguages: Boolean(row?.show_languages), showGenres: Boolean(row?.show_genres),
        memberSince: formatMemberSince(row?.member_since_date) || row?.member_since_year || null,
      };
      draft = { ...saved, languages: [...saved.languages], genres: [...saved.genres] };
      render();
    },
    // -> the validated payload for setMyAbout; throws when the browser check refuses it
    payload() {
      const check = validateAbout(draft, catalogs);
      if (!check.ok) { if (check.code === "INVALID_COUNTRY") country.input.focus(); if (check.code === "INVALID_CITY") city.input.focus(); throw Object.assign(new Error(ABOUT_MESSAGES[check.code]), { code: check.code, aboutValidation: true }); }
      return check.value;
    },
    showServerError() {},
    isDirty: () => snapshot(draft) !== snapshot(saved),
    status: () => { const hasLoc = saved.countryCode || saved.legacy; const parts = [hasLoc && saved.showLocation ? "Location" : null, saved.showLanguages ? "Languages" : null, saved.showGenres ? "Genres" : null].filter(Boolean); return parts.length ? `Public: ${parts.join(", ")}` : "Private by default"; },
    reset() { saved = empty(); draft = { ...saved, languages: [], genres: [] }; render(); },
  };
}
