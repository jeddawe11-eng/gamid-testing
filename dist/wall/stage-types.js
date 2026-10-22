// Wall Stages V2 (DEC-0011, Mazen's task 2026-10-22): every stage is a MY STAGE or a FRIENDS STAGE.
//   - My Stage: the owner's own stage - every existing editing capability. A stage without `type` IS a My Stage, so every Wall saved before stage types existed is
//     unchanged and valid (no migration rewrites it).
//   - Friends Stage (`type: "friends"`): reserved for friends' stickers (a later system). The owner places no ordinary elements on it and gives it no background
//     of their own; its background will come only from the official GamID background catalog (wall-kit/background-catalog.js), which does not exist yet.
//   - A Wall always keeps at least one My Stage.
// The database (private.wall_stage_type_errors) mirrors stageTypeErrors exactly. How MANY stages a Wall may have is not a document rule: the server decides it per
// owner (private.wall_stage_allowance) - see WALL_STAGE_LIMIT.
import { isSet } from "./fields.js";

export const STAGE_TYPES = Object.freeze(["my", "friends"]);
export const stageType = stage => (stage?.type === "friends" ? "friends" : "my");
export const isFriendsStage = stage => stage?.type === "friends";
export const myStageCount = doc => (Array.isArray(doc?.stages) ? doc.stages.filter(stage => stageType(stage) === "my").length : 0);

// The number of stages every owner may have today (Free and future Pro alike until Pro exists; the approved direction is Free 3 / Pro 5, DEC-0011). The server is
// the authority (private.wall_stage_allowance, read by the editor through get_my_wall_stage_allowance); this is only the value the editor uses before it has read
// it, or when it cannot. No plan, entitlement or subscription is decided in the browser.
export const WALL_STAGE_LIMIT = 3;

// Active friends' stickers on a stage. The Friends Stickers system is not built, so a Wall document holds no stickers and this is always 0 - the single place the
// future system will report them. While it is above 0 a Friends Stage can be neither deleted nor turned into a My Stage (DEC-0011 E).
export const activeStickerCount = () => 0;
// A Friends Stage the owner created that shows no approved sticker: it gets the empty-state message (wall-kit/friends-stage.js). `stickers` is the number of visible
// approved stickers the future system reports for it (activeStickerCount until then, so always 0 today). A My Stage never qualifies, empty or not.
export const isEmptyFriendsStage = (stage, stickers = activeStickerCount(stage)) => isFriendsStage(stage) && stickers === 0;

// The stage-type rules, in stage order, then the Wall-level one. Appended at the END of validateDocument's errors (the SQL port appends them at the same point).
export function stageTypeErrors(stages) {
  const errors = [];
  let mine = 0;
  for (const stage of stages) {
    if (!stage || typeof stage !== "object" || Array.isArray(stage) || typeof stage.id !== "string" || !stage.id) continue;   // already reported as INVALID_STAGE_ID
    if (isSet(stage.type) && !STAGE_TYPES.includes(stage.type)) { errors.push(`INVALID_STAGE_TYPE:${stage.id}`); continue; }
    if (stage.type === "friends") {
      if (isSet(stage.background)) errors.push(`FRIENDS_STAGE_BACKGROUND:${stage.id}`);
      if (Array.isArray(stage.elements) && stage.elements.length > 0) errors.push(`FRIENDS_STAGE_ELEMENTS:${stage.id}`);
    } else mine++;
  }
  if (mine === 0) errors.push("NO_MY_STAGE");
  return errors;
}
