// MY DUO on the owner's GamID page: a mutual GamID-to-GamID relationship (NOT an Official Team, NOT a Play Together squad, unrelated to "Avoid playing with").
// The server decides everything (supabase/migrations/20261002150000_my_duo.sql): every action names the OTHER GamID by its @handle, the caller is always the signed-in
// owner, replacing a current Duo needs an explicit confirmation, and accepting ends the previous Duo of BOTH people atomically. This panel only shows the state the
// server returns and asks for the confirmations the server requires - it never decides who is whose Duo.
import { isHandle, normalizeHandle, relationshipBadge } from "../public/identity-link.js";
import { createTransientMessage } from "./transient-message.js";

export const DUO_ERRORS = Object.freeze({
  DUO_SELF: "You can't be your own Duo.",
  GAMID_NOT_FOUND: "That GamID doesn't exist.",
  DUO_ALREADY_YOURS: "They're already your Duo.",
  DUO_REQUEST_ALREADY_SENT: "You already sent them a Duo request.",
  DUO_REQUEST_FROM_THEM: "They already sent you a Duo request - accept it below.",
  DUO_REQUEST_PENDING: "You already have a Duo request waiting. Cancel it first to ask someone else.",
  DUO_REPLACE_CONFIRMATION_REQUIRED: "Please confirm that your current Duo will be replaced.",
  DUO_REQUESTS_FULL: "This GamID has too many Duo requests waiting. Try again later.",
  DUO_REQUEST_NOT_FOUND: "That Duo request is no longer waiting. The list has been refreshed.",
  DUO_NOT_SET: "You don't have a Duo right now.",
  SEARCH_TOO_SHORT: "Type at least 3 letters or numbers.",
  AUTH_REQUIRED: "Please sign in again, then try again.",
  IDENTITY_NOT_FOUND: "We couldn't find your GamID. Please refresh the page.",
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
});
export const duoErrorText = error => DUO_ERRORS[error?.message] || DUO_ERRORS[error?.code] || "Something went wrong. Please try again.";

// get_my_duo rows -> { duo, sent, received[] } (anything malformed is dropped)
export function duoState(rows) {
  const person = row => {
    const handle = normalizeHandle(row?.gamid_handle);
    if (!isHandle(handle)) return null;
    const displayName = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim().slice(0, 60) : `@${handle}`;
    return { handle, displayName, avatarPath: typeof row.avatar_media_reference === "string" ? row.avatar_media_reference : null, isPublished: row.is_published === true, showPublic: row.show_public === true };
  };
  const list = Array.isArray(rows) ? rows : [];
  const pick = relation => list.filter(row => row?.relation === relation).map(person).filter(Boolean);
  return { duo: pick("DUO")[0] ?? null, sent: pick("SENT")[0] ?? null, received: pick("RECEIVED") };
}

// The warnings the product requires before a replacement (shown inline; the server refuses without the confirmation anyway).
export const sendWarning = (current, target) => `You already have a Duo: @${current.handle}. @${current.handle} stays your Duo while this request is pending, but will be replaced if @${target} accepts.`;
export const acceptWarning = (current, requester) => `Accepting replaces your current Duo, @${current.handle}. Your Duo with @${current.handle} ends for both of you, and @${requester} becomes your Duo.`;

export function publicHint(duo, ownerPublished) {
  if (!duo.showPublic) return "Private - not shown on your public GamID.";
  if (!duo.isPublished) return `Hidden for now: @${duo.handle}'s GamID isn't published. It appears automatically once they publish.`;
  return ownerPublished ? "Shown on your public GamID." : "Will appear on your public GamID once you publish it.";
}

