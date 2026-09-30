import { TEMPLATES } from "../wall-kit/templates/catalog.js";
import { applyTemplate } from "../wall-kit/templates/apply.js";
import { paintDocument } from "../wall-kit/paint.js";

const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};
export function createTemplatesPanel({ host, session, run, getGamid = () => null }) {
  let pending = null;
  const cards = [];
  for (const template of TEMPLATES) {
    const card = node("article", null, "template-card");
    const preview = node("div", null, "template-preview");
    preview.setAttribute("aria-label", `${template.name}: live recipe preview`);
    const label = node("label", "Apply to ");
    const scope = node("select");
    scope.setAttribute("aria-label", "Template application scope");
    for (const value of template.supportedScopes) {
      const option = node("option", value === "wall" ? "Whole Wall" : "Current Stage");
      option.value = value; scope.append(option);
    }
    scope.value = "stage";
    label.append(scope);
    const summary = node("p", null, "ed-note");
    const review = node("button", "Review replacement", "ed-btn ed-primary");
    review.type = "button";
    const confirmation = node("div", null, "template-confirm");
    confirmation.hidden = true;
    confirmation.setAttribute("role", "group");
    confirmation.setAttribute("aria-label", "Confirm template replacement");
    const warning = node("p");
    const accept = node("button", "Replace composition", "ed-btn ed-danger");
    const cancel = node("button", "Cancel", "ed-btn");
    accept.type = cancel.type = "button";
    confirmation.append(warning, accept, cancel);
    const feedback = node("p"); feedback.setAttribute("role", "status");
    const describe = () => scope.value === "wall"
      ? `Replace all ${session.doc.stages.length} stages and the Wall background with ${template.recipe.document.stages.length} template stage. Existing uploads stay in your assets.`
      : `Replace Stage ${session.doc.stages.findIndex(stage => stage.id === session.state.stageId) + 1}'s elements and background. Other stages and the Wall background stay unchanged.`;
    const clear = () => { pending = null; confirmation.hidden = true; };
    scope.addEventListener("change", () => { clear(); update(); });
    review.addEventListener("click", () => {
      pending = { doc: JSON.stringify(session.doc), stageId: session.state.stageId, scope: scope.value };
      warning.textContent = `${describe()} You can undo this replacement. Save is still a separate action.`;
      confirmation.hidden = false; cancel.focus();
    });
    cancel.addEventListener("click", () => { clear(); review.focus(); });
    accept.addEventListener("click", () => {
      if (!pending || pending.doc !== JSON.stringify(session.doc) || pending.stageId !== session.state.stageId || pending.scope !== scope.value) {
        clear(); feedback.textContent = "The Wall changed. Review the replacement again."; return;
      }
      const result = applyTemplate(session.doc, template, { scope: pending.scope, stageId: pending.stageId, confirmed: true });
      clear();
      if (!result.ok) { feedback.textContent = result.errors.join(", "); return; }
      run(result, { clearSelection: true });
      feedback.textContent = "Template applied. Select any element to edit it. Save when ready.";
    });
    card.append(node("h3", template.name), node("p", `${template.category} · v${template.version}`), preview,
      node("p", template.description), node("p", template.tags.join(" · ")),
      node("p", `${template.recipe.document.stages[0].elements.length} editable elements. Identity uses your GamID data; preview may show empty identity fields.`),
      label, summary, review, confirmation, feedback);
    host.append(card);
    cards.push({ preview, summary, describe, review, accept, confirmation, clear, template });
  }
  let snapshot = null;
  function update() {
    const gamid = getGamid();
    for (const card of cards) {
      card.summary.textContent = card.describe();
      const blocked = !["saved", "unsaved"].includes(session.status);
      card.review.disabled = card.accept.disabled = blocked;
      if (pending && (pending.doc !== JSON.stringify(session.doc) || pending.stageId !== session.state.stageId || blocked)) card.clear();
      if (!card.preview.childNodes.length || gamid !== snapshot) {
        const painted = paintDocument(card.template.recipe.document, 210, undefined, { mode: "edit", gamid });
        if (painted.ok) card.preview.replaceChildren(...painted.stages);
      }
    }
    snapshot = gamid;
  }
  update();
  return { update };
}
