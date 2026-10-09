#!/usr/bin/env node
// GamID Product Memory (product-memory/) - lightweight local validation and lookup, no dependencies. Rules: product-memory/INDEX.md and AGENTS.md.
//   node scripts/product-memory.mjs [check]                                  validate every record, template and the index
//   node scripts/product-memory.mjs list [--status S] [--prefix P] [--related ID]   find records (related = linked in either direction)
//   node scripts/product-memory.mjs next <PREFIX>                            the next unused ID for a category (IDs are never reused)
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {join, dirname, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Decisions and ideas share the decision/execution flow. Approval to SAVE a record is never one of these states (see save_approval).
const DECISION_FLOW = {
  DISCUSSION: ['PROPOSED', 'DEFERRED', 'REJECTED'],
  PROPOSED: ['APPROVED', 'DISCUSSION', 'DEFERRED', 'REJECTED'],
  APPROVED: ['AUTHORIZED', 'DEFERRED', 'REJECTED', 'SUPERSEDED'],
  AUTHORIZED: ['IMPLEMENTED', 'APPROVED', 'DEFERRED', 'SUPERSEDED'],
  IMPLEMENTED: ['ACCEPTED', 'AUTHORIZED', 'REJECTED', 'SUPERSEDED'],
  ACCEPTED: ['SUPERSEDED'],
  DEFERRED: ['DISCUSSION', 'PROPOSED', 'REJECTED', 'SUPERSEDED'],
  REJECTED: ['DISCUSSION', 'SUPERSEDED'],
  SUPERSEDED: [],
};
const DECISION_INITIAL = ['DISCUSSION', 'PROPOSED', 'APPROVED', 'DEFERRED', 'REJECTED'];

export const CATEGORIES = {
  DIS: {
    folder: 'discussions', template: 'discussion.md',
    flow: {OPEN: ['CONCLUDED', 'SUPERSEDED'], CONCLUDED: ['OPEN', 'SUPERSEDED'], SUPERSEDED: []},
    initial: ['OPEN', 'CONCLUDED'], archivable: ['CONCLUDED', 'SUPERSEDED'],
    fields: [], enums: {},
    headings: ['Context', 'Discussion points', 'Conclusion', 'Reasoning', 'History'],
  },
  DEC: {
    folder: 'decisions', template: 'decision.md',
    flow: DECISION_FLOW, initial: DECISION_INITIAL, archivable: ['REJECTED', 'SUPERSEDED'],
    fields: ['authorization'], enums: {},
    authorized: ['AUTHORIZED', 'IMPLEMENTED', 'ACCEPTED'], accepted: ['ACCEPTED'],
    headings: ['Context', 'Decision', 'Reasoning', 'Alternatives considered', 'History'],
  },
  IDEA: {
    folder: 'ideas', template: 'idea.md',
    flow: DECISION_FLOW, initial: DECISION_INITIAL, archivable: ['REJECTED', 'SUPERSEDED'],
    fields: ['authorization'], enums: {},
    authorized: ['AUTHORIZED', 'IMPLEMENTED', 'ACCEPTED'], accepted: ['ACCEPTED'],
    headings: ['Context', 'Proposal', 'Reasoning', 'Open questions', 'History'],
  },
  ISS: {
    folder: 'issues', template: 'issue.md',
    flow: {
      OPEN: ['AUTHORIZED', 'DEFERRED', 'WONT_FIX', 'DUPLICATE'],
      AUTHORIZED: ['FIXED', 'OPEN', 'DEFERRED'],
      FIXED: ['VERIFIED', 'OPEN'],
      VERIFIED: ['OPEN'],
      DEFERRED: ['OPEN', 'WONT_FIX', 'DUPLICATE'],
      WONT_FIX: ['OPEN'],
      DUPLICATE: ['OPEN'],
    },
    initial: ['OPEN'], archivable: ['VERIFIED', 'WONT_FIX', 'DUPLICATE'],
    fields: ['kind', 'authorization'], enums: {kind: ['BUG', 'IMPROVEMENT']},
    authorized: ['AUTHORIZED', 'FIXED', 'VERIFIED'], accepted: ['VERIFIED'],
    headings: ['Description', 'Evidence', 'Resolution', 'History'],
  },
  REV: {
    folder: 'reviews', template: 'review.md',
    flow: {IN_PROGRESS: ['COMPLETED', 'SUPERSEDED'], COMPLETED: ['SUPERSEDED'], SUPERSEDED: []},
    initial: ['IN_PROGRESS', 'COMPLETED'], archivable: ['COMPLETED', 'SUPERSEDED'],
    fields: ['review_type', 'outcome', 'reviewer'],
    enums: {review_type: ['CODE', 'TEST', 'ACCEPTANCE', 'DESIGN', 'AUDIT'], outcome: ['PASS', 'FAIL', 'PARTIAL', 'INCONCLUSIVE', 'PENDING']},
    headings: ['Subject', 'Method', 'Results', 'Follow-up', 'History'],
  },
};
export const PREFIXES = Object.keys(CATEGORIES);

const COMMON_FIELDS = ['id', 'title', 'status', 'created', 'updated', 'scope', 'summary', 'related', 'save_approval'];
const LIST_FIELDS = new Set(['related', 'supersedes', 'truth_refs', 'checkpoints', 'sources']);
const OPTIONAL_FIELDS = new Set([...LIST_FIELDS, 'superseded_by', 'duplicate_of', 'acceptance']);
const ID = /^(DIS|DEC|IDEA|ISS|REV)-(\d{4})$/;
const ID_TOKEN = /\b(?:DIS|DEC|IDEA|ISS|REV)-\d{4}\b/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{40}$/;
const FILE_NAME = /^((?:DIS|DEC|IDEA|ISS|REV)-\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT-like token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API secret key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*\S{6,}/i, 'a credential assignment'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an email address'],
];
const TRANSCRIPT_LINE = /^\s*(?:>\s*)?(?:\*\*)?(?:user|assistant|human|ai|claude|chatgpt|work|mazen)(?:\*\*)?\s*:/i;

export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) return null;
  const meta = {};
  const problems = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const kv = /^([a-z_]+):[ \t]*(.*)$/.exec(line);
    if (!kv) { problems.push(`unparseable metadata line "${line.trim()}"`); continue; }
    const [, key, rawValue] = kv;
    if (key in meta) problems.push(`duplicate metadata key "${key}"`);
    let value = rawValue.trim();
    if (value.startsWith('[')) {
      if (!value.endsWith(']')) problems.push(`metadata "${key}" list is not closed with ]`);
      value = value.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    }
    meta[key] = value;
  }
  return {meta, body: m[2] ?? '', problems};
}

