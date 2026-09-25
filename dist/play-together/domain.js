export const MAX_LANGUAGES = 2;
export const DEFAULT_LANGUAGES = ["en"];
export const MIC_VALUES = ["REQUIRED", "PREFERRED", "NO_PREFERENCE"];
export const FLOW_VALUES = ["NEED_PLAYERS", "FIND_SQUAD", "TEAM_VS_TEAM"];
export const GROUP_VALUES = ["ME", "US"];
export const TIMING_VALUES = ["PLAY_NOW", "SCHEDULED"];
export const ACTIVE_STATUSES = ["GROUP_FORMING", "MATCHING", "REQUEST_PENDING", "READY_CHECK", "ROOM_OPEN", "IN_PLAY"];

export function queuesForExperience(catalog, experienceKey) {
  return (catalog?.queues || []).filter(queue => queue.experience_key === experienceKey);
}

export function queueOptionLabel(queue) {
  if (queue?.enabled) return queue.name;
  return `${queue?.name || "Unknown queue"} · ${queue?.availability || "UNVERIFIED"} · Not available for creation — ${queue?.note || "verified creation rules are unavailable"}`;
}

export function maxSeatsForQueue(queue, currentGroupSize = 1) {
  return queue?.enabled && Number.isInteger(queue.max_party_size)
    ? Math.max(0, queue.max_party_size - Math.max(1, Number(currentGroupSize) || 1))
    : 0;
}

export function normalizeLanguages(values) {
  return [...new Set((values || []).map(value => String(value).toLowerCase()))].slice(0, MAX_LANGUAGES);
}

export function validateSchedule(kind, scheduledStart, now = Date.now(), horizonMinutes = 180) {
  if (!TIMING_VALUES.includes(kind)) return "Choose Play Now or Scheduled.";
  if (kind === "PLAY_NOW") return scheduledStart ? "Play Now cannot have a scheduled time." : null;
  const start = new Date(scheduledStart).getTime();
  if (!Number.isFinite(start) || start <= now) return "Scheduled time must be in the future.";
  if (start > now + horizonMinutes * 60_000) return `Scheduled time must be within ${horizonMinutes / 60} hours.`;
  return null;
}

export function validateDraft({ flow = "NEED_PLAYERS", groupKind = "ME", currentGroupSize = 1, queue, regionKey, seatsWanted, languageKeys, micPreference, timingKind = "PLAY_NOW", scheduledStart = null, horizonMinutes = 180 }) {
  if (!FLOW_VALUES.includes(flow)) return "Choose a Play Together direction.";
  if (!GROUP_VALUES.includes(groupKind)) return "Choose Me or Us.";
  if (!queue?.enabled) return "Choose an available queue.";
  if (!regionKey) return "Choose your Riot region/server.";
  if (!Number.isInteger(currentGroupSize) || currentGroupSize < 1) return "Your confirmed group size is invalid.";
  const maxSeats = maxSeatsForQueue(queue, currentGroupSize);
  if (flow === "NEED_PLAYERS" && (!Number.isInteger(seatsWanted) || seatsWanted < 1 || seatsWanted > maxSeats)) return `Choose 1–${maxSeats} seats.`;
  if (flow === "FIND_SQUAD" && Number(seatsWanted || 0) !== 0) return "Find Squad does not use Seats Wanted.";
  if (flow === "TEAM_VS_TEAM") {
    if (!Number.isInteger(queue.team_size) || currentGroupSize !== queue.team_size) return `Team vs Team requires a complete team of ${queue.team_size}.`;
    if (Number(seatsWanted || 0) !== 0) return "Team vs Team does not use Seats Wanted.";
  }
  const languages = normalizeLanguages(languageKeys);
  if (!languages.length || languages.length > MAX_LANGUAGES) return "Choose one or two languages.";
  if (!MIC_VALUES.includes(micPreference)) return "Choose a mic preference.";
  const timingError = validateSchedule(timingKind, scheduledStart, Date.now(), horizonMinutes);
  if (timingError) return timingError;
  return null;
}

export function sharesLanguage(left = [], right = []) {
  const rightSet = new Set(normalizeLanguages(right));
  return normalizeLanguages(left).some(key => rightSet.has(key));
}

export function micCompatibility(left, right) {
  if (!MIC_VALUES.includes(left) || !MIC_VALUES.includes(right)) return 0;
  if (left === right) return 2;
  if (left === "NO_PREFERENCE" || right === "NO_PREFERENCE") return 1;
  return 1;
}

export function compatibilityScore(candidate) {
  if (!candidate?.eligible) return null;
  return Number(candidate.region_match) * 100
    + Number(candidate.queue_match) * 80
    + Number(candidate.role_match) * 20
    + Number(candidate.language_match) * 10
    + Number(candidate.mic_score || 0);
}

export function humanMic(value) {
  return ({ REQUIRED:"Required", PREFERRED:"Preferred", NO_PREFERENCE:"No preference" })[value] || value;
}
