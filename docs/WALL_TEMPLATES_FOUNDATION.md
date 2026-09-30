# Templates foundation — local TESTING exploration

Original exploration base: `0d3620614fa5670ac0248ed7e270dd570a5681f6`.
Integrated base: `2143392` (accepted Keep-inside-OFF ±5,000 limit).
Branch: `feature/wall-templates-foundation`.
No deploy, push, production access, account writes, migrations, or backend changes.

## Template envelope

The catalog exports frozen, JSON-serializable metadata plus a **canonical Wall Document**:

```js
{
  templateSchemaVersion: 1,       // envelope version, separate from Wall schemaVersion
  id: "gamid.official.night-signal", // stable catalog identity
  version: "1.0.0",             // recipe revision
  name: "Night Signal",
  description: "...",
  category: "Gaming identity",
  tags: ["tactical", "neon", "identity"],
  preview: { kind: "recipe", stageId: "stage_1" },
  supportedScopes: ["wall", "stage"],
  recipe: { kind: "wall", document: /* schemaVersion, canvas, stages, background? */ }
}
```

The preview reference points at recipe data, rendered by the existing `paintDocument`; no separate thumbnail rendering engine exists. The current one-stage catalog preview draws the full recipe. A future multi-stage catalog will need a source-stage picker and selected-stage thumbnail handling; the API already accepts `sourceStageId`.

Night Signal has 15 editable elements: 6 rectangles, 7 text elements and 2 live GamID blocks. It uses an ordinary stage gradient, rotation and opacity. Profile and role payloads bind to the current person's GamID at paint time; sample identity exists only in the local lab fixture. There are no copied real-user identities, external assets, invented ranks or flattened designs.

## Application boundary

`applyTemplate(document, template, { scope, stageId, sourceStageId, confirmed })`
returns the same `{ ok, doc, errors? }` contract as the Wall operations. It validates the source Wall and recipe, refuses unsupported scope or mismatched canvas sizes, and requires `confirmed: true`. It clones the recipe and allocates fresh element/stage/group IDs with existing `nextId`, including split-artwork set remapping. Final data must pass the existing `validateDocument`.

Wall application replaces composition and background with the recipe. Stage application preserves the destination stage ID/order, other stages, and Wall background; replaces only the destination stage's composition/background; and copies a recipe Wall background into the replacement stage when no stage override exists. Multi-stage continuous background slice fidelity is not claimed: author self-contained stage backgrounds before offering such recipes for Stage application.

The Templates panel shows metadata, a real recipe preview, scope, affected-stage summary and explicit review/replace/cancel controls. A document edit or stage change invalidates a pending confirmation. Saving/loading/conflict states disable application. Applying passes through the editor's existing `run` and `session.apply`, so it is one undo step, clears stale selection, and leaves Save as a separate action. Template metadata is not attached to the resulting Wall.

## Local lab and evidence

From this checkout run `node prototypes/wall-templates-lab/server.mjs` (or `npm run templates:lab`), then open `http://127.0.0.1:4179/`.

The lab serves only on loopback, blocks network connections and frames with CSP, never imports the account client, and uses the real canvas, Properties panel, template panel, editor session and renderer. Only its local fixture is saved, under `gamid.templates.local-fixture.v1` on this loopback origin. Its second stage starts with `UNRELATED STAGE / Keep this composition.` The lab is outside `dist`; it is not an authenticated-user editor mode or authentication bypass.

Verified in the browser: review Stage replacement; apply; select title; edit `NIGHT SIGNAL` to `NOVA SIGNAL` through normal Properties; Save; page reload; select saved text; confirm Stage 2 remains; review whole-Wall replacement; Cancel; apply whole Wall; Undo restores both stages.

Automated: 1,363 tests passed, zero failures/skips, including 10 new template regressions. Static validation passed. All 106 commands in the existing typecheck script passed. Tests cover canonical rendering, metadata validation, both scopes, explicit confirmation, atomic failure, ID/group remapping, normal selection/editing, undo/redo, Save/new-session Reload, unrelated-stage preservation, multi-stage API input, unchanged legacy rendering, cancellation, stale confirmation and save-in-flight blocking.

The Windows clone initially had CRLF working-tree files that broke eight existing SQL-source regex tests. This isolated clone uses `core.autocrlf=false` and LF working-tree contents matching the existing index. No unrelated line-ending changes are included in the commit. The obsolete test requiring a Templates placeholder is updated to require the new panel instead. No database tests were executed against a service; database-contract source tests ran as part of `node --test`.

## Scope and extension points

Implemented: one curated template; both application scopes; canonical validation; live recipe preview; explicit confirmation; editor integration; regression tests and a local fixture lab.

Deferred: template library/store, creator uploads, marketplace ownership/licensing, asset distribution/rebinding, AI art direction, sponsored-brand workflows, recipe migrations, remote catalog, dedicated Stage/Section authoring and responsive recipe conversion. Existing image/video/effect payloads remain canonical Wall payloads; the demo needs no media asset pipeline. Do not distribute owner-private asset IDs in future catalog entries: add an explicit asset resolution policy before shipping media templates.

The envelope's discriminated `recipe.kind` leaves room for a stage recipe or composition recipe without changing Wall rendering/persistence. Future AI or creator tools should produce validated recipe data consumed at this boundary. They must not introduce runtime template dependencies into saved Walls. Unknown recipe kinds/versions currently fail closed.

## Review/integration with Claude

The source checkout was `feature/wall-background-controls`; it advanced to `2143392` during this exploration. This branch deliberately stays based on the requested `0d36206`.

Likely shared files: `dist/wall-editor/tools.js` (one import, panel creation, update hook), `dist/wall-editor/index.html` (one stylesheet, Templates mount), `package.json` (syntax checks and lab command), and `tests/wall-w4-editor.test.js` (placeholder expectation). All other implementation files are new. The delta from `0d36206` to observed `2143392` concerns the validator, migration and overflow tests and has no direct file overlap with this change.

No edits to canvas, properties controls, ops, painter, session, background controls, validator, persistence or database schema. Review `apply.js` and the regression tests first, run the lab, then inspect the small tools/HTML hooks. After explicit user authorization, Claude can import/cherry-pick this local checkpoint into a separate integration branch after its movement work. Re-run the full suite there and visually check Templates inside the real editor (desktop drawer and phone sheet), especially pending confirmation during stage switches. No shared TESTING deployment is authorized by this report.

## Authorized shared TESTING integration

Rebased onto accepted checkpoint `2143392` without conflicts. The user subsequently authorized pushing only this feature branch and deploying its exact integrated checkpoint to the existing shared TESTING Worker. No main merge, Production access, real-user Wall edits or database changes are authorized.

Integrated validation: 1,364 tests passed; focused Templates + Keep-inside-OFF suite: 19 passed; static lint and all 106 typecheck commands passed. Browser fixture re-verification passed editable application, Save/page Reload, unrelated Stage preservation, whole-Wall confirmation and Undo. Core Wall validator, canvas, Properties, operations, renderer, Background and persistence files have no diff against `2143392`.
