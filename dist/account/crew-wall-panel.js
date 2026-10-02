// The Crew Wall panel on the owner's Account page (inside their Crew card). Deliberately small - it is NOT the personal Wall editor: the owner only chooses which
// current members appear, orders them, moves them between the Crew's stages (up to the server's allowance, 2 today), removes a card from the Wall (the person stays
// in the Crew), previews and publishes. Every change is saved through save_crew_wall with the Wall's revision; the server re-checks everything (owner only, ACTIVE
// members of this Crew only, stage allowance), so this file only builds the next layout.
export const crewWallHrefFor = crewId => `../crew/?c=${encodeURIComponent(crewId)}`;

// the server's get_my_crew_wall -> a clean editing model
export function wallState(view) {
  if (!view || typeof view !== "object") return null;
  const stageCount = Math.max(1, Number(view.stage_count) || 1);
  const cards = (Array.isArray(view.cards) ? view.cards : [])
    .filter(card => typeof card?.handle === "string" && Number.isInteger(card.stage) && Number.isInteger(card.position))
    .map(card => ({ handle: card.handle, stage: card.stage, position: card.position }))
    .sort((a, b) => a.stage - b.stage || a.position - b.position);
  return { stageCount, allowed: Math.max(1, Number(view.stages_allowed) || 1), published: view.published === true, revision: Number(view.revision) || 1, cards };
}

// positions 0..n-1 within each stage, in the current order (what the server receives)
export const normalize = (cards, stageCount) => Array.from({ length: stageCount }, (_, i) => cards.filter(card => card.stage === i + 1).map((card, position) => ({ handle: card.handle, stage: i + 1, position }))).flat();
const inStage = (cards, stage) => cards.filter(card => card.stage === stage);

export const ops = {
  place: (wall, handle, stage) => normalize([...wall.cards.filter(card => card.handle !== handle), { handle, stage, position: 999 }], wall.stageCount),
  remove: (wall, handle) => normalize(wall.cards.filter(card => card.handle !== handle), wall.stageCount),
  move: (wall, handle, delta) => {
    const card = wall.cards.find(item => item.handle === handle);
    if (!card) return wall.cards;
    const list = inStage(wall.cards, card.stage);
    const at = list.findIndex(item => item.handle === handle), to = at + delta;
    if (to < 0 || to >= list.length) return wall.cards;
    [list[at], list[to]] = [list[to], list[at]];
    return normalize([...wall.cards.filter(item => item.stage !== card.stage), ...list], wall.stageCount);
  },
  toStage: (wall, handle, stage) => ops.place(wall, handle, stage),
  // dropping the last stage keeps its cards: they move to the end of the previous stage
  removeLastStage: wall => normalize(wall.cards.map(card => (card.stage === wall.stageCount ? { ...card, stage: wall.stageCount - 1, position: 999 + card.position } : card)), wall.stageCount - 1),
};

export function renderCrewWallBox({ crew, wall, members, element, button, editing, onToggleEdit, save, publish }) {
  const box = element("div", "crew-wall-box");
  const head = element("div", "crew-wall-head");
  head.append(element("p", "eyebrow", "CREW WALL"), element("span", `crew-role${wall?.published ? " is-owner" : ""}`, wall?.published ? "PUBLISHED" : "NOT PUBLISHED"));
  box.append(head);
  if (!wall) { box.append(element("p", "duo-note", "The Crew Wall couldn't be loaded. Refresh to try again.")); return box; }
  box.append(element("p", "duo-note crew-wall-usage", `Stages ${wall.stageCount} / ${wall.allowed} used · ${wall.cards.length} member card${wall.cards.length === 1 ? "" : "s"}`));
  const links = element("div", "duo-actions");
  const open = element("a", "secondary duo-button crew-wall-open", wall.published ? "Open Crew Wall" : "Preview Crew Wall");
  open.href = crewWallHrefFor(crew.id); open.target = "_blank"; open.rel = "noopener";
  links.append(open, button(editing ? "Done" : "Edit Crew Wall", "secondary duo-button", onToggleEdit),
    button(wall.published ? "Unpublish" : "Publish", wall.published ? "text-button duo-button" : "primary duo-button", () => publish(!wall.published)));
  box.append(links);
  if (!editing) return box;

  const active = members.filter(row => row.status === "ACTIVE");
  const placed = new Set(wall.cards.map(card => card.handle));
  const nameOf = handle => active.find(row => row.gamid_handle === handle)?.display_name || `@${handle}`;
  for (let stage = 1; stage <= wall.stageCount; stage++) {
    const list = inStage(wall.cards, stage);
    const section = element("div", "crew-wall-stage");
    section.append(element("p", "eyebrow", `STAGE ${stage}`));
    if (!list.length) section.append(element("p", "connections-empty", "No member cards on this stage yet."));
    list.forEach((card, index) => {
      const row = element("div", "crew-wall-card");
      row.append(element("span", "crew-wall-card-name", `${index + 1}. ${nameOf(card.handle)} · @${card.handle}`));
      const actions = element("div", "crew-wall-card-actions");
      actions.append(button("↑", "text-button duo-button crew-wall-mini", () => save(ops.move(wall, card.handle, -1)), index === 0));
      actions.append(button("↓", "text-button duo-button crew-wall-mini", () => save(ops.move(wall, card.handle, 1)), index === list.length - 1));
      if (wall.stageCount > 1) actions.append(button(`→ Stage ${stage === 1 ? 2 : 1}`, "text-button duo-button crew-wall-mini", () => save(ops.toStage(wall, card.handle, stage === 1 ? 2 : 1))));
      actions.append(button("Remove from Wall", "text-button danger duo-button crew-wall-mini", () => save(ops.remove(wall, card.handle))));
      row.append(actions);
      section.append(row);
    });
    box.append(section);
  }
  const stages = element("div", "duo-actions");
  if (wall.stageCount < wall.allowed) stages.append(button(`Add Stage ${wall.stageCount + 1}`, "secondary duo-button", () => save(wall.cards, wall.stageCount + 1)));
  else box.append(element("p", "duo-note crew-wall-limit", `Your Crew Wall uses all ${wall.allowed} stages available.`));
  if (wall.stageCount > 1) stages.append(button(`Remove Stage ${wall.stageCount}`, "text-button duo-button", () => save(ops.removeLastStage(wall), wall.stageCount - 1)));
  if (stages.children?.length ?? true) box.append(stages);

  const off = active.filter(row => !placed.has(row.gamid_handle));
  const pool = element("div", "crew-wall-stage");
  pool.append(element("p", "eyebrow", "NOT ON THE WALL"));
  if (!off.length) pool.append(element("p", "connections-empty", "Every member is on the Wall."));
  for (const row of off) {
    const line = element("div", "crew-wall-card");
    line.append(element("span", "crew-wall-card-name", `${row.display_name || `@${row.gamid_handle}`} · @${row.gamid_handle}`));
    const actions = element("div", "crew-wall-card-actions");
    for (let stage = 1; stage <= wall.stageCount; stage++) actions.append(button(`Add to Stage ${stage}`, "secondary duo-button crew-wall-mini", () => save(ops.place(wall, row.gamid_handle, stage))));
    line.append(actions);
    pool.append(line);
  }
  box.append(pool);
  return box;
}
