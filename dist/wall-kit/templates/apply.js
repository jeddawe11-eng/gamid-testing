// Pure operation: templates stop existing at this boundary. Only normal Wall data
// is handed to the existing editor session, validator, renderer and persistence.
import { validateDocument } from "../../wall/validate.js";
import { nextId } from "../ops.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = (doc, ...errors) => ({ ok: false, doc, errors });
export function validateTemplate(template) {
  if (!template || template.templateSchemaVersion !== 1) return { valid: false, errors: ["UNSUPPORTED_TEMPLATE_VERSION"] };
  for (const key of ["id", "name", "description", "category", "version"]) {
    if (typeof template[key] !== "string" || !template[key].trim()) return { valid: false, errors: ["INVALID_TEMPLATE_METADATA"] };
  }
  if (!Array.isArray(template.tags) || template.tags.some(tag => typeof tag !== "string") ||
      !Array.isArray(template.supportedScopes) || !template.supportedScopes.length ||
      template.supportedScopes.some(scope => !["wall", "stage"].includes(scope))) return { valid: false, errors: ["INVALID_TEMPLATE_METADATA"] };
  if (template.recipe?.kind !== "wall") return { valid: false, errors: ["UNSUPPORTED_RECIPE_KIND"] };
  const validation = validateDocument(template.recipe.document);
  if (!validation.valid) return validation;
  if (template.preview?.kind !== "recipe" || !template.recipe.document.stages.some(stage => stage.id === template.preview.stageId))
    return { valid: false, errors: ["INVALID_TEMPLATE_PREVIEW"] };
  return validation;
}

export function applyTemplate(doc, template, { scope, stageId, sourceStageId = template?.preview?.stageId, confirmed = false } = {}) {
  const input = validateDocument(doc);
  if (!input.valid) return fail(doc, ...input.errors);
  const check = validateTemplate(template);
  if (!check.valid) return fail(doc, ...check.errors);
  if (!template.supportedScopes.includes(scope)) return fail(doc, "UNSUPPORTED_TEMPLATE_SCOPE");
  const recipe = template.recipe.document;
  if (doc.canvas.width !== recipe.canvas.width || doc.canvas.height !== recipe.canvas.height)
    return fail(doc, "TEMPLATE_CANVAS_MISMATCH"); // Never silently distort content.
  const target = doc.stages.find(stage => stage.id === stageId);
  const source = recipe.stages.find(stage => stage.id === sourceStageId);
  if (scope === "stage" && (!target || !source)) return fail(doc, "TEMPLATE_STAGE_NOT_FOUND");
  if (confirmed !== true) return fail(doc, "TEMPLATE_CONFIRMATION_REQUIRED");

  const taken = new Set();
  const allocate = prefix => { const id = nextId(doc, prefix, taken); taken.add(id); return id; };
  const instantiate = stage => {
    const copy = clone(stage);
    copy.id = allocate("stage");
    const groups = new Map();
    for (const element of copy.elements) {
      element.id = allocate("el");
      if (element.groupId) {
        if (!groups.has(element.groupId)) groups.set(element.groupId, allocate("group"));
        element.groupId = groups.get(element.groupId);
      }
      if (element.payload?.slice?.set) {
        const set = element.payload.slice.set;
        if (!groups.has(set)) groups.set(set, allocate("group"));
        element.payload.slice.set = groups.get(set);
      }
    }
    return copy;
  };
  let result;
  if (scope === "wall") {
    result = clone(recipe);
    result.stages = recipe.stages.map(instantiate);
  } else {
    result = clone(doc);
    const replacement = instantiate(source);
    replacement.id = target.id; // Current stage and unrelated stages retain identity/order.
    // A Wall background is compositional. Bake its effective background into this
    // stage when the recipe has no override; never change the target Wall background.
    if (!replacement.background && recipe.background) replacement.background = clone(recipe.background);
    result.stages[result.stages.findIndex(stage => stage.id === target.id)] = replacement;
  }
  const validation = validateDocument(result);
  return validation.valid ? { ok: true, doc: result, ids: [] } : fail(doc, ...validation.errors);
}
