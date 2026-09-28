// Resolves and paints a live GamID Data element (gamid-data.js). Resolution is the privacy boundary:
//   EDIT (the owner's editor canvas): the owner's own snapshot, so they can design with their real data; anything visitors cannot see is tagged PRIVATE, and a
//        binding whose data is gone shows a plain diagnostic ("Steam connection is no longer available.").
//   VIEW (Preview / a visitor): ONLY `snapshot.public` - exactly what the anonymous public profile returns right now. Nothing the owner hid is ever drawn, and a
//        binding that resolves to nothing draws nothing (no diagnostic, no placeholder text a visitor could misread).
// Text is only ever set with textContent; the picture is only ever a blob: URL; every style value comes from validated data (paint.js helpers).
import { paintGamidBlock } from "./gamid-blocks.js";
import { DATA_COLLECTIONS } from "./gamid-data.js";

// provider names come from the snapshot (the editor's data layer names providers; this painter never does)
const providerLabel = (snapshot, key) => snapshot?.connectionLabels?.[key] ?? "This";

const blobOnly = url => (typeof url === "string" && /^blob:/.test(url) ? url : null);

// -> { state: "ok", value, private? } | { state: "missing", message } | { state: "pending", promise } | { state: "hidden" }
export function resolveGamidData(content, snapshot, mode = "edit") {
  const field = content.field;
  if (!snapshot) return mode === "view" ? { state: "hidden" } : { state: "missing", message: "GamID data is not available here." };
  if (mode === "view") return resolvePublic(content, snapshot.public);
  const notPublic = snapshot.public ? snapshot.public.available === false : false;
  const profile = snapshot.profile ?? {};
  const tag = extra => (notPublic || extra ? { private: true } : {});
  switch (field) {
    case "avatar": return { state: "ok", value: { url: blobOnly(profile.avatarUrl), initial: profile.initial || "G" }, ...tag() };
    case "displayName": return profile.displayName ? { state: "ok", value: profile.displayName, ...tag() } : { state: "missing", message: "Your GamID has no display name yet." };
    case "handle": return profile.handle ? { state: "ok", value: `@${profile.handle}`, ...tag() } : { state: "missing", message: "Your GamID has no @GamID yet." };
    case "bio": return profile.bio ? { state: "ok", value: profile.bio, ...tag() } : { state: "missing", message: "Your GamID has no bio yet." };
    case "role": {
      const roles = snapshot.roles ?? [];
      const role = content.ref === "@primary" ? roles.find(item => item.primary) : roles.find(item => item.key === content.ref);
      if (!role) return { state: "missing", message: content.ref === "@primary" ? "You have no primary role on your GamID." : "This role is no longer on your GamID." };
      return { state: "ok", value: role.label, ...tag() };
    }
    case "game": {
      const game = (snapshot.games?.items ?? []).find(item => item.ref === content.ref);
      if (!game) return { state: "missing", message: "This game is no longer in your games." };
      return { state: "ok", value: game.refName || game.name, ...tag(snapshot.visibility?.games === false) };
    }
    case "connection": {
      const connection = (snapshot.connections ?? []).find(item => item.key === content.ref);
      if (!connection) return { state: "missing", message: `${providerLabel(snapshot, content.ref)} connection is no longer available.` };
      return { state: "ok", value: connectionText(connection, content), ...tag() };
    }
    default: return { state: "ok", value: null, ...tag(DATA_PRIVATE(snapshot, field)) };
  }
}
const DATA_PRIVATE = (snapshot, field) => snapshot.visibility?.[field] === false;
const connectionText = (connection, content) => (content.withLabel === false ? connection.name : `${connection.label} · ${connection.name}`);

function resolvePublic(content, view) {
  if (!view || !view.available) return { state: "hidden" };
  const profile = view.profile ?? {};
  switch (content.field) {
    case "avatar": return { state: "ok", value: { url: blobOnly(profile.avatarUrl), initial: profile.initial || "G" } };
    case "displayName": return profile.displayName ? { state: "ok", value: profile.displayName } : { state: "hidden" };
    case "handle": return profile.handle ? { state: "ok", value: `@${profile.handle}` } : { state: "hidden" };
    case "bio": return profile.bio ? { state: "ok", value: profile.bio } : { state: "hidden" };
    case "role": {
      const roles = view.roles ?? [];
      const role = content.ref === "@primary" ? roles.find(item => item.primary) : roles.find(item => item.key === content.ref);
      return role ? { state: "ok", value: role.label } : { state: "hidden" };
    }
    case "game": {
      if (!view.games) return { state: "hidden" };   // My Games is off: nothing about any game is public
      if (typeof view.findGame !== "function") return { state: "hidden" };
      return { state: "pending", promise: view.findGame(content.ref).then(game => (game ? game.name : null), () => null) };
    }
    case "connection": {
      const connection = (view.connections ?? []).find(item => item.key === content.ref);
      return connection ? { state: "ok", value: connectionText(connection, content) } : { state: "hidden" };
    }
    default: return { state: "ok", value: null };
  }
}

