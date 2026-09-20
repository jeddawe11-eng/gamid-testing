// League of Legends / OP.GG compatibility layer for the provider-neutral Game Profile model (game-profile.js).
//
// It only READS the owner's existing League row (public.get_my_league_profile) and shapes it as a normalized Game Profile record, to show that the generic
// model can represent a real, accepted stats integration and to document the future migration path. The League tables, functions, trust labels, throttling
// and owner UI are untouched, and this module is not used to render League anywhere today. It is the ONE place (besides the accepted League adapter and its
// UI label) that knows the OP.GG source, so the neutral module stays free of it.
import { DATA_SOURCE_LABELS } from "./game-profile.js";

export const LEAGUE_LABELS = Object.freeze({
  dataSources: Object.freeze({ ...DATA_SOURCE_LABELS, OPGG_TEMPORARY: "OP.GG (temporary, unofficial)" }),
  identitySources: Object.freeze({ MANUAL_RIOT_ID: "Riot ID (entered manually)" }),
});
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
export function leagueRowToGameProfileRow(row) {
  if (!row || typeof row !== "object") return null;
  const fields = [];
  if (row.solo_rank_state === "RANKED" && row.solo_tier) {
    const tier = `${row.solo_tier.charAt(0)}${row.solo_tier.slice(1).toLowerCase()}`;
    fields.push({ key: "rank", label: "Solo/Duo rank", value: `${tier}${!APEX.has(row.solo_tier) && row.solo_division ? ` ${row.solo_division}` : ""}`, kind: "rank" });
    if (Number.isInteger(row.solo_lp)) fields.push({ key: "lp", label: "LP", value: row.solo_lp, kind: "number" });
  } else if (row.solo_rank_state === "UNRANKED") fields.push({ key: "rank", label: "Solo/Duo rank", value: "Unranked", kind: "rank" });
  if (Number.isInteger(row.solo_wins) && Number.isInteger(row.solo_losses)) {
    const total = row.solo_wins + row.solo_losses;
    fields.push({ key: "matches", label: "Matches", value: total, kind: "number" });
    if (total > 0) fields.push({ key: "win_rate", label: "Win rate", value: `${Math.round((row.solo_wins / total) * 1000) / 10}%`, kind: "percent" });
  }
  return {
    game_key: "league_of_legends",
    identity_source: row.identity_source || "MANUAL_RIOT_ID",
    identity_ref: row.game_name && row.tag_line ? `${row.game_name}#${row.tag_line}` : null,
    data_source: row.data_source || "OPGG_TEMPORARY",
    data_source_class: row.data_source === "OPGG_TEMPORARY" ? "UNOFFICIAL_TEMPORARY" : "THIRD_PARTY",
    trust_status: row.trust_status || "MANUAL",   // League rows can only be MANUAL for a temporary source (a table CHECK); carried over unchanged
    verification_basis: null,
    fields,
    fetched_at: row.fetched_at || null,
    is_public: row.is_public === true,
  };
}
