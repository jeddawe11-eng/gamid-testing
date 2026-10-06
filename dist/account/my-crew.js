// MY CREW on the owner's GamID page (20261003100000_my_crew.sql): "the group of people I regularly like to play THIS game with". One Crew per game; up to the server's
// member limit (15 in V1); one Owner; members join only by accepting an invitation. Not an esports team, not a Play Together session, not My Duo.
// The server decides everything; this panel renders what get_my_crews / get_crew_members return and calls the owner RPCs. Feedback on the person's own action uses the
// ~3 s GamID rule (transient-message.js); what OTHER people did arrives as GamID Notifications (the bell); the Crews / invitations shown here are persistent state.
import { isHandle, normalizeHandle } from "../public/identity-link.js";
import { createTransientMessage } from "./transient-message.js";
import { wallState, renderCrewWallBox, crewWallHrefFor } from "./crew-wall-panel.js";

export const CREW_ERRORS = Object.freeze({
  CREW_ALREADY_IN_GAME: "You already belong to a Crew for this game. Leave it (or delete yours) first.",
  CREW_FULL: "This Crew is full.",
  CREW_OWNER_ONLY: "Only the Crew's owner can do that.",
  CREW_SELF: "You're already the owner of this Crew.",
  CREW_ALREADY_INVITED_OR_MEMBER: "They're already invited or a member.",
  CREW_INVITE_NOT_FOUND: "That invitation is no longer waiting. The list has been refreshed.",
  CREW_MEMBER_NOT_FOUND: "They're no longer a member. The list has been refreshed.",
  CREW_OWNER_CANNOT_LEAVE: "As the owner you can't leave your Crew. Delete it instead.",
  CREW_OWNER_CANNOT_BE_REMOVED: "The owner can't be removed.",
  CREW_NOT_FOUND: "That Crew no longer exists. The list has been refreshed.",
  CREW_MEMBERS_ONLY: "Only members can see this Crew's members.",
  GAME_NOT_FOUND: "Pick a game from the list.",
  INVALID_CREW_NAME: "Crew names are 2-40 characters.",
  GAMID_NOT_FOUND: "That GamID doesn't exist.",
  SEARCH_TOO_SHORT: "Type at least 3 letters or numbers.",
  AUTH_REQUIRED: "Please sign in again, then try again.",
  IDENTITY_NOT_FOUND: "We couldn't find your GamID. Please refresh the page.",
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  CREW_WALL_STAGE_LIMIT: "Your Crew Wall already uses every stage available.",
  CREW_WALL_NOT_A_MEMBER: "Only current members of this Crew can be on its Wall. The list has been refreshed.",
  CREW_WALL_REVISION_CONFLICT: "The Crew Wall changed in another tab. It has been refreshed - try again.",
  INVALID_CREW_WALL_CARDS: "That Crew Wall change isn't valid.",
});
export const crewErrorText = error => CREW_ERRORS[error?.message] || CREW_ERRORS[error?.code] || "Something went wrong. Please try again.";
export const CREW_NAME = Object.freeze({ min: 2, max: 40 });
export const validCrewName = name => { const clean = String(name ?? "").trim(); return clean.length >= CREW_NAME.min && clean.length <= CREW_NAME.max && !/[<>\u0000-\u001f]/.test(clean); };

// get_my_crews rows -> { crews: [ACTIVE, grouped-ready], invitations: [INVITED] } (anything malformed is dropped)
export function crewState(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(row => typeof row?.crew_id === "string" && typeof row?.crew_name === "string" && typeof row?.game_key === "string");
  const crew = row => ({
    id: row.crew_id, gameKey: row.game_key, gameName: row.game_name || row.game_key, name: row.crew_name, role: row.my_role === "OWNER" ? "OWNER" : "MEMBER",
    ownerHandle: isHandle(normalizeHandle(row.owner_handle)) ? normalizeHandle(row.owner_handle) : "", ownerName: row.owner_display_name || "",
    members: Number(row.member_count) || 0, pending: Number(row.pending_count) || 0, max: Number(row.max_members) || 15,
  });
  return {
    crews: list.filter(row => row.my_status === "ACTIVE").map(crew).sort((a, b) => a.gameName.localeCompare(b.gameName)),
    invitations: list.filter(row => row.my_status === "INVITED").map(crew),
  };
}

