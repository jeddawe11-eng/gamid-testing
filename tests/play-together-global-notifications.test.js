import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Play Together inherits the same shell from its authenticated client; no page-specific center or subscription',()=>{
 const js=read('dist/play-together/play-together.js'),client=read('dist/account/supabase-client.js'),shell=read('dist/app/authenticated-shell.js');
 assert.match(js,/account\/supabase-client.js/);assert.doesNotMatch(js,/mountGlobalNotifications|createNotificationCenter|notificationSubscriber/);
 assert.match(client,/import\("\.\.\/app\/authenticated-shell.js"\)/);
 assert.match(shell,/notifications\/notification-center.js/);assert.match(shell,/notifications\/notification-realtime.js/);
 assert.doesNotMatch(shell,/localStorage|setInterval|new WebSocket/);
});
