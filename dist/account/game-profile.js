// Provider-neutral, optional, expandable Game Profile for a row in My Games.
//
// Five separate concepts stay separate here (see supabase/migrations/20260921200000_game_profiles.sql):
//   DISCOVERED GAME  (the row itself, with its own "Discovered via <provider>" provenance)  - never touched by this module
//   GAME IDENTITY    (identity_source / identity_ref)      what in-game identity the profile is about
//   STATS PROVIDER   (data_source / data_source_class)     where the numbers came from and how far that source is trusted
//   NORMALIZED PROFILE (fields: a bounded list of {key,label,value,kind})  the only thing this module renders - no game-specific code, no fixed field names
//   OWNERSHIP / TRUST (trust_status VERIFIED | CONNECTED | MANUAL)
// A discovered game NEVER becomes a Game Profile, and never becomes VERIFIED, by being discovered: a row only gets an expansion affordance when a real
// Game Profile record with at least one valid field is attached to its game key. Everything is rendered as text; nothing here makes a network request.

export const GAME_PROFILE_MAX_FIELDS = 12;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const FIELD_KINDS = new Set(["text", "number", "percent", "rank"]);
const GAME_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const TOKEN = /^[A-Z][A-Z0-9_]{1,39}$/;
const CLASSES = new Set(["OFFICIAL", "THIRD_PARTY", "UNOFFICIAL_TEMPORARY"]);
// playtime has its own owner switch ("Show playtime on my GamID"): it can never travel inside a Game Profile
const FORBIDDEN_KEY = /(playtime|hours|minutes_played|time_played)/;

// Readable names are DATA, supplied by whoever attaches a provider (see the optional `labels` argument); an unknown source is still shown, as its own token in
// plain words. This module names no provider, so adding one needs no change here.
export const DATA_SOURCE_LABELS = Object.freeze({});
export const DATA_SOURCE_CLASS_LABELS = Object.freeze({ OFFICIAL: "Official source", THIRD_PARTY: "Third-party source", UNOFFICIAL_TEMPORARY: "Temporary unofficial source" });
export const IDENTITY_SOURCE_LABELS = Object.freeze({ MANUAL_UID: "UID (entered manually)" });

const plainWords = token => String(token).toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

function normalizeField(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!FIELD_KEY.test(key) || FORBIDDEN_KEY.test(key)) return null;
  if (label.length < 1 || label.length > 40) return null;
  let value = raw.value;
  if (typeof value === "number") { if (!Number.isFinite(value)) return null; }
  else if (typeof value === "string") { value = value.trim(); if (value.length < 1 || value.length > 80) return null; }
  else return null;
  const kind = FIELD_KINDS.has(raw.kind) ? raw.kind : "text";
  return { key, label, value, kind };
}

// Malformed or missing data fails SAFE: it yields null, the row stays a normal compact row, nothing throws.
export function normalizeGameProfile(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (typeof raw.game_key !== "string" || !GAME_KEY.test(raw.game_key)) return null;
    if (!Array.isArray(raw.fields)) return null;
    const seen = new Set(), fields = [];
    for (const candidate of raw.fields.slice(0, GAME_PROFILE_MAX_FIELDS)) {
      const field = normalizeField(candidate);
      if (field && !seen.has(field.key)) { seen.add(field.key); fields.push(field); }
    }
    if (!fields.length) return null;   // nothing to show: no arrow
    const dataSource = typeof raw.data_source === "string" && TOKEN.test(raw.data_source) ? raw.data_source : null;
    if (!dataSource) return null;      // a profile must say where its numbers came from
    const dataSourceClass = CLASSES.has(raw.data_source_class) ? raw.data_source_class : "UNOFFICIAL_TEMPORARY";
    // Trust can only be LOWERED here, never raised: VERIFIED needs an official source plus a stated basis, CONNECTED needs a basis and a non-temporary source.
    // Anything else (including any unknown value) is MANUAL / UNVERIFIED.
    const basis = typeof raw.verification_basis === "string" && raw.verification_basis ? raw.verification_basis : null;
    let trust = "MANUAL";
    if (raw.trust_status === "VERIFIED" && basis && dataSourceClass === "OFFICIAL") trust = "VERIFIED";
    else if (raw.trust_status === "CONNECTED" && basis && dataSourceClass !== "UNOFFICIAL_TEMPORARY") trust = "CONNECTED";
    const fetched = raw.fetched_at ? new Date(raw.fetched_at) : null;
    return {
      gameKey: raw.game_key,
      identitySource: typeof raw.identity_source === "string" && TOKEN.test(raw.identity_source) ? raw.identity_source : null,
      identityRef: typeof raw.identity_ref === "string" && raw.identity_ref.length <= 128 ? raw.identity_ref : null,
      dataSource, dataSourceClass, trust,
      fields,
      fetchedAt: fetched && !Number.isNaN(fetched.getTime()) ? fetched : null,
      isPublic: raw.is_public === true,
    };
  } catch {
    return null;
  }
}

