import { createDocument, createElement } from "../../dist/wall/schema.js";
import { createTextPayload } from "../../dist/wall-kit/text.js";
export function initialFixture() {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[1].elements.push(createElement({ id: "untouched", type: "text", x: 70, y: 100, width: 800, height: 300,
    payload: createTextPayload({ text: "UNRELATED STAGE\nKeep this composition.", fontSize: 55 }) }));
  return doc;
}
export const sampleIdentity = {
  profile: { displayName: "NOVA / SAMPLE", handle: "template_fixture", initial: "N" },
  roles: [{ key: "competitor", label: "Competitor", primary: true }, { key: "creator", label: "Creator" }],
  visibility: { profile: true, roles: true },
};
export function fixturePersistence(storage) {
  const key = "gamid.templates.local-fixture.v1";
  const load = () => JSON.parse(storage.getItem(key) || "null") || { document: initialFixture(), revision: 0 };
  return {
    ensureDraft: async () => load(), loadDraft: async () => load(),
    saveDraft: async (document, revision) => {
      const current = load();
      if (current.revision !== revision) throw Object.assign(new Error("Fixture changed"), { code: "WALL_REVISION_CONFLICT", currentRevision: current.revision });
      const record = { document, revision: revision + 1 };
      storage.setItem(key, JSON.stringify(record)); return record;
    },
  };
}
