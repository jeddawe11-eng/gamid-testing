// Friends Stickers V1 (2026-10-24) in the owner's Wall editor:
//   - the stickers on MY Wall: the waiting requests (approve / reject, with the sender's identity and clip link shown first) and the approved stickers (on the
//     canvas, movable by dragging - mouse or touch - and removable); a pending-request count on the Templates & Stickers tool and the Friends Stage panel;
//   - Templates & Stickers -> Stickers: the 14-sticker catalog and the send flow (wall-kit/sticker-composer.js), and the stickers I sent with their outcome.
// The data is never part of the Wall Document: it comes from the sticker functions (get_my_wall_stickers ...) and every change is decided on the server. A new
// request arriving while the editor is open shows at once (editor.js re-reads on the shared notification centre's sticker notifications), with no polling.
import { clampToStickerArea, stickerByKey } from "../wall/stickers.js";
import { STICKER_CLIP_LABELS } from "../wall-kit/embed/providers/clip-links.js";
import { setActiveStickerCounts } from "../wall/stage-types.js";
import { stickerView, stickerStillUrl } from "../wall-kit/sticker-paint.js";
import { openStickerComposer, stickerCatalogGrid, stickerMessage } from "../wall-kit/sticker-composer.js";

const STATUS_WORDS = { pending: "Waiting for approval", approved: "Approved", rejected: "Not approved", removed: "Removed" };