// game_key -> normalized profile. The key is the NORMALIZED game (the same key the recognition map uses), never a provider: the same game discovered
// through Steam, Discord, PlayStation or Xbox resolves to ONE profile, so discovery provenance can never force duplicate profiles.
export function indexGameProfiles(rows) {
  const index = new Map();
  if (!Array.isArray(rows)) return index;
  for (const row of rows) { const profile = normalizeGameProfile(row); if (profile && !index.has(profile.gameKey)) index.set(profile.gameKey, profile); }
  return index;
}
export const profileForGame = (index, gameKey) => (typeof gameKey === "string" && index instanceof Map ? index.get(gameKey) || null : null);

export function trustPresentation(profile) {
  if (profile.trust === "VERIFIED") return { label: "VERIFIED", tone: "ok", note: "Ownership of this game identity has been verified." };
  if (profile.trust === "CONNECTED") return { label: "CONNECTED", tone: "ok", note: "This identity came from an account you connected." };
  return { label: "UNVERIFIED", tone: "caution", note: "Entered manually. This is not proof that the identity belongs to you." };
}

export const dataSourceLabel = (profile, labels = {}) => labels.dataSources?.[profile.dataSource] || DATA_SOURCE_LABELS[profile.dataSource] || plainWords(profile.dataSource);
export const identityLabel = (profile, labels = {}) => (profile.identityRef ? `${labels.identitySources?.[profile.identitySource] || IDENTITY_SOURCE_LABELS[profile.identitySource] || (profile.identitySource ? plainWords(profile.identitySource) : "Identity")}: ${profile.identityRef}` : "");

export function displayValue(field) {
  if (typeof field.value === "number") return field.kind === "percent" ? `${field.value}%` : String(field.value);
  return field.value;
}

// The expanded content. Plain text only; rows of label/value pairs, whatever the game.
export function buildGameProfilePanel({ element, profile, id, labels = {} }) {
  const panel = element("div", "game-profile-panel");
  panel.id = id;
  const trust = trustPresentation(profile);
  const meta = element("div", "game-profile-meta");
  const trustChip = element("span", `game-profile-chip is-${trust.tone}`, trust.label);
  meta.append(trustChip, element("span", "game-profile-chip", dataSourceLabel(profile, labels)));
  const fields = element("dl", "game-profile-fields");
  for (const field of profile.fields) {
    const pair = element("div", "game-profile-field");
    pair.append(element("dt", "", field.label), element("dd", "", displayValue(field)));
    fields.append(pair);
  }
  panel.append(meta, fields);
  const identity = identityLabel(profile, labels);
  if (identity) panel.append(element("p", "game-profile-note", identity));
  const when = profile.fetchedAt ? `Updated ${profile.fetchedAt.toLocaleDateString()}` : "Update time not reported";
  panel.append(element("p", "game-profile-note", `${trust.note} ${when}. Private to you: Game Profiles are not shown on your public GamID.`));
  return panel;
}

// Adds the small affordance + the (collapsed) panel to an existing compact row. Called ONLY for a row whose game has a real attached profile.
//   expanded : a Set of state keys the caller owns; every game toggles independently and nothing starts open
// Toggling is done IN PLACE (no re-render), so the page never jumps and the Show all / Show fewer control is unaffected.
export function attachGameProfile({ element, item, profile, stateKey, expanded, idPrefix = "gameProfile", gameName = "this game", labels = {} }) {
  const id = `${idPrefix}-${stateKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const open = expanded.has(stateKey);
  const toggle = element("button", "game-profile-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-controls", id);
  toggle.setAttribute("aria-label", `Game Profile for ${gameName}`);
  toggle.append(element("span", "game-profile-toggle-text", "Profile"), element("span", "game-profile-chevron"));
  const panel = buildGameProfilePanel({ element, profile, id, labels });
  panel.hidden = !open;
  item.className = `${item.className || ""} has-game-profile`.trim();
  toggle.addEventListener("click", () => {
    const willOpen = !expanded.has(stateKey);
    if (willOpen) expanded.add(stateKey); else expanded.delete(stateKey);
    toggle.setAttribute("aria-expanded", String(willOpen));
    panel.hidden = !willOpen;
  });
  item.append(toggle, panel);
  return { toggle, panel };
}