function sections(body) {
  const out = new Map();
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const h = /^## (.+?)\s*$/.exec(line);
    if (h) { current = h[1]; if (!out.has(current)) out.set(current, []); continue; }
    if (current) out.get(current).push(line);
  }
  return out;
}

function parseHistory(lines) {
  const entries = [];
  const problems = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = /^-\s+(\d{4}-\d{2}-\d{2})\s+([A-Z_]+)(?:\s+[—-]\s+(.*))?\s*$/.exec(line);
    if (e) entries.push({date: e[1], status: e[2], note: e[3] ?? ''});
    else problems.push(`History line is not "- YYYY-MM-DD STATUS — note": "${line.trim()}"`);
  }
  return {entries, problems};
}

function walkMarkdown(dir) {
  return existsSync(dir) ? readdirSync(dir).filter(n => !n.startsWith('.')).map(n => join(dir, n)) : [];
}

function toPosix(p) { return p.split(sep).join('/'); }

function scanPrivacy(text, where, errors) {
  for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(text)) errors.push(`${where}: contains ${label}; Product Memory never stores credentials or personal data`);
  const dialogue = text.split(/\r?\n/).filter(l => TRANSCRIPT_LINE.test(l)).length;
  if (dialogue >= 4) errors.push(`${where}: looks like a conversation transcript (${dialogue} speaker lines); store a concise summary instead`);
}

function checkLinks(text, fromFile, where, errors) {
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = resolve(dirname(fromFile), decodeURIComponent(target.split('#')[0]));
    if (!existsSync(path)) errors.push(`${where}: broken link "${target}"`);
  }
}

