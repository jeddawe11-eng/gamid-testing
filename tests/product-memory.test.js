// GamID Product Memory (product-memory/) - the repository's own records, templates and index validate, and the validator rejects malformed records,
// broken references, index drift, ID reuse/deletion and stored secrets. Fixtures are written to a temporary directory, never into product-memory/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateProductMemory, parseFrontMatter, relatedTo, CATEGORIES} from '../scripts/product-memory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEMORY = join(ROOT, 'product-memory');
const SHA = 'fd9c9a9df25583050991b5069a087142abeb13b9';

function record(meta, sectionsText) {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  return `---\n${lines.join('\n')}\n---\n\n${sectionsText}\n`;
}
const base = {created: '2026-10-09', updated: '2026-10-09', scope: 'Profile Editor', related: [], save_approval: 'Mazen 2026-10-09'};
const heads = (names, history) => names.filter(n => n !== 'History').map(n => `## ${n}\n\nText.\n`).join('\n') + `\n## History\n\n${history.map(h => `- 2026-10-09 ${h} — note`).join('\n')}`;

function validFiles() {
  return {
    'discussions/DIS-0001-feedback-lifecycle.md': record({id: 'DIS-0001', title: 'Feedback lifecycle', status: 'CONCLUDED', ...base, summary: 'Where save feedback lives.', related: ['DEC-0002']}, heads(CATEGORIES.DIS.headings, ['CONCLUDED'])),
    'decisions/DEC-0001-persistent-errors.md': record({id: 'DEC-0001', title: 'Persistent errors', status: 'SUPERSEDED', ...base, summary: 'All errors persist.', authorization: 'NONE', superseded_by: 'DEC-0002'}, heads(CATEGORIES.DEC.headings, ['PROPOSED', 'APPROVED', 'SUPERSEDED'])),
    'decisions/DEC-0002-transient-field-errors.md': record({id: 'DEC-0002', title: 'Transient field errors', status: 'ACCEPTED', ...base, summary: 'Field notification is transient.', authorization: 'Mazen 2026-10-09 approved one bug fix', acceptance: 'Mazen 2026-10-09; REV-0001', supersedes: ['DEC-0001'], truth_refs: ['your-gamid-editor'], checkpoints: [SHA], sources: ['AGENTS.md']}, heads(CATEGORIES.DEC.headings, ['PROPOSED', 'APPROVED', 'AUTHORIZED', 'IMPLEMENTED', 'ACCEPTED']).replace('## History', 'See [the rules](../../AGENTS.md).\n\n## History')),
    'ideas/IDEA-0001-error-history.md': record({id: 'IDEA-0001', title: 'Error history', status: 'DEFERRED', ...base, summary: 'Keep a per-section error log.', authorization: 'NONE'}, heads(CATEGORIES.IDEA.headings, ['DISCUSSION', 'DEFERRED'])),
    'archive/ISS-0001-error-never-hides.md': record({id: 'ISS-0001', title: 'Error never hides', status: 'VERIFIED', ...base, summary: 'Save error persisted.', kind: 'BUG', authorization: 'Mazen 2026-10-09 approved one bug fix', acceptance: 'REV-0001', checkpoints: [SHA]}, heads(CATEGORIES.ISS.headings, ['OPEN', 'AUTHORIZED', 'FIXED', 'VERIFIED'])),
    'reviews/REV-0001-editor-acceptance.md': record({id: 'REV-0001', title: 'Editor acceptance', status: 'COMPLETED', ...base, summary: 'Manual acceptance passed.', review_type: 'ACCEPTANCE', outcome: 'PASS', reviewer: 'Mazen', related: ['ISS-0001']}, heads(CATEGORIES.REV.headings, ['COMPLETED'])),
  };
}

