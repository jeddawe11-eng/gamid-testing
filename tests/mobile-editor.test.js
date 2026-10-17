import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DECK_GROUPS, DECK_NESTED, deckOwner } from '../dist/account/mobile-editor.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Mobile V2 deck groups follow the accepted Desktop pairs and cover every editor once', () => {
  assert.deepEqual(DECK_GROUPS.map(g => g.id), ['media', 'about', 'social', 'games', 'play', 'wall']);
  const cards = DECK_GROUPS.flatMap(g => g.cards);
  for (const key of ['avatar', 'intro', 'banner', 'about-group', 'connections', 'socials', 'games', 'game-display', 'play', 'duo', 'crew', 'wall']) assert.equal(cards.filter(k => k === key).length, 1, key);
  assert.deepEqual(DECK_NESTED, ['about', 'roles', 'education', 'bio', 'name']);
  for (const key of DECK_NESTED) assert.equal(deckOwner(key), 'about-group');
  assert.equal(deckOwner('league'), 'connections');
  assert.equal(deckOwner('socials'), 'socials');
});

test('Mobile V2 is a presentation layer below 1024px; the Desktop editor is untouched', () => {
  const html = read('dist/account/index.html');
  assert.match(html, /<link rel="stylesheet" href="desktop-editor\.css" media="\(min-width: 1024px\)" \/>/);
  assert.match(html, /<link rel="stylesheet" href="mobile-editor\.css" media="\(max-width: 1023\.98px\)" \/>/);
  const css = read('dist/account/mobile-editor.css');
  assert.match(css.replace(/\/\*[\s\S]*?\*\//g, '').trim(), /^@media \(max-width:1023\.98px\)\{[\s\S]*\}$/, 'every mobile rule is media-qualified');
  const mobile = read('dist/account/mobile-editor.js');
  assert.match(mobile, /matchMedia\('\(min-width: 1024px\)'\)/);
  assert.doesNotMatch(mobile, /\bapi\.|fetch\(|supabase|\.rpc\(/, 'no backend access from the presentation layer');
  assert.doesNotMatch(mobile, /from '\.\/desktop-editor\.js'/);
  // Mobile mounts first so it hands the moved cards back before Desktop takes them; account.js keeps one editor.desktop entry point.
  const editor = read('dist/account/profile-editor.js');
  assert.ok(editor.indexOf('mountMobileEditor(doc,sections') < editor.indexOf('mountDesktopEditor(doc,sections)'));
  for (const name of ['reveal', 'configureMedia', 'clearMedia', 'update', 'setAbout']) assert.match(editor, new RegExp(`${name}:`));
});

test('Mobile V2 keeps drafts: cards are moved with restoration slots, never cloned or rebuilt', () => {
  const mobile = read('dist/account/mobile-editor.js');
  assert.match(mobile, /doc\.createComment\('mobile deck original position'\)/);
  assert.match(mobile, /slot\.replaceWith\(node\)/);
  assert.doesNotMatch(mobile, /\.card\.cloneNode|panel\.cloneNode|innerHTML\s*=/);
  // Save paths stay the sections' own buttons and the original Save All bar (moved into the sticky bar).
  assert.match(mobile, /move\(doc\.getElementById\('saveAllBar'\),bar\)/);
  assert.doesNotMatch(mobile, /saveEditorSection|\.click\(\)\s*;?\s*\/\/\s*save/);
  // Android / browser Back closes the editor sheet instead of leaving YOUR GAMID.
  assert.match(mobile, /history\.pushState/);
  assert.match(mobile, /addEventListener\('popstate'/);
});
