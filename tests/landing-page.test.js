import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { authLanding, authTabFromSearch, searchWithoutAuth } from "../dist/account/domain.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const exists = async path => { try { await access(new URL(path, import.meta.url)); return true; } catch { return false; } };
const listFiles = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) await listFiles(target, out); else out.push(target);
  }
  return out;
};

const landing = await read("../dist/index.html");
const landingCss = await read("../dist/landing.css");
const accountHtml = await read("../dist/account/index.html");
const accountJs = (await read("../dist/account/account.js")).replace(/\r\n/g, "\n");
const notFound = await read("../dist/404.html");
const workflow = await read("../.github/workflows/deploy-pages.yml");
const lab = await read("../prototypes/slice-1-intro-lab/index.html");
const labApp = await read("../prototypes/slice-1-intro-lab/app.js");

const anchors = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
  href: /href="([^"]*)"/.exec(match[1])?.[1],
  cta: /data-cta="([^"]*)"/.exec(match[1])?.[1],
  text: match[2].replace(/<[^>]+>/g, "").trim(),
}));

// ------------------------------------------------------------------------------------------------ the anonymous root

test("the anonymous root is a static landing page and no longer renders the NovaRift prototype", () => {
  assert.match(landing, /<title>GamID — Your gaming identity\. One GamID\.<\/title>/);
  assert.match(landing, /<h1[^>]*>Your gaming identity\.<br \/><span>One GamID\.<\/span><\/h1>/);
  assert.match(landing, /CREATE <i>→<\/i> WOW <i>→<\/i> SHARE/);
  assert.doesNotMatch(landing, /novarift|marvel rivals|favorite games|duo \/ teammate|kairozen|velocity esports|currently playing|player profile/i);
  assert.doesNotMatch(landing, /GAMID LAB|Intro Engine|Prototype controls|intro-layer|prototype-shell/i);
});

test("no prototype or editing controls appear at the root: no scripts, forms, inputs, buttons, video, or engine assets", () => {
  assert.doesNotMatch(landing, /<script|<form|<input|<select|<textarea|<button|<video|<iframe|<canvas/i);
  assert.doesNotMatch(landing, /id="(presetSelect|replayButton|skipButton|panelSkipButton|introVideo|introImage|introLayer|mediaSelect|introDuration|transitionDuration|stateBadge|avatarTarget)"/);
  assert.doesNotMatch(landing, /app\.js|styles\.css|transition-engine|assets\/|gamid-intro/i);
  assert.match(landing, /<link rel="stylesheet" href="landing\.css" \/>/);
  assert.equal([...landing.matchAll(/<link\b/g)].length, 1, "only the landing stylesheet is loaded");
});

test("Create Your GamID and Sign In route into the EXISTING account flow via relative, base-path-safe links", () => {
  const links = anchors(landing);
  const ctas = links.filter(link => link.cta);
  assert.deepEqual(ctas.map(link => link.cta), ["create", "signin", "create", "signin"], "the same two actions in the hero and the closing block");
  for (const link of ctas.filter(l => l.cta === "create")) assert.deepEqual(link, { href: "account/?auth=register", cta: "create", text: "Create your GamID" });
  for (const link of ctas.filter(l => l.cta === "signin")) assert.deepEqual(link, { href: "account/?auth=signin", cta: "signin", text: "Sign in" });
  for (const link of links) {
    assert.doesNotMatch(link.href, /^(\/|https?:|\/\/)/, `${link.href} must be relative so it works under the GitHub Pages /gamid-testing/ base path`);
    assert.match(link.href, /^(\.\/|account\/\?auth=(register|signin))$/, "the only destinations are the landing itself and the existing account page");
  }
});

test("the landing page does not duplicate or replace authentication", () => {
  assert.doesNotMatch(landing, /type="password"|type="email"|autocomplete|supabase|signInWithPassword|fetch\(|XMLHttpRequest|localStorage|sessionStorage|access_token/i);
  assert.doesNotMatch(landing, /Signed in as|Welcome back|Your session|Log ?out|Sign ?out/i, "the landing page never infers or displays authentication state");
});

test("the illustration is clearly presented as non-interactive example material, not an account", () => {
  const showcase = /<div class="showcase"[\s\S]*?<\/div>\s*<\/section>/.exec(landing)[0];
  assert.match(showcase, /aria-hidden="true"/);
  assert.match(showcase, /EXAMPLE/);
  assert.match(showcase, /Illustration only — not a real profile/);
  assert.match(showcase, /@yourhandle/);
  assert.doesNotMatch(showcase, /<a\b|<button|<input|<select|tabindex|onclick/i, "nothing inside the illustration is interactive");
  assert.match(landingCss, /\.showcase\{[^}]*pointer-events:none[^}]*\}/);
});