export const deleteWarning = crew => `Delete ${crew.name}? Every member leaves and pending invitations are cancelled. This can't be undone - you can create a new Crew for ${crew.gameName} afterwards.`;
export const leaveWarning = crew => `Leave ${crew.name}? You can only rejoin if the owner invites you again.`;
export const removeWarning = (crew, handle) => `Remove @${handle} from ${crew.name}?`;

export function createCrewPanel({ api, root, message, element, timers = globalThis, gamidUrl = handle => `../@${handle}` }) {
  let state = null;               // null = could not be read
  const members = new Map();      // crew id -> member rows (ACTIVE Crews only)
  let busy = false;
  let confirm = null;             // { kind: "delete" | "leave" | "remove", crewId, handle? }
  const invite = new Map();       // crew id -> { query, results }
  const create = { open: false, query: "", results: null, game: null, name: "" };
  const avatars = new Map();
  const walls = new Map();        // crew id -> Crew Wall editing model (owner Crews only)
  const editingWall = new Set();  // crew ids whose Wall editor is open
  const feedback = createTransientMessage(message, { timers });
  const say = (text, tone = "error") => feedback.show(text, { tone });

  const button = (text, className, onClick, disabled = false) => { const node = element("button", className, text); node.type = "button"; node.disabled = disabled || busy; node.addEventListener("click", onClick); return node; };
  function avatarNode(person) {
    const box = element("div", "duo-avatar crew-avatar");
    box.textContent = (person.display_name || person.gamid_handle || "G").replace(/^@/, "").charAt(0).toUpperCase() || "G";
    const path = person.avatar_media_reference;
    const url = path ? avatars.get(path) : null;
    if (url) { const img = element("img"); img.alt = ""; img.src = url; box.replaceChildren(img); }
    else if (path && !avatars.has(path) && typeof api.loadPublicAvatar === "function") {
      avatars.set(path, null);
      Promise.resolve(api.loadPublicAvatar(path)).then(value => { if (value) { avatars.set(path, value); render(); } }, () => {});
    }
    return box;
  }
  function personRow(person, extra = null) {
    const row = element("div", "duo-person crew-person");
    const names = element("div", "duo-names");
    names.append(element("strong", "", person.display_name || `@${person.gamid_handle}`));
    if (person.is_published) { const link = element("a", "duo-handle", `@${person.gamid_handle}`); link.href = gamidUrl(person.gamid_handle); link.target = "_blank"; link.rel = "noopener"; names.append(link); }
    else names.append(element("span", "duo-handle", `@${person.gamid_handle}`));
    row.append(avatarNode(person), names);
    if (extra) row.append(extra);
    return row;
  }
  function warning(text, label, onConfirm) {
    const box = element("div", "duo-warning");
    box.setAttribute("role", "alert");
    box.append(element("p", "", text));
    const actions = element("div", "duo-actions");
    actions.append(button(label, "primary duo-button danger-fill", onConfirm), button("Cancel", "text-button duo-button", () => { confirm = null; render(); }));
    box.append(actions);
    return box;
  }

  async function act(run, success) {
    if (busy) return;
    busy = true; render(); feedback.show("Working…", { tone: "info", progress: true });
    let outcome;
    try { await run(); outcome = [success, "success"]; confirm = null; }
    catch (error) { outcome = [crewErrorText(error), "error"]; if (/NOT_FOUND/.test(error?.message ?? "")) confirm = null; }
    await load();
    busy = false;
    render();
    say(...outcome);
  }

  async function searchInvite(crew) {
    const entry = invite.get(crew.id) ?? { query: "", results: null };
    const value = entry.query.trim();
    if (value.replace(/[^a-z0-9]/gi, "").length < 3) { say(CREW_ERRORS.SEARCH_TOO_SHORT, "warning"); return; }
    busy = true; render();
    try { entry.results = (await api.searchDuoCandidates(value)).filter(row => isHandle(normalizeHandle(row?.gamid_handle))); feedback.hide(); }
    catch (error) { entry.results = null; say(crewErrorText(error)); }
    invite.set(crew.id, entry);
    busy = false; render();
  }
  async function searchGames() {
    const value = create.query.trim();
    if (value.replace(/[^a-z0-9]/gi, "").length < 3) { say(CREW_ERRORS.SEARCH_TOO_SHORT, "warning"); return; }
    busy = true; render();
    try { create.results = (await api.searchGameCatalog(value, 8)).filter(row => typeof row?.game_key === "string"); feedback.hide(); }
    catch (error) { create.results = null; say(crewErrorText(error)); }
    busy = false; render();
  }

  function crewCard(crew) {
    const card = element("article", `duo-card crew-card${crew.role === "OWNER" ? " is-owner" : ""}`);
    card.dataset.crew = crew.id;
    const head = element("div", "crew-card-head");
    const titles = element("div", "crew-titles");
    titles.append(element("p", "eyebrow crew-game", crew.gameName.toUpperCase()), element("strong", "crew-name", crew.name));
    head.append(titles, element("span", `crew-role${crew.role === "OWNER" ? " is-owner" : ""}`, crew.role === "OWNER" ? "OWNER" : "MEMBER"));
    card.append(head);
    card.append(element("p", "duo-note crew-count", `${crew.members} / ${crew.max} members${crew.role === "OWNER" && crew.pending ? ` · ${crew.pending} invitation${crew.pending === 1 ? "" : "s"} pending` : ""}${crew.role === "MEMBER" && crew.ownerHandle ? ` · Owner @${crew.ownerHandle}` : ""}`));

    const list = element("div", "crew-members");
    const rows = members.get(crew.id) ?? [];
    for (const person of rows.filter(row => row.status === "ACTIVE")) {
      const isOwnerRow = person.role === "OWNER";
      let extra = isOwnerRow ? element("span", "duo-tag", "OWNER") : null;
      if (!isOwnerRow && crew.role === "OWNER") extra = button("Remove", "text-button danger duo-button", () => { confirm = { kind: "remove", crewId: crew.id, handle: person.gamid_handle }; render(); });
      list.append(personRow(person, extra));
      if (confirm?.kind === "remove" && confirm.crewId === crew.id && confirm.handle === person.gamid_handle) {
        list.append(warning(removeWarning(crew, person.gamid_handle), "Remove", () => act(() => api.removeCrewMember(crew.id, person.gamid_handle), `Removed @${person.gamid_handle} from ${crew.name}.`)));
      }
    }
    card.append(list);

    if (crew.role === "OWNER") {
      const wall = walls.get(crew.id) ?? null;
      card.append(renderCrewWallBox({
        crew, wall, members: rows, element, button, editing: editingWall.has(crew.id),
        onToggleEdit: () => { if (editingWall.has(crew.id)) editingWall.delete(crew.id); else editingWall.add(crew.id); render(); },
        save: (cards, stageCount = wall.stageCount) => act(() => api.saveCrewWall(crew.id, stageCount, cards, wall.revision), "Crew Wall saved."),
        publish: published => act(() => api.setCrewWallPublished(crew.id, published), published ? `${crew.name}'s Crew Wall is published.` : `${crew.name}'s Crew Wall is no longer public.`),
      }));
      const pending = rows.filter(row => row.status === "INVITED");
      if (pending.length) {
        const box = element("div", "crew-pending");
        box.append(element("p", "eyebrow", "INVITATIONS SENT"));
        for (const person of pending) box.append(personRow(person, button("Cancel invite", "text-button duo-button", () => act(() => api.cancelCrewInvite(crew.id, person.gamid_handle), `Cancelled the invitation to @${person.gamid_handle}.`))));
        card.append(box);
      }
      const entry = invite.get(crew.id) ?? { query: "", results: null };
      const full = crew.members + crew.pending >= crew.max;
      const form = element("form", "duo-search crew-invite");
      form.setAttribute("role", "search");
      const label = element("label", "duo-search-label");
      label.append(element("span", "", full ? `This Crew is full (${crew.max}).` : "Invite a GamID"));
      const input = element("input");
      input.type = "search"; input.maxLength = 40; input.placeholder = "@handle or name"; input.autocomplete = "off"; input.value = entry.query; input.disabled = full;
      input.addEventListener("input", () => { invite.set(crew.id, { ...(invite.get(crew.id) ?? { results: null }), query: input.value }); });
      label.append(input);
      const submit = element("button", "secondary duo-button", "Search");
      submit.type = "submit"; submit.disabled = busy || full;
      form.append(label, submit);
      form.addEventListener("submit", event => { event?.preventDefault?.(); searchInvite(crew); });
      card.append(form);
      if (entry.results && !full) {
        const results = element("div", "duo-results");
        if (!entry.results.length) results.append(element("p", "connections-empty", "No GamID found."));
        const already = new Set(rows.map(row => row.gamid_handle));
        for (const person of entry.results) {
          const handle = normalizeHandle(person.gamid_handle);
          results.append(personRow({ ...person, gamid_handle: handle }, already.has(handle) ? element("span", "duo-tag", "IN CREW / INVITED")
            : button("Invite", "secondary duo-button", () => act(async () => { await api.inviteToCrew(crew.id, handle); invite.delete(crew.id); }, `Invited @${handle} to ${crew.name}.`))));
        }
        card.append(results);
      }
      if (confirm?.kind === "delete" && confirm.crewId === crew.id) card.append(warning(deleteWarning(crew), "Delete Crew", () => act(() => api.deleteCrew(crew.id), `${crew.name} was deleted.`)));
      else { const actions = element("div", "duo-actions"); actions.append(button("Delete Crew", "text-button danger duo-button", () => { confirm = { kind: "delete", crewId: crew.id }; render(); })); card.append(actions); }
    } else if (confirm?.kind === "leave" && confirm.crewId === crew.id) {
      card.append(warning(leaveWarning(crew), "Leave Crew", () => act(() => api.leaveCrew(crew.id), `You left ${crew.name}.`)));
    } else {
      const actions = element("div", "duo-actions");
      const open = element("a", "secondary duo-button crew-wall-open", "Open Crew Wall");
      open.href = crewWallHrefFor(crew.id);
      actions.append(open, button("Leave Crew", "text-button danger duo-button", () => { confirm = { kind: "leave", crewId: crew.id }; render(); }));
      card.append(actions);
    }
    return card;
  }

  function invitationCard(crew) {
    const card = element("article", "duo-card is-request crew-invitation");
    card.dataset.crew = crew.id;
    card.append(element("p", "eyebrow", `CREW INVITATION · ${crew.gameName.toUpperCase()}`), element("strong", "crew-name", crew.name));
    card.append(element("p", "duo-note", `${crew.ownerHandle ? `@${crew.ownerHandle}` : "The owner"} invited you to join. ${crew.members} / ${crew.max} members.`));
    const holds = state.crews.find(item => item.gameKey === crew.gameKey);
    if (holds) card.append(element("p", "duo-note crew-conflict", `You're already in ${holds.name} for ${crew.gameName} - leave it first to accept.`));
    const actions = element("div", "duo-actions");
    actions.append(
      button("Accept", "primary duo-button", () => act(() => api.respondToCrewInvite(crew.id, true), `You joined ${crew.name}.`), Boolean(holds)),
      button("Decline", "text-button duo-button", () => act(() => api.respondToCrewInvite(crew.id, false), `Declined the invitation to ${crew.name}.`)),
    );
    card.append(actions);
    return card;
  }

  function createCard() {
    const card = element("article", "duo-card crew-create");
    if (!create.open) {
      card.append(element("p", "duo-note", state.crews.length ? "Create a Crew for another game." : "You're not in a Crew yet. Create one for a game you play with the same people."));
      const actions = element("div", "duo-actions");
      actions.append(button("Create a Crew", "secondary duo-button", () => { create.open = true; render(); }));
      card.append(actions);
      return card;
    }
    card.append(element("p", "eyebrow", "CREATE A CREW"));
    if (!create.game) {
      const form = element("form", "duo-search");
      form.setAttribute("role", "search");
      const label = element("label", "duo-search-label");
      label.append(element("span", "", "Game"));
      const input = element("input");
      input.type = "search"; input.maxLength = 80; input.placeholder = "Search the game"; input.autocomplete = "off"; input.value = create.query;
      input.addEventListener("input", () => { create.query = input.value; });
      label.append(input);
      const submit = element("button", "secondary duo-button", "Search");
      submit.type = "submit"; submit.disabled = busy;
      form.append(label, submit);
      form.addEventListener("submit", event => { event?.preventDefault?.(); searchGames(); });
      card.append(form);
      if (create.results) {
        const results = element("div", "duo-results crew-games");
        if (!create.results.length) results.append(element("p", "connections-empty", "No game found."));
        for (const game of create.results) {
          const taken = state.crews.find(crew => crew.gameKey === game.game_key);
          const pick = button(taken ? `${game.display_name} - you're in ${taken.name}` : game.display_name, "secondary duo-button crew-game-pick", () => { create.game = { key: game.game_key, name: game.display_name }; render(); }, Boolean(taken));
          results.append(pick);
        }
        card.append(results);
      }
    } else {
      card.append(element("p", "duo-note", `Game: ${create.game.name}`));
      const label = element("label", "duo-search-label");
      label.append(element("span", "", "Crew name (it can't be changed later)"));
      const input = element("input");
      input.type = "text"; input.maxLength = CREW_NAME.max; input.placeholder = "e.g. Night Raiders"; input.autocomplete = "off"; input.value = create.name;
      input.addEventListener("input", () => { create.name = input.value; });
      label.append(input);
      card.append(label);
      const actions = element("div", "duo-actions");
      actions.append(
        button("Create Crew", "primary duo-button", () => {
          if (!validCrewName(create.name)) { say(CREW_ERRORS.INVALID_CREW_NAME, "warning"); return; }
          const game = create.game, name = create.name.trim();
          act(async () => { await api.createCrew(game.key, name); Object.assign(create, { open: false, query: "", results: null, game: null, name: "" }); }, `${name} was created for ${game.name}.`);
        }),
        button("Change game", "text-button duo-button", () => { create.game = null; render(); }),
      );
      card.append(actions);
    }
    const close = element("div", "duo-actions");
    close.append(button("Cancel", "text-button duo-button", () => { Object.assign(create, { open: false, query: "", results: null, game: null, name: "" }); render(); }));
    card.append(close);
    return card;
  }

  function render() {
    if (!state) { root.replaceChildren(element("p", "connections-empty", "My Crew couldn't be loaded right now. Refresh to try again.")); return; }
    const nodes = [];
    for (const crew of state.invitations) nodes.push(invitationCard(crew));
    for (const crew of state.crews) nodes.push(crewCard(crew));
    nodes.push(createCard());
    root.replaceChildren(...nodes);
  }

  async function read() {
    const next = crewState(await api.getMyCrews());
    const lists = await Promise.all(next.crews.map(crew => api.getCrewMembers(crew.id).then(rows => [crew.id, Array.isArray(rows) ? rows : []], () => [crew.id, []])));
    const wallList = typeof api.getMyCrewWall === "function"
      ? await Promise.all(next.crews.filter(crew => crew.role === "OWNER").map(crew => api.getMyCrewWall(crew.id).then(view => [crew.id, wallState(view)], () => [crew.id, null])))
      : [];
    return { next, lists, wallList };
  }
  function apply({ next, lists, wallList = [] }) {
    state = next;
    members.clear();
    for (const [id, rows] of lists) members.set(id, rows);
    walls.clear();
    for (const [id, wall] of wallList) walls.set(id, wall);
    for (const id of [...editingWall]) if (!walls.has(id)) editingWall.delete(id);
    for (const id of [...invite.keys()]) if (!state.crews.some(crew => crew.id === id && crew.role === "OWNER")) invite.delete(id);
    if (confirm && !state.crews.some(crew => crew.id === confirm.crewId)) confirm = null;
    if (confirm?.kind === "remove" && !(members.get(confirm.crewId) ?? []).some(row => row.gamid_handle === confirm.handle && row.status === "ACTIVE")) confirm = null;
  }

  async function load() {
    try { apply(await read()); } catch { state = null; }
    render();
  }
  // a change made ELSEWHERE (crew-realtime.js): re-read and re-render in place, silently (what someone else did is told by the GamID Notifications bell)
  async function refresh() {
    if (busy) return;
    let data;
    try { data = await read(); } catch { return; }
    if (busy) return;
    apply(data);
    render();
  }

  return { load, refresh, render, get state() { return state; } };
}
