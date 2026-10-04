import {createAuthenticatedShell} from '/dist/app/authenticated-shell.js';
let owner='local-fixture',read=false;
const note={notification_id:1,type_key:'duo_invited',producer:'my_duo',destination:'account.my_duo',actor_handle:'fixture',created_at:new Date().toISOString(),read_at:null};
const client={restoreSession:async()=>owner?{access_token:'local-fixture'}:null,userIdFromToken:()=>owner,
 getMyUsage:async()=>({storage:{used_bytes:84_000_000,quota_bytes:200_000_000,remaining_bytes:116_000_000,percentage:42,state:'NORMAL',reserved_bytes:0,enforcement_active:true},media:{intro:32_000_000,wall:50_000_000,avatar:2_000_000},quotas:[{name:'Wall Layers',used:7,limit:null},{name:'Wall Assets (images + videos)',used:16,limit:60},{name:'Wall Videos',used:4,limit:10},{name:'Wall Images',used:12,limit:null,note:'Shares the Wall Assets allowance'}]}),
 getMyNotifications:async()=>[{...note,read_at:read?new Date().toISOString():null}],getMyUnreadNotificationCount:async()=>read?0:1,markMyNotificationsRead:async()=>{read=true;return 1;},markAllMyNotificationsRead:async()=>{read=true;return 1;}};
delete document.documentElement.dataset.gamidSurface;
const shell=createAuthenticatedShell({client,subscribe:()=>()=>{}});await shell.sync();
document.querySelector('#result').textContent='Shared Usage and Notifications mounted.';
document.querySelector('#anonymous').addEventListener('click',async()=>{owner=null;await shell.sync();document.querySelector('#result').textContent='Owner controls removed; fixture signed out.';});
