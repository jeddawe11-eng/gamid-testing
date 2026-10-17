import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { socialSizing, mobileStats } from '../dist/public/public-mobile.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const css = read('dist/public/public.css');
const mobileBlock = css.slice(css.indexOf('/* MOBILE PUBLIC VISITOR V2'));

test('adaptive My Socials: few accounts are large, more get gradually smaller, never below the 44px touch target', () => {
  assert.equal(socialSizing(0), null);
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => socialSizing(n));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i].max <= sizes[i - 1].max, `max never grows with more accounts (${i + 1})`);
  for (const s of sizes) { assert.ok(s.max >= 44, 'never below the touch target'); assert.ok(s.per >= 1 && s.per <= 6); }
  assert.ok(socialSizing(1).max >= 76 && socialSizing(12).max <= 50, 'a single account is far larger than twelve');
  assert.deepEqual(socialSizing(20), socialSizing(12), 'more than twelve keeps the smallest size and wraps');
  assert.match(mobileBlock, /--social-size:clamp\(44px,min\(calc\(\(100cqi - \(var\(--social-per,6\) - 1\) \* var\(--gap\)\) \/ var\(--social-per,6\)\),calc\(\(100cqi - \(var\(--social-cap,6\) - 1\) \* var\(--gap\)\) \/ var\(--social-cap,6\)\)\),var\(--social-max,48px\)\)/, 'fitted to the card width, floor 44px');
  for (let n = 6; n <= 12; n++) assert.equal(socialSizing(n).cap, 5, 'from six accounts the size is also bounded by five in a row, so it never exceeds the five-account size on narrow phones');
  for (let n = 1; n <= 5; n++) assert.equal(socialSizing(n).cap, socialSizing(n).per);
});

test('Mobile V2 marks are an exact copy of the accepted desktop My Socials marks, and the desktop rules are unchanged', () => {
  const desktopStart = css.indexOf('/* My Socials marks (desktop only');
  const desktop = css.slice(css.indexOf('*/', desktopStart) + 2, css.indexOf('\n}\n', desktopStart)).trim();
  assert.match(desktop, /^html\.is-public-desktop \.social-icon\[data-platform=discord\]/, 'the desktop rules keep their accepted selectors');
  const copyStart = mobileBlock.indexOf('/* Mobile V2 My Socials marks');
  const copy = mobileBlock.slice(mobileBlock.indexOf('@media(max-width:79.99rem){', copyStart) + '@media(max-width:79.99rem){'.length, mobileBlock.lastIndexOf('}')).trim();
  assert.equal(copy, desktop.replace(/html\.is-public-desktop \.social-icon/g, 'html.is-public-mobile .social-icon'));
});

test('every Mobile V2 rule is scoped to the mobile layout; the desktop layout gets nothing new', () => {
  const rules = mobileBlock.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}@]+\{[^{}]*\}/g).map(r => r.slice(0, r.indexOf('{')).trim());
  const unscoped = rules.filter(selector => !/html(\.[\w-]+)*\.is-public-mobile/.test(selector) && !/^\.mob-(col|only|stat)/.test(selector));
  assert.deepEqual(unscoped, [], 'only html.is-public-mobile rules (and the mobile-only stat / column components)');
  assert.match(mobileBlock, /^\/\* MOBILE PUBLIC VISITOR V2[\s\S]*?\.mob-col,\.mob-only\{display:none\}\n@media\(max-width:79\.99rem\)\{/, 'hidden by default, styled only below 80rem');
  assert.doesNotMatch(mobileBlock, /\.pg-|is-public-desktop/, 'no My Games dialog (.pg-*) or desktop rule is restyled');
});

test('the stats row shows only real public counts and opens what it counts', () => {
  const doc = { createElement: tag => ({ tag, className: '', dataset: {}, attrs: {}, children: [], textContent: '', setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, addEventListener(t, fn) { this.onclick = fn; } }) };
  assert.equal(mobileStats({ doc }), null, 'nothing to count, no row');
  const row = mobileStats({ doc, gamesCount: 14, crewsCount: 3, hasDuo: true, onGames() {}, onCrews() {}, onDuo() {} });
  assert.equal(row.children.length, 3);
  assert.deepEqual(row.children.map(c => c.children.map(x => x.textContent)), [['14', 'Games'], ['3', 'Crews'], ['1', 'Duo']]);
  assert.equal(row.children[1].attrs['aria-haspopup'], 'dialog', 'Crews opens the existing My Crews view');
  assert.equal(mobileStats({ doc, gamesCount: 0, crewsCount: 1, onCrews() {} }).children.length, 1, 'private My Games (count 0) is never counted');
  const source = read('dist/public/public-mobile.js');
  assert.doesNotMatch(source, /fetch\(|rpc\(|supabase|innerHTML/, 'presentation only: no data access, no markup injection');
});

test('the page draws the Classic Profile at every width without a Wall; the desktop layout stays at DESKTOP_QUERY widths', () => {
  const page = read('dist/public/public.js');
  assert.match(page, /const hostProfile = \(\) => Boolean\(desktopView\);/);
  assert.match(page, /if \(desktopQuery\?\.matches\) \{ hideMobile\(\); showDesktop\(state\); \}/);
  assert.match(page, /mobColumn\.append\(\.\.\.\[desktopView\.hero, sectionsPanel, desktopView\.about, deskFavorites, deskConnected, gamesBlock\]\.filter\(Boolean\)\);/, 'Mobile V2 order');
  assert.match(page, /adaptSocials\(sectionsPanel\.querySelector\("\.public-socials"\)\);/);
  assert.doesNotMatch(page, /hostReveal: false/, 'the frame never draws its own profile again while the page has one');
  assert.match(read('dist/public/public-desktop.js'), /export const DESKTOP_QUERY = "\(min-width: 80rem\)";/, 'the desktop breakpoint is unchanged');
});
