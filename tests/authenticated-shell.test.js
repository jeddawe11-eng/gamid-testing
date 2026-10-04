import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthenticatedShell, shellEligible } from "../dist/app/authenticated-shell.js";
import { AUTH_SESSION_EVENT } from "../dist/account/supabase-client.js";
import { auditAuthenticatedSurfaces } from "../scripts/check-authenticated-shell.mjs";

function fixture() {
  let user = null;
  const events = new Map(), created = [], urls = [], nodes = [];
  const doc = { documentElement: { dataset: {} }, body: {}, querySelector: () => header, createElement: () => ({ remove() { this.removed = true; } }) };
  const header = { querySelector: () => null, append: node => nodes.push(node) };
  const win = { location: {}, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key), CustomEvent: class { constructor(type, options) { Object.assign(this, options); this.type = type; this.defaultPrevented = false; } preventDefault() { this.defaultPrevented = true; } }, dispatchEvent(event) { events.get(event.type)?.(event); return !event.defaultPrevented; } }; win.parent = win;
  const client = { restoreSession: async () => user ? { access_token: "fixture" } : null, userIdFromToken: () => user };
  const subscribe = () => {};
  const shell = createAuthenticatedShell({ doc, win, client, subscribe, createUsage:()=>({mount:async()=>{},refresh:()=>{},destroy:()=>{}}), navigate: url => urls.push(url), createCenter: options => { const center = { options, destroyed: false, mount: async () => {}, destroy() { this.destroyed = true; } }; created.push(center); return center; } });
  return { shell, client, doc, win, events, created, urls, nodes, subscribe, setUser: id => { user = id; } };
}

test("all top-level authenticated surfaces inherit one center; anonymous visitors have no owner controls", async () => {
  const f = fixture(); await f.shell.sync(); assert.equal(f.created.length, 0);
  f.setUser("owner-a"); await Promise.all([f.shell.sync(), f.shell.sync(), f.shell.sync()]);
  assert.equal(f.created.length, 1); assert.equal(f.nodes.length, 1);
  assert.equal(f.created[0].options.api, f.client); assert.equal(f.created[0].options.subscribe, f.subscribe);
  assert.equal(f.nodes[0].id, "notificationsHost");
});

test("sign-out and cross-tab owner changes immediately remove the old log; subsequent sign-in mounts only the new owner", async () => {
  const f = fixture(); f.setUser("a"); await f.shell.sync();
  f.setUser(null); f.events.get(AUTH_SESSION_EVENT)(); assert.equal(f.created[0].destroyed, true); assert.equal(f.nodes[0].removed, true); await f.shell.sync();
  f.setUser("b"); f.events.get("storage")({ key: "gamid.testing.auth.session.v1" }); await f.shell.sync();
  assert.equal(f.created.length, 2); assert.equal(f.shell.center, f.created[1]);
  f.setUser("c"); await f.shell.sync(); assert.equal(f.created[1].destroyed, true); assert.equal(f.created.length, 3);
});

test("bfcache navigation tears down subscription and restores one center without retaining owner state", async () => {
  const f = fixture(); f.setUser("a"); await f.shell.sync();
  f.events.get("pagehide")(); assert.equal(f.created[0].destroyed, true); assert.equal(f.shell.center, null);
  f.events.get("pageshow")(); await f.shell.sync(); assert.equal(f.created.length, 2);
  await f.shell.sync(); assert.equal(f.created.length, 2);
  f.shell.destroy(); assert.equal(f.events.size, 0);
});

test("auth change during initial notification read cannot retain the former owner's center", async () => {
  const f = fixture(); let release; f.setUser("a");
  // Hold the existing center's initial mount/read, then sign out while it is in flight.
  const gate = new Promise(resolve => { release = resolve; });
  f.client.restoreSession = async () => { await gate; return { access_token: "fixture" }; };
  const pending = f.shell.sync(); await Promise.resolve(); f.setUser(null); release(); await pending;
  assert.equal(f.created.length, 0);
});

test("typed destinations preserve Account focus and use safe cross-page links; unknown destinations cannot navigate", async () => {
  const f = fixture(); f.setUser("a"); await f.shell.sync(); const navigate = f.created[0].options.onNavigate;
  navigate("account.my_duo"); navigate("account.my_crew"); navigate("https://evil.example");
  assert.equal(f.urls.length, 2); assert.match(f.urls[0], /\/account\/#my-duo$/); assert.match(f.urls[1], /\/account\/#my-crew$/);
  f.win.addEventListener("gamid:notification-navigate", event => event.preventDefault()); navigate("account.my_duo"); assert.equal(f.urls.length, 2);
});

test("public visitor pages and embedded preview/rendering frames do not mount an extra owner log or socket", async () => {
  const f = fixture(); f.setUser("a"); f.doc.documentElement.dataset.gamidSurface = "public";
  assert.equal(shellEligible(f.doc, f.win), false); await f.shell.sync(); assert.equal(f.created.length, 0);
  delete f.doc.documentElement.dataset.gamidSurface; f.win.parent = {}; await f.shell.sync(); assert.equal(f.created.length, 0);
});

test("audit discovers all existing authenticated entry graphs, including Crew owner preview; visitor and frame routes remain separate", () => {
  const surfaces = auditAuthenticatedSurfaces(fileURLToPath(new URL("../dist", import.meta.url)));
  assert.deepEqual(surfaces.filter(s => s.mode === "authenticated").map(s => s.path), ["account/index.html", "crew/index.html", "play-together/index.html", "wall-editor/index.html"]);
  assert.equal(surfaces.find(s => s.path === "public/index.html").mode, "public");
  assert.equal(surfaces.find(s => s.path === "account/intro-preview.html").mode, "renderer/static");
});

test("a future authenticated surface inherits automatically, but missing header, duplicate mount and blocked Realtime fail the audit", () => {
  const root = mkdtempSync(join(tmpdir(), "gamid-shell-test-"));
  try {
    mkdirSync(join(root, "account")); mkdirSync(join(root, "future"));
    writeFileSync(join(root, "account/supabase-client.js"), ""); writeFileSync(join(root, "future/edit.js"), 'import {rpc} from "../account/supabase-client.js";');
    const page = join(root, "future/index.html"), script = '<script type="module" src="edit.js"></script>';
    writeFileSync(page, '<header>Future management surface</header>' + script);
    assert.equal(auditAuthenticatedSurfaces(root)[0].mode, "authenticated");
    writeFileSync(page, script); assert.throws(() => auditAuthenticatedSurfaces(root), /requires a shared-shell header/);
    writeFileSync(page, '<header id="notificationsHost"></header>' + script); assert.throws(() => auditAuthenticatedSurfaces(root), /mounting belongs to the shared shell/);
    writeFileSync(page, '<meta http-equiv="Content-Security-Policy" content="connect-src self"><header></header>' + script); assert.throws(() => auditAuthenticatedSurfaces(root), /CSP blocks/);
    writeFileSync(page, '<header></header>' + script);
    writeFileSync(join(root, "future/edit.js"), 'import {rpc} from "../account/supabase-client.js"; createNotificationCenter({});');
    assert.throws(() => auditAuthenticatedSurfaces(root), /duplicate page notification lifecycle/);
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("gamid-shell-test-")) throw Error("Unsafe fixture cleanup path");
    rmSync(root, { recursive: true, force: true });
  }
});