function truthIds(root) {
  const file = join(root, 'gamid-truth.json');
  if (!existsSync(file)) return null;
  const {capabilities = []} = JSON.parse(readFileSync(file, 'utf8'));
  return new Set(capabilities.flatMap(c => [c.id, ...(c.contracts ?? []).map(k => k.id)]));
}

function parseIndex(text) {
  const parts = sections(text);
  const counters = new Map();
  const rows = [];
  const problems = [];
  const counted = new Set();
  for (const line of parts.get('ID counters') ?? []) {
    const c = /^\|\s*([A-Z]+)\s*\|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (!c || c[1] === 'Prefix') continue;
    if (!PREFIXES.includes(c[1])) { problems.push(`ID counters: unknown prefix ${c[1]}`); continue; }
    if (counted.has(c[1])) { problems.push(`ID counters: duplicate row for ${c[1]}`); continue; }
    counted.add(c[1]);
    if (c[2] === 'none') counters.set(c[1], 0);
    else {
      const id = ID.exec(c[2]);
      if (!id || id[1] !== c[1]) problems.push(`ID counters: ${c[1]} last issued must be "none" or ${c[1]}-NNNN, not "${c[2]}"`);
      else counters.set(c[1], Number(id[2]));
    }
  }
  for (const p of PREFIXES) if (!counted.has(p)) problems.push(`ID counters: missing row for ${p}`);
  if (!parts.has('Register')) problems.push('missing "## Register" section');
  for (const line of parts.get('Register') ?? []) {
    if (!line.startsWith('|') || /^\|\s*ID\s*\|/.test(line) || /^\|[\s|:-]+\|$/.test(line)) continue;
    const r = /^\|\s*([A-Z]+-\d{4})\s*\|\s*(.+?)\s*\|\s*([A-Z_]+)\s*\|\s*\[[^\]]*\]\(([^)]+)\)\s*\|\s*$/.exec(line);
    if (!r) problems.push(`Register row is not "| ID | Title | Status | [file](path) |": "${line}"`);
    else rows.push({id: r[1], title: r[2], status: r[3], path: r[4]});
  }
  return {counters, rows, problems};
}

