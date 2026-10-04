import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountGlobalNotifications } from "../dist/play-together/global-notifications.js";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Play Together mounts the same global center with the authenticated owner API and subscription, then tears down", async () => {
  const host = {}, body = {}, api = {}, subscribe = () => {}; let options, mounted, stopped = false, exit;
  const navigated = [];
  await mountGlobalNotifications({ doc: { getElementById: id => id === "notificationsHost" ? host : null, body }, win: { addEventListener: (type, callback) => { assert.equal(type, "pagehide"); exit = callback; } }, client: api, subscribe, navigate: url => navigated.push(url), createCenter: value => { options = value; return { mount: async (...args) => { mounted = args; }, destroy: () => { stopped = true; } }; } });
  assert.equal(options.api, api); assert.equal(options.subscribe, subscribe); assert.deepEqual(mounted, [host, body]);
  options.onNavigate("account.my_duo"); options.onNavigate("account.my_crew"); options.onNavigate("https://evil.example");
  assert.deepEqual(navigated, ["../account/#my-duo", "../account/#my-crew"]);
  exit(); assert.equal(stopped, true);
});

test("global Notifications integration uses existing CSS, center, owner RPCs and Realtime rather than a new store", () => {
  const html = read("dist/play-together/index.html"), js = read("dist/play-together/play-together.js"), adapter = read("dist/play-together/global-notifications.js");
  assert.match(html, /id="notificationsHost"/); assert.match(html, /\.\.\/notifications\/notifications.css/);
  assert.match(adapter, /\.\.\/notifications\/notification-center.js/); assert.match(adapter, /\.\.\/notifications\/notification-realtime.js/);
  assert.match(adapter, /\.\.\/account\/supabase-client.js/); assert.doesNotMatch(adapter, /localStorage|setInterval|create table|new WebSocket/);
  assert.ok(js.indexOf("await mountGlobalNotifications()") > js.indexOf('startup.state==="AUTH_REQUIRED"'));
});