function indexFor(files, edit = t => t) {
  // start from the real index with its counters and Register emptied, so fixtures never inherit the repository's own records
  let text = readFileSync(join(MEMORY, 'INDEX.md'), 'utf8').replace(/\r\n/g, '\n')
    .replace(/^(\| [A-Z]+ \|[^|]*\|[^|]*\| )[A-Z]+-\d{4}( \|)$/gm, '$1none$2')
    .replace(/^\| [A-Z]+-\d{4} \|.*\n/gm, '');
  const rows = [];
  const last = {};
  for (const [path, content] of Object.entries(files)) {
    const parsed = parseFrontMatter(content);
    if (!parsed?.meta.id) continue;
    const {id, title, status} = parsed.meta;
    rows.push(`| ${id} | ${title} | ${status} | [${path.split('/').pop()}](${path}) |`);
    const [prefix, n] = id.split('-');
    last[prefix] = Math.max(last[prefix] ?? 0, Number(n));
  }
  for (const [prefix, n] of Object.entries(last)) text = text.replace(new RegExp(`^(\\| ${prefix} \\|[^|]*\\|[^|]*\\| )none( \\|)$`, 'm'), `$1${prefix}-${String(n).padStart(4, '0')}$2`);
  text = text.replace('| ID | Title | Status | Record |\n|---|---|---|---|\n', `| ID | Title | Status | Record |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  return edit(text);
}

function validate(files, {index = t => t, skipTemplate} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gamid-memory-'));
  try {
    writeFileSync(join(root, 'AGENTS.md'), 'rules');
    for (const name of ['PROJECT_STATE.md', 'PROJECT_HANDOFF.md', 'scripts/product-memory.mjs', 'docs/x']) { mkdirSync(dirname(join(root, name)), {recursive: true}); writeFileSync(join(root, name), ''); }
    writeFileSync(join(root, 'gamid-truth.json'), JSON.stringify({capabilities: [{id: 'your-gamid-editor', contracts: [{id: 'profile-feedback-lifecycle'}]}]}));
    for (const d of ['discussions', 'decisions', 'ideas', 'issues', 'reviews', 'archive', 'templates']) mkdirSync(join(root, 'product-memory', d), {recursive: true});
    for (const t of readdirSync(join(MEMORY, 'templates'))) if (t !== skipTemplate) writeFileSync(join(root, 'product-memory', 'templates', t), readFileSync(join(MEMORY, 'templates', t)));
    for (const [path, content] of Object.entries(files)) writeFileSync(join(root, 'product-memory', path), content);
    writeFileSync(join(root, 'product-memory', 'INDEX.md'), indexFor(files, index));
    return validateProductMemory({root});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

const addText = (t, s) => t.replace('## History', `${s}\n\n## History`);
const mutate = (path, fn) => { const files = validFiles(); files[path] = fn(files[path]); return files; };
const DEC2 = 'decisions/DEC-0002-transient-field-errors.md';

test('the repository Product Memory (index, templates, records) validates', () => {
  const {errors} = validateProductMemory({root: ROOT});
  assert.deepEqual(errors, []);
  for (const cat of Object.values(CATEGORIES)) assert.ok(readdirSync(join(MEMORY, 'templates')).includes(cat.template), `template ${cat.template}`);
});

test('a well-formed set of records, links, supersession and archive validates, and related lookup works both ways', () => {
  const {errors, records} = validate(validFiles());
  assert.deepEqual(errors, []);
  assert.equal(records.length, 6);
  assert.deepEqual(relatedTo(records, 'DEC-0002').map(r => r.id).sort(), ['DEC-0001', 'DIS-0001', 'REV-0001']);
});

const cases = [
  ['duplicate id', () => ({...validFiles(), 'decisions/DEC-0002-copy.md': validFiles()[DEC2]}), /duplicate id DEC-0002/],
  ['missing required metadata', () => mutate(DEC2, t => t.replace(/^summary:.*\n/m, '')), /missing required metadata "summary"/],
  ['unknown metadata', () => mutate(DEC2, t => t.replace('scope:', 'owner: me\nscope:')), /unknown metadata "owner"/],
  ['unparseable metadata block', () => mutate(DEC2, t => t.replace(/^---\n/, '')), /file name|metadata block|is not PREFIX/],
  ['status from another category', () => mutate('reviews/REV-0001-editor-acceptance.md', t => t.replace('status: COMPLETED', 'status: APPROVED')), /status "APPROVED" is not valid for REV/],
  ['invalid transition', () => mutate(DEC2, t => t.replace('- 2026-10-09 APPROVED — note\n- 2026-10-09 AUTHORIZED — note\n', '')), /invalid transition PROPOSED -> IMPLEMENTED/],
  ['status out of step with History', () => mutate('ideas/IDEA-0001-error-history.md', t => t.replace('status: DEFERRED', 'status: DISCUSSION')), /does not match the latest History entry/],
  ['authorized without authorization', () => mutate(DEC2, t => t.replace(/^authorization:.*$/m, 'authorization: NONE')), /without a recorded authorization/],
  ['accepted without acceptance evidence', () => mutate(DEC2, t => t.replace(/^acceptance:.*\n/m, '')), /requires "acceptance"/],
  ['save without Mazen approval', () => mutate(DEC2, t => t.replace('save_approval: Mazen 2026-10-09', 'save_approval: yes')), /save_approval must be "Mazen YYYY-MM-DD"/],
  ['broken record reference', () => mutate(DEC2, t => addText(t, '\nFollows DEC-0099.\n')), /references DEC-0099, which does not exist/],
  ['broken file link', () => mutate(DEC2, t => addText(t, '\n[gone](../../docs/missing.md)\n')), /broken link "..\/..\/docs\/missing.md"/],
  ['missing source file', () => mutate(DEC2, t => t.replace('sources: [AGENTS.md]', 'sources: [docs/missing.md]')), /source "docs\/missing.md" does not exist/],
  ['unknown Truth reference', () => mutate(DEC2, t => t.replace('truth_refs: [your-gamid-editor]', 'truth_refs: [no-such-capability]')), /truth_refs "no-such-capability"/],
  ['short checkpoint', () => mutate(DEC2, t => t.replace(SHA, 'fd9c9a9')), /full 40-character commit SHA/],
  ['superseded without superseded_by', () => mutate('decisions/DEC-0001-persistent-errors.md', t => t.replace(/^superseded_by:.*\n/m, '')), /SUPERSEDED requires superseded_by/],
  ['supersession not linked back', () => mutate(DEC2, t => t.replace('supersedes: [DEC-0001]', 'supersedes: []')), /DEC-0002 must list DEC-0001 in supersedes/],
  ['archived while still active', () => { const f = validFiles(); f['archive/IDEA-0001-error-history.md'] = f['ideas/IDEA-0001-error-history.md']; delete f['ideas/IDEA-0001-error-history.md']; return f; }, /only REJECTED \/ SUPERSEDED IDEA records may be archived/],
  ['record in the wrong folder', () => { const f = validFiles(); f['ideas/REV-0001-editor-acceptance.md'] = f['reviews/REV-0001-editor-acceptance.md']; delete f['reviews/REV-0001-editor-acceptance.md']; return f; }, /REV records belong in reviews\//],
  ['stored token', () => mutate(DEC2, t => addText(t, '\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig\n')), /contains a JWT-like token/],
  ['stored credential', () => mutate(DEC2, t => addText(t, '\npassword: hunter22\n')), /contains a credential assignment/],
  ['stored email address', () => mutate(DEC2, t => addText(t, '\nContact someone@example.com.\n')), /contains an email address/],
  ['conversation dump', () => mutate(DEC2, t => addText(t, '\nUser: a\nAssistant: b\nUser: c\nAssistant: d\n')), /looks like a conversation transcript/],
];
for (const [name, files, expected] of cases) {
  test(`rejects: ${name}`, () => {
    const {errors} = validate(files());
    assert.ok(errors.some(e => expected.test(e)), `expected ${expected} in:\n${errors.join('\n')}`);
  });
}

const indexCases = [
  ['record missing from the Register', t => t.replace(/^\| IDEA-0001 .*\n/m, ''), /IDEA-0001 is missing from the Register/],
  ['Register row without a record', t => t.replace(/^(\| IDEA-0001 .*\n)/m, '$1| IDEA-0002 | Ghost | DEFERRED | [x.md](ideas/x.md) |\n'), /Register lists IDEA-0002, which has no record/],
  ['duplicate Register row', t => t.replace(/^(\| IDEA-0001 .*\n)/m, '$1$1'), /duplicate Register row IDEA-0001/],
  ['Register status out of date', t => t.replace(/^\| IDEA-0001 \| Error history \| DEFERRED/m, '| IDEA-0001 | Error history | DISCUSSION'), /IDEA-0001 status DISCUSSION does not match/],
  ['Register link out of date', t => t.replace('(archive/ISS-0001-error-never-hides.md)', '(issues/ISS-0001-error-never-hides.md)'), /ISS-0001 links issues\//],
  ['issued ID deleted (gap)', t => t.replace('| DEC | Decisions | decisions/ | DEC-0002 |', '| DEC | Decisions | decisions/ | DEC-0003 |'), /DEC-0003 was issued but its record is missing/],
  ['ID beyond the counter', t => t.replace('| REV | Reviews | reviews/ | REV-0001 |', '| REV | Reviews | reviews/ | none |'), /REV-0001 exists but the REV counter says last issued is none/],
  ['missing counter row', t => t.replace(/^\| ISS \| Issues .*\n/m, ''), /missing row for ISS/],
];
for (const [name, edit, expected] of indexCases) {
  test(`rejects index drift: ${name}`, () => {
    const {errors} = validate(validFiles(), {index: edit});
    assert.ok(errors.some(e => expected.test(e)), `expected ${expected} in:\n${errors.join('\n')}`);
  });
}

test('rejects a missing category template', () => {
  const {errors} = validate(validFiles(), {skipTemplate: 'issue.md'});
  assert.ok(errors.includes('product-memory/templates/issue.md is missing'));
});
