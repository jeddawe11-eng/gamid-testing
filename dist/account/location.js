// Structured Location (Classic Profile consolidated update): one normalizer shared by the GeoNames import (scripts/location/geonames-import.mjs) and the
// About Me editor's search, so a typed query and the stored search keys fold the same way: accents and Arabic diacritics removed, Arabic letter variants
// unified (alef forms, alef maksura, teh marbuta), lower case, single spaces. Country names come from the catalog (English) and from the browser's own
// Intl.DisplayNames for Arabic; the city list is searched on the server inside the chosen country only.
const ARABIC = /[؀-ۿ]/;
export const isArabic = text => ARABIC.test(String(text ?? ""));

export function locationSearchKey(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/ـ/g, "")                      // tatweel
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// the country's name in Arabic from the browser (no dataset); "" when the browser cannot say
export function arabicCountryName(code, displayNames = null) {
  try {
    const names = displayNames ?? new Intl.DisplayNames(["ar"], { type: "region" });
    const name = names.of(code);
    return name && name !== code ? name : "";
  } catch { return ""; }
}

// countries [{code, name}] filtered by a typed query in English or Arabic -> at most `limit`, prefix matches first
export function filterCountries(countries, query, { limit = 12, arabic = arabicCountryName } = {}) {
  const q = locationSearchKey(query);
  const rows = (countries || []).map(c => ({ ...c, nameAr: arabic(c.code) }));
  if (!q) return rows.slice(0, limit);
  const scored = [];
  for (const row of rows) {
    const en = locationSearchKey(row.name), ar = locationSearchKey(row.nameAr);
    const rank = en.startsWith(q) || ar.startsWith(q) ? 0 : en.includes(q) || ar.includes(q) || row.code.toLowerCase() === q ? 1 : -1;
    if (rank >= 0) scored.push({ row, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name)).slice(0, limit).map(x => x.row);
}
