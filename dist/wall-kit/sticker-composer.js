// Friends Stickers V1 (2026-10-24): the ONE send flow, used by both entry points.
//   Editor:  Templates & Stickers -> Stickers -> pick a sticker -> Send sticker -> find a GamID player -> their Friends Stage -> position -> (optional clip) -> Send
//   Visitor: a Friends Stage's "Add sticker" on another player's Wall -> pick a sticker -> (that stage) -> position -> (optional clip) -> Send
// The recipient's Wall shown here is their PUBLISHED Wall (the same anonymous read visitors get) with its approved stickers; the sender can only place their own new
// sticker on it - nothing of the recipient's is editable. Everything is decided again on the server (send_wall_sticker): who may send, where, which sticker, the
// position, the clip link and the anti-spam limits. The request then waits for the Wall owner's approval; nothing shows publicly until then.
import { STICKER_CATALOG, STICKER_START, STICKER_AREA, clampToStickerArea, stickerByKey } from "../wall/stickers.js";
import { parseStickerClip, STICKER_CLIP_LABELS, stickerClipProvidersText } from "./embed/providers/clip-links.js";
import { isFriendsStage } from "../wall/stage-types.js";
import { renderDocument } from "../wall/render.js";
import { validateDocument } from "../wall/validate.js";
import { paintStage } from "./paint.js";
import { paintSticker, stickerView, stickerArtUrl, stickerStillUrl } from "./sticker-paint.js";

export const STICKER_MESSAGES = Object.freeze({
  AUTH_REQUIRED: "Sign in to send stickers.",
  IDENTITY_NOT_FOUND: "Create your GamID to send stickers.",
  STICKER_SENDER_NOT_PUBLIC: "Your GamID must be public to send stickers - visitors see who sent each sticker.",
  STICKER_SELF: "You can't send a sticker to your own Wall.",
  STICKER_RECIPIENT_NOT_FOUND: "This player's Wall isn't taking stickers right now.",
  STICKER_STAGE_NOT_FRIENDS: "That Friends Stage isn't available any more. Choose another one.",
  STICKER_UNKNOWN: "Choose a sticker first.",
  STICKER_POSITION_INVALID: "Place the sticker inside the stage.",
  STICKER_CLIP_INVALID: `That clip link doesn't look right. Paste a ${stickerClipProvidersText()} clip link.`,
  STICKER_CLIP_UNSUPPORTED: `Only ${stickerClipProvidersText()} clip links can be attached.`,
  STICKER_PENDING_LIMIT: "You already have 5 stickers waiting on this Wall. Wait until the owner reviews them.",
  STICKER_RATE_LIMIT: "You've sent a lot of stickers in the last hour. Please try again later.",
  STICKER_NOT_FOUND: "That sticker isn't there any more.",
  STICKER_NOT_PENDING: "That request was already reviewed.",
  STICKER_STAGE_GONE: "That Friends Stage is no longer on your Wall, so this sticker can't be approved. You can reject it.",
  STAGE_HAS_STICKERS: "This Friends Stage still has stickers on it. Remove them first.",
});
export const stickerMessage = error => STICKER_MESSAGES[error?.message] ?? (error?.status === 0 ? "GamID couldn't be reached. Check your connection and try again." : "Something went wrong. Please try again.");

const PREVIEW_MAX_WIDTH = 360;

