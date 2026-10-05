// GamID Truth (gamid-truth.json) - lightweight shape validation only: well-formed JSON, unique ids, the controlled status vocabulary, required fields, and the
// separation rule (product state + approved contracts only - no issue / finding / secret fields).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const STATUSES = ['ACCEPTED', 'PENDING_ACCEPTANCE', 'DEPRECATED'];
const CAPABILITY_FIELDS = new Set(['id', 'name', 'status', 'surfaces', 'limits', 'contracts', 'noContract', 'checkpoint', 'record', 'notes']);
const SHA = /^[0-9a-f]{40}$/;

const raw = readFileSync(new URL('../gamid-truth.json', import.meta.url), 'utf8');

test('gamid-truth.json is valid JSON with its top-level fields', () => {
  const truth = JSON.parse(raw);
  assert.equal(truth.schemaVersion, 1);
  assert.match(truth.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(truth.environment, 'TESTING');
  assert.deepEqual(Object.keys(truth.statuses).sort(), [...STATUSES].sort(), 'the documented vocabulary is the controlled one');
  assert.ok(Array.isArray(truth.capabilities) && truth.capabilities.length > 0);
});

test('every capability has a unique kebab-case id, a name, a controlled status and only known, well-formed fields', () => {
  const {capabilities} = JSON.parse(raw);
  const ids = capabilities.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate capability ids: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  for (const c of capabilities) {
    assert.match(c.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id ${c.id}`);
    assert.ok(typeof c.name === 'string' && c.name.trim(), `${c.id}: name`);
    assert.ok(STATUSES.includes(c.status), `${c.id}: status ${c.status} is not one of ${STATUSES}`);
    for (const key of Object.keys(c)) assert.ok(CAPABILITY_FIELDS.has(key), `${c.id}: unknown field "${key}" (product state and approved contracts only)`);
    if (c.checkpoint !== undefined) assert.match(c.checkpoint, SHA, `${c.id}: checkpoint must be a full commit SHA`);
    if (c.surfaces !== undefined) assert.ok(Array.isArray(c.surfaces) && c.surfaces.every(s => typeof s === 'string' && s), `${c.id}: surfaces`);
    if (c.limits !== undefined) for (const [k, v] of Object.entries(c.limits)) assert.ok(typeof v === 'number' || typeof v === 'boolean', `${c.id}: limit ${k} must be a number or boolean`);
    if (c.contracts !== undefined) for (const k of c.contracts) assert.ok(typeof k.id === 'string' && k.id && typeof k.rule === 'string' && k.rule, `${c.id}: contract needs id + rule`);
  }
  const contractIds = capabilities.flatMap(c => (c.contracts ?? []).map(k => k.id));
  assert.equal(new Set(contractIds).size, contractIds.length, 'duplicate contract ids');
});

test('GamID Truth carries no issue tracking, findings or secrets', () => {
  assert.doesNotMatch(raw, /"(bugs?|knownBugs|knownIssues|issues|findings|suspected|password|token|secret|apiKey)"\s*:/i);
  assert.doesNotMatch(raw, /\bGM-\d{4}\b/, 'no Monitor issue ids');
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{10,}/, 'no JWT-like values');
});