// mounts into `root`; `message` is the status line; helpers come from the account page (its element() / visibilitySwitch()).
export function createDuoPanel({ api, root, message, element, visibilitySwitch, isOwnerPublished = () => false, gamidUrl = handle => `../@${handle}`, timers = globalThis }) {
  let state = null;          // null = could not be read
  let busy = false;
  let confirm = null;        // { kind: "send" | "accept" | "remove", handle }
  let results = null;        // search results, null = no search yet
  let query = "";
  const avatars = new Map(); // avatar path -> blob URL (public avatars only)
  // transient feedback follows the GamID rule (transient-message.js): shown at once, gone after ~3 s. Pending / incoming requests and the replacement warnings are
  // persistent STATE (cards and warning boxes rendered from the server's answer), never messages, so they stay until the person acts.
  const feedback = createTransientMessage(message, { timers });
  const say = (text, tone = "error") => feedback.show(text, { tone });
  const button = (text, className, onClick, disabled = false) => {
    const node = element("button", className, text);
    node.type = "button";
    node.disabled = disabled || busy;
    node.addEventListener("click", onClick);
    return node;
  };
  function avatarNode(person) {
    const box = element("div", "duo-avatar");
    box.textContent = person.displayName.replace(/^@/, "").charAt(0).toUpperCase() || "G";
    const url = person.avatarPath ? avatars.get(person.avatarPath) : null;
    if (url) { const img = element("img"); img.alt = ""; img.src = url; box.replaceChildren(img); }
    else if (person.avatarPath && !avatars.has(person.avatarPath) && typeof api.loadPublicAvatar === "function") {
      avatars.set(person.avatarPath, null);
      Promise.resolve(api.loadPublicAvatar(person.avatarPath)).then(value => { if (value) { avatars.set(person.avatarPath, value); render(); } }, () => {});
    }
    return box;
  }
  function personRow(person, extra = null) {
    const row = element("div", "duo-person");
    const names = element("div", "duo-names");
    names.append(element("strong", "", person.displayName));
    if (person.isPublished) { const link = element("a", "duo-handle", `@${person.handle}`); link.href = gamidUrl(person.handle); link.target = "_blank"; link.rel = "noopener"; names.append(link); }
    else names.append(element("span", "duo-handle", `@${person.handle} · GamID not published`));
    row.append(avatarNode(person), names);
    if (extra) row.append(extra);
    return row;
  }

  // Every action: the server answers, the visible Duo state is re-read and re-rendered right away (no page refresh), and the outcome shows for ~3 s.
  async function act(run, success) {
    if (busy) return;
    busy = true; render(); feedback.show("Working…", { tone: "info", progress: true });
    let outcome;
    try { await run(); outcome = [success, "success"]; confirm = null; results = null; query = ""; }
    catch (error) { outcome = [duoErrorText(error), "error"]; if (error?.message === "DUO_REQUEST_NOT_FOUND") confirm = null; }
    busy = false;
    await load();
    say(...outcome);
  }
  const send = (handle, replace = false) => act(() => api.sendDuoRequest(handle, replace),
    replace && state?.duo ? `Duo request sent to @${handle}. @${state.duo.handle} stays your Duo unless @${handle} accepts.` : `Duo request sent to @${handle}.`);
  const accept = (handle, replace = false) => act(() => api.respondToDuoRequest(handle, true, replace),
    replace && state?.duo ? `@${handle} is now your Duo. Your Duo with @${state.duo.handle} has ended.` : `@${handle} is now your Duo.`);
  const decline = handle => act(() => api.respondToDuoRequest(handle, false, false),`Declined @${handle}'s Duo request.`);
  const cancel = handle => act(() => api.cancelDuoRequest(handle), `Cancelled your Duo request to @${handle}.`);
  const remove = () => act(() => api.removeMyDuo(), "Your Duo has ended.");
  const setVisible = visible => act(() => api.setMyDuoVisibility(visible), visible ? "My Duo is now shown on your GamID." : "My Duo is hidden from your public GamID.");

  async function search(event) {
    event?.preventDefault?.();
    if (busy) return;
    const value = query.trim();
    if (value.replace(/[^a-z0-9]/gi, "").length < 3) { say(DUO_ERRORS.SEARCH_TOO_SHORT, "warning"); return; }
    busy = true; render();
    try { results = (await api.searchDuoCandidates(value)).map(row => duoState([{ ...row, relation: "DUO" }]).duo).filter(Boolean); feedback.hide(); }
    catch (error) { results = null; say(duoErrorText(error)); }
    busy = false; render();
  }

  function warning(text, confirmLabel, onConfirm) {
    const box = element("div", "duo-warning");
    box.setAttribute("role", "alert");
    box.append(element("p", "", text));
    const actions = element("div", "duo-actions");
    actions.append(button(confirmLabel, "primary duo-button", onConfirm), button("Cancel", "text-button duo-button", () => { confirm = null; render(); }));
    box.append(actions);
    return box;
  }

  function render() {
    if (!state) { root.replaceChildren(element("p", "connections-empty", "My Duo couldn't be loaded right now. Refresh to try again.")); return; }
    const { duo, sent, received } = state;
    const nodes = [];

    // the current Duo
    if (duo) {
      const card = element("article", "duo-card is-duo");
      const head = element("div", "duo-card-head");
      head.append(element("p", "eyebrow", "MY DUO"), relationshipBadge("duo", tag => element(tag), globalThis.document));
      card.append(head, personRow(duo));
      card.append(visibilitySwitch({ on: duo.showPublic, busy, label: "Show My Duo on my GamID", onChange: next => setVisible(next) }));
      card.append(element("p", "section-visibility-hint", `${publicHint(duo, isOwnerPublished())} @${duo.handle} decides separately whether you appear on their GamID.`));
      if (confirm?.kind === "remove") card.append(warning(`End your Duo with @${duo.handle}? It ends for both of you.`, "End Duo", () => remove()));
      else { const actions = element("div", "duo-actions"); actions.append(button("End Duo", "text-button danger duo-button", () => { confirm = { kind: "remove" }; render(); })); card.append(actions); }
      nodes.push(card);
    } else {
      nodes.push(element("p", "connections-empty", "You don't have a Duo yet. Your Duo is the one GamID you regularly play with - you both have to agree."));
    }

    // requests waiting for me
    for (const person of received) {
      const card = element("article", "duo-card is-request");
      card.append(element("p", "eyebrow", "DUO REQUEST"), personRow(person));
      card.append(element("p", "duo-note", `@${person.handle} wants to be your Duo.`));
      if (confirm?.kind === "accept" && confirm.handle === person.handle && duo) card.append(warning(acceptWarning(duo, person.handle), "Accept and replace", () => accept(person.handle, true)));
      else {
        const actions = element("div", "duo-actions");
        actions.append(
          button("Accept", "primary duo-button", () => { if (duo) { confirm = { kind: "accept", handle: person.handle }; render(); } else accept(person.handle); }),
          button("Decline", "text-button duo-button", () => decline(person.handle)),
        );
        card.append(actions);
      }
      nodes.push(card);
    }

    // my request
    if (sent) {
      const card = element("article", "duo-card is-sent");
      card.append(element("p", "eyebrow", "REQUEST SENT"), personRow(sent));
      card.append(element("p", "duo-note", duo ? `Waiting for @${sent.handle} to accept. @${duo.handle} stays your Duo until then; if @${sent.handle} accepts, they replace @${duo.handle}.` : `Waiting for @${sent.handle} to accept.`));
      const actions = element("div", "duo-actions");
      actions.append(button("Cancel request", "text-button duo-button", () => cancel(sent.handle)));
      card.append(actions);
      nodes.push(card);
    } else {
      // find a GamID to ask (published or not)
      const form = element("form", "duo-search");
      form.setAttribute("role", "search");
      const label = element("label", "duo-search-label");
      label.append(element("span", "", duo ? "Ask someone else to be your Duo" : "Find a GamID to ask"));
      const input = element("input");
      input.type = "search"; input.name = "duoQuery"; input.maxLength = 40; input.placeholder = "@handle or name"; input.autocomplete = "off"; input.value = query;
      input.addEventListener("input", () => { query = input.value; });
      label.append(input);
      const submit = element("button", "secondary duo-button", "Search");
      submit.type = "submit";
      submit.disabled = busy;
      form.append(label, submit);
      form.addEventListener("submit", search);
      nodes.push(form);
      if (results) {
        const list = element("div", "duo-results");
        if (!results.length) list.append(element("p", "connections-empty", "No GamID found."));
        for (const person of results) {
          const isCurrent = duo?.handle === person.handle;
          const isAsking = received.some(item => item.handle === person.handle);
          const row = personRow(person, isCurrent ? element("span", "duo-tag", "YOUR DUO") : isAsking ? element("span", "duo-tag", "ASKED YOU") : button("Request", "secondary duo-button", () => {
            if (duo) { confirm = { kind: "send", handle: person.handle }; render(); } else send(person.handle);
          }));
          list.append(row);
          if (confirm?.kind === "send" && confirm.handle === person.handle && duo) list.append(warning(sendWarning(duo, person.handle), "Send request", () => send(person.handle, true)));
        }
        nodes.push(list);
      }
    }
    root.replaceChildren(...nodes);
  }

  async function load() {
    try { state = duoState(await api.getMyDuo()); } catch { state = null; }
    render();
  }

  // A change made ELSEWHERE (duo-realtime.js: the other person acted, or this owner in another tab): re-read the state and re-render it in place. No message - the
  // cards themselves change. While this page's own action is running it is skipped (that action re-reads the state when it finishes). An open confirmation is kept
  // only while what it confirms still exists; a failed re-read keeps the last good state on screen instead of replacing it with an error.
  async function refresh() {
    if (busy) return;
    let next;
    try { next = duoState(await api.getMyDuo()); } catch { return; }
    if (busy) return;
    state = next;
    if (confirm?.kind === "accept" && !state.received.some(person => person.handle === confirm.handle)) confirm = null;
    if (confirm?.kind === "remove" && !state.duo) confirm = null;
    if (confirm?.kind === "send" && state.sent) confirm = null;
    render();
  }

  return { load, refresh, render, get state() { return state; } };
}