export function createOwnerStickers({ api, session, notify, requestRender, host, getScale, doc = document }) {
  const $ = id => doc.getElementById(id);
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, className = "ed-btn") => { const node = make("button", className, text); node.type = "button"; return node; };
  let rows = [], sent = [], loaded = false, loading = null, chosen = null, busy = new Set();
  const avatars = new Map();

  const avatarFor = async path => {
    if (!path) return null;
    if (!avatars.has(path)) avatars.set(path, typeof api.loadPublicAvatar === "function" ? api.loadPublicAvatar(path).catch(() => null) : Promise.resolve(null));
    return avatars.get(path);
  };
  const approved = () => rows.filter(row => row.status === "approved");
  const pending = () => rows.filter(row => row.status === "pending");

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const next = await api.getMyWallStickers();
        await Promise.all(next.map(async row => { row.avatarUrl = row.sender_is_public ? await avatarFor(row.sender_avatar_media_reference) : null; }));
        rows = next;
        loaded = true;
      } catch { /* the editor keeps working without stickers; the next load tries again */ }
      finally { loading = null; }
      publishCounts();
      render();
      requestRender();
    })();
    return loading;
  }
  async function loadSent() {
    try { sent = await api.getMySentStickers(); } catch { sent = []; }
    renderSent();
  }
  // DEC-0011 E: the document operations ask how many active stickers a Friends Stage has (deleting or converting it is refused while it has any)
  function publishCounts() {
    const counts = new Map();
    for (const row of approved()) counts.set(row.stage_id, (counts.get(row.stage_id) ?? 0) + 1);
    setActiveStickerCounts(counts);
  }

  // ---- canvas: the approved stickers of a stage, movable by their owner ----
  const viewsFor = stageId => approved().filter(row => row.stage_id === stageId).map(row => stickerView(row, row.avatarUrl)).filter(Boolean);
  let drag = null;
  host.addEventListener("pointerdown", event => {
    const node = event.target.closest?.(".wall-sticker.is-movable");
    if (!node || !host.contains(node)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // the sticker takes this gesture: no element selection, marquee or canvas pan starts underneath
    event.stopPropagation();
    event.preventDefault();
    const row = rows.find(r => String(r.placement_id) === node.dataset.sticker);
    if (!row) return;
    const scale = getScale();
    const stage = node.closest(".wall-stage")?.getBoundingClientRect();
    if (!stage) return;
    drag = { id: event.pointerId, node, row, scale, stage, dx: event.clientX - stage.left - row.pos_x * scale, dy: event.clientY - stage.top - row.pos_y * scale, x: row.pos_x, y: row.pos_y };
    node.classList.add("is-dragging");
    try { node.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
  }, true);
  host.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.stopPropagation();
    const next = clampToStickerArea((event.clientX - drag.stage.left - drag.dx) / drag.scale, (event.clientY - drag.stage.top - drag.dy) / drag.scale);
    drag.x = next.x; drag.y = next.y;
    const box = drag.node.offsetWidth;
    drag.node.style.setProperty("left", `${next.x * drag.scale - box / 2}px`);
    drag.node.style.setProperty("top", `${next.y * drag.scale - box / 2}px`);
  }, true);
  const endDrag = async event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.stopPropagation();
    const { row, x, y, node } = drag;
    drag = null;
    node.classList.remove("is-dragging");
    if (x === row.pos_x && y === row.pos_y) return;
    // one saved move = one request (and one notice to the sender), never one per pointer movement
    const before = { x: row.pos_x, y: row.pos_y };
    row.pos_x = x; row.pos_y = y;
    try { await api.moveWallSticker(row.placement_id, x, y); notify("Sticker moved."); }
    catch (error) { row.pos_x = before.x; row.pos_y = before.y; notify(stickerMessage(error)); }
    requestRender();
  };
  host.addEventListener("pointerup", endDrag, true);
  host.addEventListener("pointercancel", event => { if (drag && event.pointerId === drag.id) { drag.node.classList.remove("is-dragging"); drag = null; requestRender(); } }, true);

  // ---- panels ----
  const fromLine = row => {
    const from = make("span", "sticker-request-from");
    const face = make("span", "sticker-player-avatar", (row.sender_display_name || row.sender_handle || "G").charAt(0).toUpperCase());
    if (row.avatarUrl) { const img = make("img"); img.src = row.avatarUrl; img.alt = ""; face.replaceChildren(img); }
    const name = make("span", "", row.sender_handle ? `@${row.sender_handle}` : "A GamID player");
    from.append(face, name);
    if (row.sender_display_name) from.append(make("span", "sticker-request-meta", row.sender_display_name));
    return from;
  };
  const stageNumber = stageId => session.doc.stages.findIndex(stage => stage.id === stageId) + 1;
  function card(row, actions) {
    const item = make("article", "sticker-request");
    item.dataset.placement = row.placement_id;
    const art = make("img", "sticker-request-art");
    art.src = stickerStillUrl(row.sticker_key);
    art.alt = `${stickerByKey(row.sticker_key)?.name ?? "Sticker"} sticker`;
    const text = make("div", "sticker-request-text");
    text.append(make("strong", "", stickerByKey(row.sticker_key)?.name ?? "Sticker"), fromLine(row));
    const where = stageNumber(row.stage_id);
    text.append(make("span", "sticker-request-meta", row.stage_in_draft === false || where < 1 ? "Its Friends Stage is no longer on your Wall." : `Stage ${where}${row.status === "approved" ? ` · ${row.size_percent ?? 100}% size` : ""}`));
    if (row.clip_url) {
      const clip = make("a", "sticker-request-clip", `${STICKER_CLIP_LABELS[row.clip_provider] ?? "Clip"}: ${row.clip_url}`);
      clip.href = row.clip_url;
      clip.target = "_blank";
      clip.rel = "noopener noreferrer nofollow";
      text.append(clip);
    } else text.append(make("span", "sticker-request-meta", "No clip link"));
    const bar = make("div", "sticker-request-actions");
    bar.append(...actions);
    item.append(art, text, bar);
    return item;
  }
  async function act(row, work, done) {
    if (busy.has(row.placement_id)) return;
    busy.add(row.placement_id);
    render();
    try { await work(); notify(done); }
    catch (error) { notify(stickerMessage(error)); }
    finally { busy.delete(row.placement_id); }
    await load();
  }
  const requestActions = row => {
    const yes = button("Approve", "ed-btn ed-primary");
    const no = button("Reject", "ed-btn ed-danger");
    no.disabled = busy.has(row.placement_id);
    yes.disabled = busy.has(row.placement_id) || row.stage_in_draft === false;   // its Friends Stage is gone: it can only be rejected
    yes.setAttribute("aria-label", `Approve ${stickerByKey(row.sticker_key)?.name ?? "sticker"} from ${row.sender_handle ? `@${row.sender_handle}` : "a GamID player"}`);
    no.setAttribute("aria-label", `Reject ${stickerByKey(row.sticker_key)?.name ?? "sticker"} from ${row.sender_handle ? `@${row.sender_handle}` : "a GamID player"}`);
    yes.addEventListener("click", () => act(row, () => api.reviewWallSticker(row.placement_id, true), "Sticker approved. It's on your Wall now."));
    no.addEventListener("click", () => act(row, () => api.reviewWallSticker(row.placement_id, false), "Sticker rejected."));
    return [yes, no];
  };
  const approvedActions = row => {
    const remove = button("Remove", "ed-btn ed-danger");
    remove.disabled = busy.has(row.placement_id);
    remove.setAttribute("aria-label", `Remove ${stickerByKey(row.sticker_key)?.name ?? "sticker"} from ${row.sender_handle ? `@${row.sender_handle}` : "a GamID player"}`);
    // removal is permanent: asked once, in place (DEC-0008)
    remove.addEventListener("click", () => {
      const bar = remove.parentElement;
      const question = make("span", "sticker-request-meta", "Remove this sticker for good?");
      const confirm = button("Remove", "ed-btn ed-danger");
      const cancel = button("Cancel");
      confirm.addEventListener("click", () => act(row, () => api.removeWallSticker(row.placement_id), "Sticker removed."));
      cancel.addEventListener("click", () => render());
      bar.replaceChildren(question, confirm, cancel);
      cancel.focus();
    });
    return [remove];
  };

  function badge(node, count) { if (!node) return; node.hidden = count === 0; node.textContent = count ? String(count) : ""; node.setAttribute("aria-label", `${count} sticker request${count === 1 ? "" : "s"} waiting`); }
  function render() {
    const waiting = pending();
    for (const id of ["railStickerBadge", "tsRequestBadge", "stickerRequestCount", "friendsRequestBadge"]) badge($(id), waiting.length);
    const list = $("stickerRequestList");
    if (list) list.replaceChildren(...(waiting.length ? waiting.map(row => card(row, requestActions(row))) : [make("p", "ed-hint", loaded ? "No sticker requests right now. Friends can send you stickers once your Wall has a Friends Stage." : "Loading…")]));
    // the Friends Stage panel: this stage's requests and stickers
    const stageId = session.state.stageId;
    const here = waiting.filter(row => row.stage_id === stageId);
    const shown = approved().filter(row => row.stage_id === stageId).sort((a, b) => Number(b.approval_seq) - Number(a.approval_seq));
    const requests = $("friendsRequests"), onStage = $("friendsApproved");
    if (requests) requests.replaceChildren(...(here.length ? here.map(row => card(row, requestActions(row))) : [make("p", "ed-hint", "No requests for this stage.")]));
    if (onStage) onStage.replaceChildren(...(shown.length ? shown.map(row => card(row, approvedActions(row))) : [make("p", "ed-hint", "No stickers on this stage yet.")]));
  }
  function renderSent() {
    const list = $("stickerSentList");
    if (!list) return;
    list.replaceChildren(...(sent.length ? sent.map(row => {
      const item = make("article", "sticker-request");
      const art = make("img", "sticker-request-art");
      art.src = stickerStillUrl(row.sticker_key);
      art.alt = `${stickerByKey(row.sticker_key)?.name ?? "Sticker"} sticker`;
      const text = make("div", "sticker-request-text");
      text.append(make("strong", "", stickerByKey(row.sticker_key)?.name ?? "Sticker"), make("span", "sticker-request-meta", `To ${row.recipient_handle ? `@${row.recipient_handle}` : "a GamID player"} · ${STATUS_WORDS[row.status] ?? row.status}${row.has_clip ? " · with a clip link" : ""}`));
      item.append(art, text);
      return item;
    }) : [make("p", "ed-hint", "You haven't sent any stickers yet.")]));
  }

  // ---- Templates & Stickers: the two sections, the catalog and the send flow ----
  function showSection(name) {
    const stickers = name === "stickers";
    $("tsTabTemplates").setAttribute("aria-selected", String(!stickers));
    $("tsTabStickers").setAttribute("aria-selected", String(stickers));
    $("tsTabTemplates").tabIndex = stickers ? -1 : 0;
    $("tsTabStickers").tabIndex = stickers ? 0 : -1;
    $("tsTemplates").hidden = stickers;
    $("tsStickers").hidden = !stickers;
    if (stickers) { load(); loadSent(); }
  }
  $("tsTabTemplates").addEventListener("click", () => showSection("templates"));
  $("tsTabStickers").addEventListener("click", () => showSection("stickers"));
  $("tsTabTemplates").parentElement.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = $("tsTabStickers").getAttribute("aria-selected") === "true" ? "templates" : "stickers";
    showSection(next);
    $(next === "stickers" ? "tsTabStickers" : "tsTabTemplates").focus();
  });
  $("stickerCatalog").replaceChildren(stickerCatalogGrid({ doc, onChoose: key => { chosen = key; $("stickerSend").disabled = false; } }));
  const compose = (options = {}) => openStickerComposer({ api, doc, ...options, onSent: () => loadSent() });
  $("stickerSend").addEventListener("click", () => { if (chosen) compose({ stickerKey: chosen }); });
  $("friendsSend").addEventListener("click", () => compose({}));

  return {
    load,
    viewsFor,
    showSection,
    get pendingCount() { return pending().length; },
    activeCount: stageId => approved().filter(row => row.stage_id === stageId).length,
    render,
  };
}