function validateRecord(file, memoryDir, errors) {
  const rel = toPosix(relative(memoryDir, file));
  const where = `product-memory/${rel}`;
  const name = file.split(/[\\/]/).pop();
  const fileMatch = FILE_NAME.exec(name);
  if (!fileMatch) { errors.push(`${where}: file name must be <ID>-<kebab-slug>.md`); return null; }
  const text = readFileSync(file, 'utf8');
  const parsed = parseFrontMatter(text);
  if (!parsed) { errors.push(`${where}: missing --- metadata block ---`); return null; }
  const {meta, body, problems} = parsed;
  for (const p of problems) errors.push(`${where}: ${p}`);
  const idMatch = ID.exec(meta.id ?? '');
  if (!idMatch) { errors.push(`${where}: id "${meta.id ?? ''}" is not PREFIX-NNNN`); return null; }
  const prefix = idMatch[1];
  const cat = CATEGORIES[prefix];
  if (meta.id !== fileMatch[1]) errors.push(`${where}: id ${meta.id} does not match the file name`);
  const folder = rel.split('/')[0];
  const archived = folder === 'archive';
  if (!archived && folder !== cat.folder) errors.push(`${where}: ${prefix} records belong in ${cat.folder}/ or archive/`);
  for (const f of [...COMMON_FIELDS, ...cat.fields]) {
    const v = meta[f];
    if (v === undefined || (typeof v === 'string' && !v)) errors.push(`${where}: missing required metadata "${f}"`);
  }
  for (const key of Object.keys(meta)) {
    if (!COMMON_FIELDS.includes(key) && !cat.fields.includes(key) && !OPTIONAL_FIELDS.has(key)) errors.push(`${where}: unknown metadata "${key}"`);
    else if (LIST_FIELDS.has(key) !== Array.isArray(meta[key])) errors.push(`${where}: metadata "${key}" must be ${LIST_FIELDS.has(key) ? 'a [list]' : 'a single value'}`);
  }
  for (const [f, allowed] of Object.entries(cat.enums)) if (meta[f] && !allowed.includes(meta[f])) errors.push(`${where}: ${f} "${meta[f]}" is not one of ${allowed.join(', ')}`);
  if (!(meta.status in cat.flow)) errors.push(`${where}: status "${meta.status}" is not valid for ${prefix} (${Object.keys(cat.flow).join(', ')})`);
  for (const f of ['created', 'updated']) if (meta[f] && !DATE.test(meta[f])) errors.push(`${where}: ${f} must be YYYY-MM-DD`);
  if (DATE.test(meta.created ?? '') && DATE.test(meta.updated ?? '') && meta.updated < meta.created) errors.push(`${where}: updated is before created`);
  if (meta.save_approval && !/^Mazen \d{4}-\d{2}-\d{2}$/.test(meta.save_approval)) errors.push(`${where}: save_approval must be "Mazen YYYY-MM-DD" (Review Before Save)`);
  for (const sha of meta.checkpoints ?? []) if (!SHA.test(sha)) errors.push(`${where}: checkpoint "${sha}" must be a full 40-character commit SHA`);
  if (archived && !cat.archivable.includes(meta.status)) errors.push(`${where}: only ${cat.archivable.join(' / ')} ${prefix} records may be archived`);

  // decision/execution distinctions: authorization and acceptance must be recorded explicitly, never implied by approval
  const parts = sections(body);
  for (const h of cat.headings) if (!parts.has(h)) errors.push(`${where}: missing "## ${h}" section`);
  const {entries, problems: historyProblems} = parseHistory(parts.get('History') ?? []);
  for (const p of historyProblems) errors.push(`${where}: ${p}`);
  if (parts.has('History') && !entries.length) errors.push(`${where}: History needs at least one entry`);
  entries.forEach((e, i) => {
    if (!(e.status in cat.flow)) { errors.push(`${where}: History status ${e.status} is not valid for ${prefix}`); return; }
    if (i === 0 && !cat.initial.includes(e.status)) errors.push(`${where}: a ${prefix} record cannot start as ${e.status} (allowed: ${cat.initial.join(', ')})`);
    const prev = entries[i - 1];
    if (prev && prev.status in cat.flow && !cat.flow[prev.status].includes(e.status)) errors.push(`${where}: invalid transition ${prev.status} -> ${e.status}`);
    if (prev && e.date < prev.date) errors.push(`${where}: History dates must not go backwards`);
    if (DATE.test(meta.updated ?? '') && e.date > meta.updated) errors.push(`${where}: History entry ${e.date} is after updated`);
  });
  if (entries.length && entries.at(-1).status !== meta.status) errors.push(`${where}: status ${meta.status} does not match the latest History entry ${entries.at(-1).status}`);
  if (cat.authorized && entries.some(e => cat.authorized.includes(e.status)) && /^none$/i.test(meta.authorization ?? 'NONE')) errors.push(`${where}: reached ${cat.authorized.join('/')} without a recorded authorization (only an explicit task authorization permits coding)`);
  if (cat.accepted?.includes(meta.status) && !meta.acceptance) errors.push(`${where}: ${meta.status} requires "acceptance" (evidence and Mazen's approval where applicable)`);
  if (prefix === 'REV' && meta.status === 'COMPLETED' && meta.outcome === 'PENDING') errors.push(`${where}: a COMPLETED review needs an outcome other than PENDING`);
  if (meta.status === 'SUPERSEDED' && !meta.superseded_by) errors.push(`${where}: SUPERSEDED requires superseded_by`);
  if (meta.superseded_by && meta.status !== 'SUPERSEDED') errors.push(`${where}: superseded_by is only valid on a SUPERSEDED record`);
  if (meta.status === 'DUPLICATE' && !meta.duplicate_of) errors.push(`${where}: DUPLICATE requires duplicate_of`);
  if (meta.duplicate_of && meta.status !== 'DUPLICATE') errors.push(`${where}: duplicate_of is only valid on a DUPLICATE record`);

  scanPrivacy(text, where, errors);
  checkLinks(body, file, where, errors);
  const refs = new Set();
  for (const [key, value] of Object.entries(meta)) if (key !== 'id') for (const v of [value].flat()) for (const t of v.match(ID_TOKEN) ?? []) refs.add(t);
  for (const t of body.match(ID_TOKEN) ?? []) refs.add(t);
  refs.delete(meta.id);
  return {id: meta.id, prefix, number: Number(idMatch[2]), path: rel, where, meta, refs};
}