export function openStickerComposer({ api, doc = document, win = window, handle = null, stageId = null, stickerKey = null, onSent = () => {}, onClose = () => {} }) {
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, className = "sticker-btn") => { const node = make("button", className, text); node.type = "button"; return node; };
  const state = { sticker: stickerByKey(stickerKey)?.key ?? null, recipient: handle ? { gamid_handle: handle } : null, fixedRecipient: Boolean(handle), stageId, x: STICKER_START.x, y: STICKER_START.y, clip: "", me: null, published: null, stickers: [], avatars: new Map() };
  const returnFocus = doc.activeElement;

  const backdrop = make("div", "sticker-composer-backdrop");
  const dialog = make("div", "sticker-composer");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "stickerComposerTitle");
  const head = make("div", "sticker-composer-head");
  const title = make("h2", "sticker-composer-title", "Send a sticker");
  title.id = "stickerComposerTitle";
  title.tabIndex = -1;
  const close = button("", "sticker-composer-close");
  close.setAttribute("aria-label", "Close");
  const cross = make("span", "", "×");
  cross.setAttribute("aria-hidden", "true");
  close.append(cross);
  head.append(title, close);
  const body = make("div", "sticker-composer-body");
  const status = make("p", "sticker-composer-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  dialog.append(head, body, status);
  backdrop.append(dialog);
  doc.body.append(backdrop);
  doc.documentElement.classList.add("has-sticker-composer");

  let closed = false;
  function finish() {
    if (closed) return;
    closed = true;
    backdrop.remove();
    doc.documentElement.classList.remove("has-sticker-composer");
    doc.removeEventListener("keydown", onKey, true);
    for (const url of state.avatars.values()) if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
    try { returnFocus?.focus?.(); } catch { /* gone */ }
    onClose();
  }
  close.addEventListener("click", finish);
  backdrop.addEventListener("pointerdown", event => { if (event.target === backdrop) finish(); });
  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); finish(); return; }
    if (event.key !== "Tab") return;
    // keep focus inside the dialog
    const focusable = [...dialog.querySelectorAll("button, input, a[href], [tabindex='0']")].filter(node => !node.disabled && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  doc.addEventListener("keydown", onKey, true);
  const say = text => { status.textContent = text || ""; };
  const show = (heading, ...nodes) => { title.textContent = heading; body.replaceChildren(...nodes); say(""); requestAnimationFrame(() => title.focus()); };

  const avatarFor = async path => {
    if (!path) return null;
    if (state.avatars.has(path)) return state.avatars.get(path);
    const url = await api.loadPublicAvatar?.(path).catch(() => null) ?? null;
    state.avatars.set(path, url);
    return url;
  };

  // ---- 0. may I send at all ----
  async function start() {
    show("Send a sticker", make("p", "sticker-hint", "Checking your GamID…"));
    try {
      await api.restoreSession?.();
      state.me = await api.getMyStickerSender();
    } catch (error) { show("Send a sticker", make("p", "sticker-hint", stickerMessage(error))); return; }
    if (!state.me?.can_send) {
      const link = make("a", "sticker-btn", "Open your account");
      link.href = new URL("../account/", import.meta.url).href;
      show("Send a sticker", make("p", "sticker-hint", STICKER_MESSAGES.STICKER_SENDER_NOT_PUBLIC), link);
      return;
    }
    state.me.avatarUrl = await avatarFor(state.me.avatar_media_reference);
    if (state.recipient && state.recipient.gamid_handle === state.me.gamid_handle) { show("Send a sticker", make("p", "sticker-hint", STICKER_MESSAGES.STICKER_SELF)); return; }
    if (!state.sticker) pick(); else if (!state.recipient) findPlayer(); else place();
  }

  // ---- 1. which sticker ----
  function pick() {
    const preview = make("div", "sticker-preview");
    const next = button("Next", "sticker-btn sticker-primary");
    const showPreview = key => {
      if (!key) { preview.replaceChildren(make("p", "sticker-hint", "Choose one of the 14 animated stickers.")); next.disabled = true; return; }
      const img = make("img");
      img.src = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? stickerStillUrl(key) : stickerArtUrl(key);
      img.alt = `${stickerByKey(key).name} sticker`;
      preview.replaceChildren(img);
      next.disabled = false;
    };
    showPreview(state.sticker);
    next.addEventListener("click", () => (state.recipient ? place() : findPlayer()));
    const actions = make("div", "sticker-actions");
    actions.append(next);
    show("Choose a sticker", preview, stickerCatalogGrid({ doc, selected: state.sticker, onChoose: key => { state.sticker = key; showPreview(key); } }), actions);
  }

  // ---- 2. who gets it (editor entry point) ----
  function findPlayer() {
    const label = make("label", "sticker-label", "Find a GamID player");
    const input = make("input", "sticker-input");
    input.type = "search";
    input.placeholder = "Username or name";
    input.autocomplete = "off";
    input.setAttribute("aria-describedby", "stickerSearchHint");
    label.append(input);
    const hint = make("p", "sticker-hint", "Players whose public Wall has a Friends Stage. Check the username before you send.");
    hint.id = "stickerSearchHint";
    const results = make("ul", "sticker-results");
    results.setAttribute("aria-label", "Players");
    const back = button("Back");
    back.addEventListener("click", pick);
    const actions = make("div", "sticker-actions");
    actions.append(back);
    let timer = 0, asked = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const query = input.value.trim().replace(/^@/, "");
      if (query.length < 2) { results.replaceChildren(); say(""); return; }
      timer = setTimeout(async () => {
        const mine = ++asked;
        say("Searching…");
        let rows = [];
        try { rows = await api.searchStickerRecipients(query); } catch (error) { if (mine === asked) say(stickerMessage(error)); return; }
        if (mine !== asked) return;
        say(rows.length ? `${rows.length} player${rows.length === 1 ? "" : "s"} found.` : "No player found with a Friends Stage on their public Wall.");
        results.replaceChildren(...rows.map(row => {
          const item = make("li");
          const choose = button("", "sticker-player");
          const face = make("span", "sticker-player-avatar", (row.display_name || row.gamid_handle || "G").charAt(0).toUpperCase());
          avatarFor(row.avatar_media_reference).then(url => { if (url) { const img = make("img"); img.src = url; img.alt = ""; face.replaceChildren(img); } });
          const text = make("span", "sticker-player-text");
          text.append(make("strong", "", row.display_name || `@${row.gamid_handle}`), make("span", "", `@${row.gamid_handle} · ${row.friends_stages} Friends Stage${row.friends_stages === 1 ? "" : "s"}`));
          choose.append(face, text);
          choose.setAttribute("aria-label", `${row.display_name || row.gamid_handle}, @${row.gamid_handle}`);
          choose.addEventListener("click", () => { state.recipient = row; state.stageId = null; place(); });
          item.append(choose);
          return item;
        }));
      }, 250);
    });
    show("Who gets it?", label, hint, results, actions);
    requestAnimationFrame(() => input.focus());
  }

  // ---- 3. where (their Friends Stage), 4. optional clip, 5. send ----
  async function place() {
    show("Place your sticker", make("p", "sticker-hint", "Opening their Wall…"));
    const recipientHandle = state.recipient.gamid_handle;
    let published = null, stickers = [];
    try {
      [published, stickers] = await Promise.all([api.getPublicWall(recipientHandle), api.getPublicWallStickers(recipientHandle).catch(() => [])]);
    } catch (error) { show("Place your sticker", make("p", "sticker-hint", stickerMessage(error))); return; }
    const wallDoc = published?.document;
    const friends = wallDoc && validateDocument(wallDoc).valid ? wallDoc.stages.map((stage, index) => ({ stage, index })).filter(({ stage }) => isFriendsStage(stage)) : [];
    if (!friends.length) { show("Place your sticker", make("p", "sticker-hint", STICKER_MESSAGES.STICKER_RECIPIENT_NOT_FOUND)); return; }
    if (!friends.some(({ stage }) => stage.id === state.stageId)) state.stageId = friends[0].stage.id;
    state.published = wallDoc;
    await Promise.all(stickers.map(async row => { row.avatarUrl = await avatarFor(row.sender_avatar_media_reference); }));
    state.stickers = stickers;

    const who = make("p", "sticker-recipient");
    who.append(make("span", "", "To "), make("strong", "", `@${recipientHandle}`));
    const chips = make("div", "sticker-stage-chips");
    chips.setAttribute("role", "radiogroup");
    chips.setAttribute("aria-label", "Friends Stage");
    if (friends.length > 1) for (const { stage, index } of friends) {
      const chip = button(`Stage ${index + 1}`, "sticker-chip");
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(stage.id === state.stageId));
      chip.addEventListener("click", () => { state.stageId = stage.id; for (const other of chips.children) other.setAttribute("aria-checked", String(other === chip)); paintPreview(); });
      chips.append(chip);
    }
    const frame = make("div", "sticker-stage-frame");
    const help = make("p", "sticker-hint", "Drag your sticker to where you want it (or use the arrow keys). The owner approves it before anyone sees it.");
    const clipLabel = make("label", "sticker-label", "Gaming clip link (optional)");
    const clip = make("input", "sticker-input");
    clip.type = "url";
    clip.inputMode = "url";
    clip.placeholder = "Paste a clip link";
    clip.value = state.clip;
    clip.maxLength = 300;
    clip.setAttribute("aria-describedby", "stickerClipHint");
    clipLabel.append(clip);
    const clipHint = make("p", "sticker-hint", `${stickerClipProvidersText()}. Only a link: visitors open it on that site.`);
    clipHint.id = "stickerClipHint";
    const send = button("Send sticker", "sticker-btn sticker-primary");
    const back = button("Back");
    back.addEventListener("click", () => (state.fixedRecipient ? pick() : findPlayer()));
    const checkClip = () => {
      const parsed = parseStickerClip(clip.value);
      state.clip = clip.value;
      clip.setAttribute("aria-invalid", String(!parsed.ok));
      clipHint.textContent = parsed.ok ? (parsed.clip ? `${STICKER_CLIP_LABELS[parsed.clip.provider]} clip link.` : `${stickerClipProvidersText()}. Only a link: visitors open it on that site.`) : STICKER_MESSAGES[parsed.code];
      send.disabled = !parsed.ok;
      return parsed;
    };
    clip.addEventListener("input", checkClip);
    checkClip();
    send.addEventListener("click", async () => {
      const parsed = checkClip();
      if (!parsed.ok) { clip.focus(); return; }
      send.disabled = back.disabled = true;
      say("Sending…");
      try {
        await api.sendWallSticker({ handle: recipientHandle, stageId: state.stageId, stickerKey: state.sticker, x: state.x, y: state.y, clipUrl: parsed.clip?.url ?? null });
      } catch (error) { send.disabled = back.disabled = false; say(stickerMessage(error)); return; }
      sent(recipientHandle);
    });
    const actions = make("div", "sticker-actions");
    actions.append(back, send);
    show("Place your sticker", who, chips, frame, help, clipLabel, clipHint, actions);

    const share = (value, min, max) => Math.round((value - min) / (max - min) * 100);
    const positionLabel = () => `Your ${stickerByKey(state.sticker).name} sticker, ${share(state.x, STICKER_AREA.minX, STICKER_AREA.maxX)}% across and ${share(state.y, STICKER_AREA.minY, STICKER_AREA.maxY)}% down. Drag it, or use the arrow keys to move it.`;
    function paintPreview() {
      const index = state.published.stages.findIndex(stage => stage.id === state.stageId);
      const width = Math.max(160, Math.min(PREVIEW_MAX_WIDTH, frame.clientWidth || PREVIEW_MAX_WIDTH, Math.floor(((win.innerHeight || 700) * 0.52) * (1000 / 1778))));
      const tree = renderDocument(state.published, { viewportWidth: width });
      if (!tree.ok || index < 0) return;
      const views = state.stickers.filter(row => row.stage_id === state.stageId).map(row => stickerView(row, row.avatarUrl)).filter(Boolean);
      const node = paintStage(tree.stages[index], tree.scale, undefined, { mode: "edit", audience: "visitor", stickersFor: () => views });
      node.classList.add("sticker-stage-preview");
      const mine = stickerView({ placement_id: "new", sticker_key: state.sticker, pos_x: state.x, pos_y: state.y, size_percent: 100, approval_seq: 1e6, sender_handle: state.me.gamid_handle, sender_display_name: state.me.display_name, clip_url: parseStickerClip(state.clip).clip?.url ?? null, clip_provider: parseStickerClip(state.clip).clip?.provider ?? null }, state.me.avatarUrl);
      const ghost = paintSticker(mine, tree.scale, (tag => doc.createElement(tag)), { interactive: false, draggable: true });
      ghost.classList.add("is-ghost");
      ghost.tabIndex = 0;
      ghost.setAttribute("aria-label", positionLabel());
      let layer = node.querySelector(".wall-stickers");
      if (!layer) { layer = make("div", "wall-stickers"); node.append(layer); }
      layer.append(ghost);
      node.querySelector(".wall-friends-empty")?.remove();   // the sender sees where their sticker goes, not the empty-state message
      frame.style.setProperty("width", `${tree.stages[index].width}px`);
      frame.replaceChildren(node);
      movable(ghost, tree.scale, node);
    }
    function movable(ghost, scale, stageNode) {
      let drag = null;
      const moveTo = (x, y) => {
        const next = clampToStickerArea(x, y);
        state.x = next.x; state.y = next.y;
        const box = ghost.offsetWidth;
        ghost.style.setProperty("left", `${state.x * scale - box / 2}px`);
        ghost.style.setProperty("top", `${state.y * scale - box / 2}px`);
        ghost.setAttribute("aria-label", positionLabel());
      };
      ghost.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        const rect = stageNode.getBoundingClientRect();
        drag = { id: event.pointerId, dx: event.clientX - rect.left - state.x * scale, dy: event.clientY - rect.top - state.y * scale };
        ghost.classList.add("is-dragging");
        try { ghost.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
      });
      ghost.addEventListener("pointermove", event => {
        if (!drag || event.pointerId !== drag.id) return;
        const rect = stageNode.getBoundingClientRect();
        moveTo((event.clientX - rect.left - drag.dx) / scale, (event.clientY - rect.top - drag.dy) / scale);
      });
      const end = event => { if (!drag || event.pointerId !== drag.id) return; drag = null; ghost.classList.remove("is-dragging"); };
      ghost.addEventListener("pointerup", end);
      ghost.addEventListener("pointercancel", end);
      ghost.addEventListener("keydown", event => {
        const step = event.shiftKey ? 50 : 10;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        moveTo(state.x + delta[0], state.y + delta[1]);
      });
    }
    requestAnimationFrame(paintPreview);
  }

  function sent(recipientHandle) {
    const done = button("Done", "sticker-btn sticker-primary");
    done.addEventListener("click", finish);
    const another = button("Send another");
    another.addEventListener("click", () => { state.x = STICKER_START.x; state.y = STICKER_START.y; state.clip = ""; pick(); });
    const actions = make("div", "sticker-actions");
    actions.append(another, done);
    show("Sticker sent", make("p", "sticker-sent", `@${recipientHandle} will review it. It appears on their Wall once they approve it.`), actions);
    onSent();
  }

  start();
  return { close: finish, get element() { return dialog; } };
}

// The catalog as a grid of the 14 stickers (stills), for the editor's Stickers section; choosing one calls onChoose(key).
export function stickerCatalogGrid({ doc = document, selected = null, onChoose = () => {} } = {}) {
  const grid = doc.createElement("div");
  grid.className = "sticker-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-label", "Stickers");
  for (const entry of STICKER_CATALOG) {
    const cell = doc.createElement("button");
    cell.type = "button";
    cell.className = "sticker-cell";
    cell.setAttribute("role", "radio");
    cell.setAttribute("aria-checked", String(entry.key === selected));
    cell.setAttribute("aria-label", entry.name);
    cell.dataset.sticker = entry.key;
    const img = doc.createElement("img");
    img.src = stickerStillUrl(entry.key);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    const name = doc.createElement("span");
    name.className = "sticker-cell-name";
    name.textContent = entry.name;
    cell.append(img, name);
    cell.addEventListener("click", () => { for (const other of grid.children) other.setAttribute("aria-checked", String(other === cell)); onChoose(entry.key); });
    grid.append(cell);
  }
  return grid;
}
