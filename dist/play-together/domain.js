export const MAX_LANGUAGES = 2;
export const DEFAULT_LANGUAGES = ["en"];
export const MIC_VALUES = ["REQUIRED", "PREFERRED", "NO_PREFERENCE"];

export function queuesForExperience(catalog, experienceKey) {
  return (catalog?.queues || []).filter(queue => queue.experience_key === experienceKey);
}

export function maxSeatsForQueue(queue) {
  return queue?.enabled && Number.isInteger(queue.max_party_size) ? Math.max(0, queue.max_party_size - 1) : 0;
}

export function normalizeLanguages(values) {
  return [...new Set((values || []).map(value => String(value).toLowerCase()))].slice(0, MAX_LANGUAGES);
}

export function validateDraft({ queue, regionKey, seatsWanted, languageKeys, micPreference }) {
  if (!queue?.enabled) return "Choose an available queue.";
  if (!regionKey) return "Choose your Riot region/server.";
  const maxSeats = maxSeatsForQueue(queue);
  if (!Number.isInteger(seatsWanted) || seatsWanted < 1 || seatsWanted > maxSeats) return `Choose 1–${maxSeats} seats.`;
  const languages = normalizeLanguages(languageKeys);
  if (!languages.length || languages.length > MAX_LANGUAGES) return "Choose one or two languages.";
  if (!MIC_VALUES.includes(micPreference)) return "Choose a mic preference.";
  return null;
}

export function humanMic(value) {
  return ({ REQUIRED:"Required", PREFERRED:"Preferred", NO_PREFERENCE:"No preference" })[value] || value;
}