export function validateProductMemory({root = REPO_ROOT} = {}) {
  const memoryDir = join(root, 'product-memory');
  const errors = [];
  if (!existsSync(memoryDir)) return {errors: ['product-memory/ is missing'], records: []};
  for (const d of [...new Set(Object.values(CATEGORIES).map(c => c.folder)), 'archive', 'templates']) if (!existsSync(join(memoryDir, d))) errors.push(`product-memory/${d}/ is missing`);

  for (const [prefix, cat] of Object.entries(CATEGORIES)) {
    const file = join(memoryDir, 'templates', cat.template);
    if (!existsSync(file)) { errors.push(`product-memory/templates/${cat.template} is missing`); continue; }
    const text = readFileSync(file, 'utf8');
    const parsed = parseFrontMatter(text);
    const where = `product-memory/templates/${cat.template}`;
    if (!parsed) { errors.push(`${where}: missing metadata block`); continue; }
    if (parsed.meta.id !== `${prefix}-XXXX`) errors.push(`${where}: template id must be ${prefix}-XXXX`);
    for (const f of [...COMMON_FIELDS, ...cat.fields]) if (!(f in parsed.meta)) errors.push(`${where}: missing metadata "${f}"`);
    for (const h of cat.headings) if (!sections(parsed.body).has(h)) errors.push(`${where}: missing "## ${h}" section`);
    scanPrivacy(text, where, errors);
  }

  const records = [];
  for (const dir of [...new Set(Object.values(CATEGORIES).map(c => c.folder)), 'archive']) {
    for (const file of walkMarkdown(join(memoryDir, dir))) {
      if (statSync(file).isDirectory() || !file.endsWith('.md')) { errors.push(`product-memory/${toPosix(relative(memoryDir, file))}: only <ID>-<slug>.md records belong here`); continue; }
      const record = validateRecord(file, memoryDir, errors);
      if (record) records.push(record);
    }
  }

  const byId = new Map();
  for (const r of records) {
    if (byId.has(r.id)) errors.push(`${r.where}: duplicate id ${r.id} (also ${byId.get(r.id).where}); IDs are never reused`);
    else byId.set(r.id, r);
  }
  const truth = truthIds(root);
  for (const r of records) {
    for (const t of r.refs) if (!byId.has(t)) errors.push(`${r.where}: references ${t}, which does not exist`);
    for (const t of r.meta.related ?? []) if (!ID.test(t)) errors.push(`${r.where}: related "${t}" is not a record ID`);
    for (const s of r.meta.sources ?? []) if (!existsSync(join(root, s))) errors.push(`${r.where}: source "${s}" does not exist in the repository`);
    for (const t of r.meta.truth_refs ?? []) if (truth && !truth.has(t)) errors.push(`${r.where}: truth_refs "${t}" is not a GamID Truth capability or contract id`);
    const sup = r.meta.superseded_by && byId.get(r.meta.superseded_by);
    if (sup && sup.prefix !== r.prefix) errors.push(`${r.where}: superseded_by must be another ${r.prefix} record`);
    if (sup && !(sup.meta.supersedes ?? []).includes(r.id)) errors.push(`${r.where}: ${sup.id} must list ${r.id} in supersedes`);
    for (const old of r.meta.supersedes ?? []) {
      const o = byId.get(old);
      if (o && (o.meta.status !== 'SUPERSEDED' || o.meta.superseded_by !== r.id)) errors.push(`${r.where}: supersedes ${old}, but ${old} is not SUPERSEDED with superseded_by ${r.id}`);
    }
    const dup = r.meta.duplicate_of && byId.get(r.meta.duplicate_of);
    if (dup && dup.prefix !== 'ISS') errors.push(`${r.where}: duplicate_of must be an ISS record`);
  }

  const indexFile = join(memoryDir, 'INDEX.md');
  if (!existsSync(indexFile)) errors.push('product-memory/INDEX.md is missing');
  else {
    const text = readFileSync(indexFile, 'utf8');
    scanPrivacy(text, 'product-memory/INDEX.md', errors);
    checkLinks(text, indexFile, 'product-memory/INDEX.md', errors);
    const {counters, rows, problems} = parseIndex(text);
    for (const p of problems) errors.push(`product-memory/INDEX.md: ${p}`);
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.id)) { errors.push(`product-memory/INDEX.md: duplicate Register row ${row.id}`); continue; }
      seen.add(row.id);
      const r = byId.get(row.id);
      if (!r) { errors.push(`product-memory/INDEX.md: Register lists ${row.id}, which has no record`); continue; }
      if (row.path !== r.path) errors.push(`product-memory/INDEX.md: ${row.id} links ${row.path}, but the record is ${r.path}`);
      if (row.status !== r.meta.status) errors.push(`product-memory/INDEX.md: ${row.id} status ${row.status} does not match the record (${r.meta.status})`);
      if (row.title !== r.meta.title) errors.push(`product-memory/INDEX.md: ${row.id} title does not match the record`);
    }
    for (const r of byId.values()) if (!seen.has(r.id)) errors.push(`product-memory/INDEX.md: ${r.id} is missing from the Register`);
    // records are archived, never deleted: every issued ID 1..last must still exist, and none may exceed the counter
    for (const prefix of PREFIXES) {
      if (!counters.has(prefix)) continue;
      const last = counters.get(prefix);
      const numbers = new Set(records.filter(r => r.prefix === prefix).map(r => r.number));
      for (const n of numbers) if (n < 1 || n > last) errors.push(`product-memory/INDEX.md: ${prefix}-${String(n).padStart(4, '0')} exists but the ${prefix} counter says last issued is ${last ? `${prefix}-${String(last).padStart(4, '0')}` : 'none'}`);
      for (let n = 1; n <= last; n++) if (!numbers.has(n)) errors.push(`product-memory/INDEX.md: ${prefix}-${String(n).padStart(4, '0')} was issued but its record is missing (archive records, never delete them)`);
    }
  }
  return {errors, records};
}