test("no real identity, private data, or other feature's data appears in the anonymous landing markup", () => {
  assert.doesNotMatch(landing, /@black\b|\bblack\b/i, "the real @black identity never appears");
  assert.doesNotMatch(landing, /[\w.+-]+@[\w-]+\.[\w.-]+/, "no email address");
  assert.doesNotMatch(landing, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "no ids");
  assert.doesNotMatch(landing, /gamid_handle|display_name|entity_id|qr_public_token|get_public_identity/i);
  assert.doesNotMatch(landing, /discord|league of legends|riot|op\.gg|steam|verified/i, "no Discord/League/Riot content or trust claims");
  assert.ok(/@yourhandle/.test(landing) && (landing.match(/@[a-z]+/gi) || []).every(handle => ["@handle", "@yourhandle"].includes(handle.toLowerCase())), "the only handles are generic placeholders");
});

test("the landing page makes no network calls and names no Supabase project (no Production access is possible from it)", () => {
  assert.doesNotMatch(landing + landingCss, /supabase\.co|https?:\/\/(?!schema\.org)/i, "no external URLs at all");
  assert.doesNotMatch(landing, /import |<script/);
});

test("the landing layout is responsive: mobile-first, tap-sized CTAs, contained illustration, reduced-motion aware", () => {
  assert.match(landing, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/);
  assert.match(landing, /<html lang="en">/);
  assert.match(landingCss, /\.btn\{[^}]*min-height:3\.4rem/, "CTAs are at least 44px tall");
  assert.match(landingCss, /\.showcase\{[^}]*overflow:clip/, "the spinning ring cannot create horizontal scroll (its square bounding box is wider than the viewport on phones)");
  assert.match(landingCss, /body\{[^}]*overflow-x:clip/);
  assert.match(landingCss, /@media\(prefers-reduced-motion:reduce\)\{\.orbit-ring\{animation:none\}\}/);
  assert.match(landingCss, /@media\(min-width:34rem\)/);
  assert.match(landingCss, /@media\(min-width:56rem\)/);
  assert.match(landingCss, /\.cta-row\{display:grid;gap:\.7rem/, "on phones the CTAs stack full-width");
  assert.doesNotMatch(landingCss, /min-width:\s*\d{3,}px|width:\s*\d{4,}px/, "no fixed pixel widths that could force horizontal scroll");
});

// ------------------------------------------------------------------------------------------------ deep link into the existing account flow

test("the account deep link only chooses a tab: signin and register are recognised, everything else is ignored", () => {
  assert.equal(authTabFromSearch("?auth=signin"), "signin");
  assert.equal(authTabFromSearch("?auth=register"), "register");
  assert.equal(authTabFromSearch("?x=1&auth=signin&y=2"), "signin");
  for (const bad of ["", "?", "?auth=", "?auth=SIGNIN", "?auth=admin", "?auth=signin,register", "?auth=%3Cscript%3E", "?auth[]=signin", "?authx=signin", "?Auth=signin"]) assert.equal(authTabFromSearch(bad), null, bad);
  assert.equal(authTabFromSearch(), null);
});

test("stripping the deep-link parameter preserves every other query parameter", () => {
  assert.equal(searchWithoutAuth("?auth=signin"), "");
  assert.equal(searchWithoutAuth("?auth=register&connection=discord&result=connected"), "?connection=discord&result=connected");
  assert.equal(searchWithoutAuth("?a=1&auth=signin&b=2"), "?a=1&b=2");
  assert.equal(searchWithoutAuth("?keep=1"), "?keep=1");
  assert.equal(searchWithoutAuth(""), "");
});

test("the account page applies the deep link only to the existing auth view and never touches a session", () => {
  const hook = accountJs.slice(accountJs.indexOf("// Landing-page deep link (/account/?auth=signin"));
  assert.match(hook, /authTabFromSearch\(location\.search\)/);
  assert.match(hook, /document\.getElementById\("authView"\)\.classList\.contains\("is-active"\)/, "only when the visitor is looking at the auth view (a signed-in owner is unaffected)");
  assert.match(hook, /\.click\(\)/, "it reuses the existing tab buttons");
  assert.doesNotMatch(hook, /api\.|signIn|signUp|restoreSession|createSoloIdentity|routeAuthenticated|access_token|localStorage/, "no auth or session logic");
  assert.doesNotMatch(hook, /discord|league|riot|connection/i);
  // it runs after the normal routing decision, so it cannot change where an authenticated user lands
  assert.ok(accountJs.indexOf("await routeAuthenticated();\n} catch { showView(\"auth\"); }") < accountJs.indexOf("// Landing-page deep link (/account/?auth=signin"));
});

test("/account/ keeps its existing behavior: Create account is still the default tab and every auth control is intact", () => {
  assert.match(accountHtml, /<button id="registerTab" class="active" role="tab">Create account<\/button><button id="signinTab" role="tab">Sign in<\/button>/);
  assert.match(accountHtml, /<form id="signinForm" hidden novalidate>/);
  assert.doesNotMatch(accountHtml, /<form id="registerForm"[^>]*hidden/);
  for (const id of ["registerForm", "signinForm", "forgotForm", "recoveryForm", "onboardingForm", "identityView", "signOutButton", "verifyView", "connectionsSection", "leagueSection"]) assert.ok(accountHtml.includes(`id="${id}"`), id);
  for (const marker of ["registerTab", "signinTab", "routeAuthenticated", "consumeRedirectSession", "FRONTEND_CONNECTABLE", "LEAGUE_REGIONS", "runLeagueLookup"]) assert.ok(accountJs.includes(marker), `${marker} must still exist (auth / Discord / League untouched)`);
});

test("routing for authenticated users is unchanged: anonymous -> auth, session without identity -> onboarding, session with identity -> YOUR GAMID", () => {
  assert.equal(authLanding(null, null), "auth");
  assert.equal(authLanding({ access_token: "x" }, null), "onboarding");
  assert.equal(authLanding({ access_token: "x" }, {}), "onboarding");
  assert.equal(authLanding({ access_token: "x" }, { entity_id: "e1" }), "identity");
});

// ------------------------------------------------------------------------------------------------ public routes unchanged

test("public @GamID routing is unchanged: the 404 redirector and the public route still exist and do not involve the landing page", async () => {
  assert.match(notFound, /var match = path\.match\(\/\\\/@\(\[\^\/\]\+\)\\\/\?\$\/\);/);
  assert.match(notFound, /location\.replace\(base \+ "\/public\/index\.html\?handle=" \+ encodeURIComponent\(handle\) \+ location\.search\);/);
  assert.ok(await exists("../dist/public/index.html") && await exists("../dist/public/public.js"));
  for (const file of ["../dist/public/index.html", "../dist/public/public.js"]) assert.doesNotMatch(await read(file), /landing\.css|account\/\?auth=|data-cta/);
  assert.doesNotMatch(landing, /public\/index\.html|\/@/, "the landing page links to no profile");
});

// ------------------------------------------------------------------------------------------------ the old prototype is preserved, outside the public site

test("the Slice 1 Intro lab is preserved in the repository but no longer lives in the deployed tree", async () => {
  assert.equal(await exists("../dist/app.js"), false, "the lab controller is no longer in dist/");
  assert.match(lab, /NovaRift/);
  assert.match(lab, /id="presetSelect"/);
  assert.match(lab, /Prototype controls only/);
  assert.match(lab, /href="\.\.\/\.\.\/dist\/styles\.css"/);
  assert.match(lab, /src="\.\.\/\.\.\/dist\/assets\/gamid-intro\.mp4"/);
  assert.match(labApp, /from "\.\.\/\.\.\/dist\/transition-engine\.js"/);
  assert.ok(await exists("../prototypes/slice-1-intro-lab/README.md"));
  const readme = await read("../prototypes/slice-1-intro-lab/README.md");
  assert.match(readme, /\*\*not\*\* deployed/);
  assert.match(readme, /internal reference/);
  // every dist file the lab points at still exists
  for (const target of [...lab.matchAll(/(?:href|src|poster)="(\.\.\/\.\.\/dist\/[^"]+)"/g)].map(match => match[1])) assert.ok(await exists(`../prototypes/slice-1-intro-lab/${target}`), target);
});

test("the shared Intro engine used by the real product (account preview, public profile) is untouched", async () => {
  assert.ok(await exists("../dist/styles.css") && await exists("../dist/transition-engine.js"));
  assert.match(await read("../dist/account/intro-preview.html"), /<link rel="stylesheet" href="\.\.\/styles\.css" \/>/);
  assert.match(await read("../dist/account/intro-preview.js"), /from "\.\.\/transition-engine\.js"/);
  assert.match(accountJs, /from "\.\.\/transition-engine\.js"/);
});

test("the deploy workflow still publishes only dist/, so the preserved lab has no public route", () => {
  assert.match(workflow, /rsync -a --exclude '\/assets\/gamid-intro\.mp4' dist\/ /);
  assert.doesNotMatch(workflow, /prototypes/);
});

test("nothing in the deployed tree links to the lab or its old files", async () => {
  const files = (await listFiles(new URL("../dist/", import.meta.url))).filter(file => /\.(html|js|css)$/i.test(file.pathname) && !/qrcode\.min\.js$/i.test(file.pathname));
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), /prototypes\/|slice-1-intro-lab/, `${file.pathname} must not reference the lab`);
});