// A collection in VIEW mode is drawn from the public view only (roles included), through the accepted GamID block painter.
function visitorSnapshot(view) {
  return { public: view, profile: view.profile ?? {}, roles: view.roles ?? [], connections: view.connections ?? [], games: { total: 0, items: [], playtimeAllowed: false }, visibility: {} };
}

export function paintGamidData(node, content, scale, item, createNode, ctx, { paintText, paintArtworkFrame, px }) {
  const mode = ctx.mode === "view" ? "view" : "edit";
  node.setAttribute("data-field", content.field);
  const make = (tag, className, text) => { const n = createNode(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const resolved = resolveGamidData(content, ctx.gamid ?? null, mode);
  if (resolved.state === "hidden") { node.setAttribute("data-state", "hidden"); return; }
  if (resolved.state === "missing") {
    node.setAttribute("data-state", "missing");
    const box = make("div", "wall-data-missing", resolved.message);
    for (const [name, value] of [["box-sizing", "border-box"], ["display", "grid"], ["place-items", "center"], ["text-align", "center"], ["width", "100%"], ["height", "100%"], ["padding", px(8)],
      ["border", `${px(Math.max(1, 3 * scale))} dashed #ffb020`], ["border-radius", px(14 * scale)], ["background", "rgba(20, 16, 31, .75)"], ["color", "#ffcf70"],
      ["font", `600 ${px(Math.max(9, 26 * scale))} system-ui, sans-serif`], ["overflow", "hidden"]]) box.style.setProperty(name, value);
    node.append(box);
    return;
  }
  node.setAttribute("data-state", "ok");
  if (content.field === "avatar") {
    const frame = paintArtworkFrame(node, content.look ?? { backdrop: "none" }, scale, item, createNode);
    const { url, initial } = resolved.value;
    if (url) {
      const img = createNode("img");
      img.setAttribute("src", url);
      img.setAttribute("alt", "");
      img.setAttribute("draggable", "false");
      for (const [name, value] of [["display", "block"], ["width", "100%"], ["height", "100%"], ["object-fit", "cover"]]) img.style.setProperty(name, value);
      frame.append(img);
    } else {
      const letter = make("div", "wall-data-initial", initial);
      for (const [name, value] of [["display", "grid"], ["place-items", "center"], ["width", "100%"], ["height", "100%"], ["background", "linear-gradient(135deg, #8b5dff, #62e7ff)"], ["color", "#0b0913"],
        ["font", `800 ${px(Math.min(item.width, item.height) * 0.45)} system-ui, sans-serif`]]) letter.style.setProperty(name, value);
      frame.append(letter);
    }
  } else if (content.text) {
    node.style.setProperty("overflow", "visible");   // like a Text element: effects may spread past the box
    const paintValue = value => { node.replaceChildren?.(); paintText(node, { kind: "text", ...content.text, text: value }, scale, createNode); };
    if (resolved.state === "pending") {
      node.setAttribute("data-state", "pending");
      resolved.promise.then(value => { if (value) { paintValue(value); node.setAttribute("data-state", "ok"); } else node.setAttribute("data-state", "hidden"); });
    } else paintValue(resolved.value);
  } else {
    const view = mode === "view";
    const snapshot = view ? visitorSnapshot(ctx.gamid.public) : ctx.gamid;
    const block = { kind: "gamid", block: content.field, layout: content.layout, initial: content.initial, showPlaytime: content.showPlaytime, ...(content.style ? { style: content.style } : {}) };
    node.append(paintGamidBlock(block, snapshot, createNode, { scale, interactive: view, details: ctx.details ?? null, posters: ctx.posters ?? null }));
  }
  // (a collection whose own section is off already says PRIVATE in its heading - the block painter - so it is not tagged twice)
  if (mode === "edit" && resolved.private && !(DATA_COLLECTIONS[content.field] && ctx.gamid?.visibility?.[content.field] === false)) {
    const badge = make("span", "wall-data-private", "PRIVATE");
    for (const [name, value] of [["position", "absolute"], ["top", "0"], ["right", "0"], ["z-index", "2"], ["padding", `${px(2)} ${px(6)}`], ["background", "#ffb020"], ["color", "#0b0913"],
      ["font", `800 ${px(Math.max(8, 16 * scale))} system-ui, sans-serif`], ["letter-spacing", ".08em"], ["border-radius", px(4)], ["pointer-events", "none"]]) badge.style.setProperty(name, value);
    node.append(badge);
  }
}