// records linked to `id` in either direction (they reference it, or it references them)
export function relatedTo(records, id, all = records) {
  const self = all.find(r => r.id === id);
  return records.filter(r => r.id !== id && (r.refs.has(id) || (self && self.refs.has(r.id))));
}

function main(argv) {
  const [command = 'check', ...rest] = argv;
  const {errors, records} = validateProductMemory();
  if (command === 'check') {
    if (errors.length) { for (const e of errors) console.error(`- ${e}`); console.error(`Product Memory validation failed: ${errors.length} problem(s).`); return 1; }
    console.log(`Product Memory validation passed: ${records.length} record(s).`);
    return 0;
  }
  if (command === 'list') {
    const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
    let list = records;
    if (opt('--status')) list = list.filter(r => r.meta.status === opt('--status'));
    if (opt('--prefix')) list = list.filter(r => r.prefix === opt('--prefix'));
    if (opt('--related')) list = relatedTo(list, opt('--related'), records);
    for (const r of list.sort((a, b) => a.id.localeCompare(b.id))) console.log(`${r.id}\t${r.meta.status}\tproduct-memory/${r.path}\t${r.meta.title}`);
    if (!list.length) console.log('No matching records.');
    return errors.length ? 1 : 0;
  }
  if (command === 'next') {
    const prefix = rest[0];
    if (!PREFIXES.includes(prefix)) { console.error(`Usage: next <${PREFIXES.join('|')}>`); return 1; }
    const {counters} = parseIndex(readFileSync(join(REPO_ROOT, 'product-memory', 'INDEX.md'), 'utf8'));
    console.log(`${prefix}-${String((counters.get(prefix) ?? 0) + 1).padStart(4, '0')}`);
    return 0;
  }
  console.error('Usage: node scripts/product-memory.mjs [check | list [--status S] [--prefix P] [--related ID] | next <PREFIX>]');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
