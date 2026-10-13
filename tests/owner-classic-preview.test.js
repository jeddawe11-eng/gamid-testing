import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOwnerClassicSource, privateClassicProjection, ownerGamesProjection } from '../dist/account/classic-profile-source.js';

const data = () => ({
  profile:{ entity_id:'own', gamid_handle:'owner', display_name:'Saved Name', bio:'Saved bio', role_keys:['player'], primary_role_key:'player', role_catalog:[{key:'player',label:'Player'}], education_work_status:'student', account_email:'DO_NOT_RENDER', avatar_media_reference:null, intro_derivative_path:'NEVER_PLAY' },
  visibility:[], about:{ about_location:'Private city', about_languages:['ar'], about_genres:['rpg'], show_location:false, show_languages:false, show_genres:false, catalogs:{languages:[{code:'ar',label:'Arabic'}],genres:[{key:'rpg',label:'RPG'}]} },
  connections:[{provider_key:'discord',connected:true,is_public:false,provider_username:'PRIVATE_DISCORD',provider_account_id:'DO_NOT_RENDER'}],
  league:{is_public:false,game_name:'PRIVATE_LEAGUE',solo_tier:'GOLD'}, duo:[{relation:'DUO',show_public:true,is_published:false,gamid_handle:'PRIVATE_PARTNER'}], crews:[], games:{show_game_stats:false},
});

test('private owner preview applies every saved Classic opt-in and excludes editor-only data', () => {
  const rows = data(), closed = privateClassicProjection(rows);
  assert.deepEqual(closed.identity.public_sections, {});
  assert.equal(closed.identity.education_work_status,undefined);
  assert.equal(closed.extras.about_location,null);
  assert.deepEqual(closed.extras.about_languages,[]);
  assert.doesNotMatch(JSON.stringify(closed),/DO_NOT_RENDER|PRIVATE_|NEVER_PLAY|Private city/);
  rows.visibility = [{section_key:'education_work',is_public:true}];
  rows.about.show_location = rows.about.show_languages = rows.about.show_genres = true;
  rows.connections[0].is_public = rows.league.is_public = rows.duo[0].is_published = true;
  const opened = privateClassicProjection(rows);
  assert.equal(opened.identity.education_work_status,'student');
  assert.equal(opened.extras.about_location,'Private city');
  assert.equal(opened.extras.about_languages[0].label,'Arabic');
  assert.equal(opened.extras.about_genres[0].label,'RPG');
  assert.equal(opened.identity.public_sections.discord.username,'PRIVATE_DISCORD');
  assert.equal(opened.identity.public_sections.duo.gamid_handle,'PRIVATE_PARTNER');
  assert.equal(opened.identity.public_sections.league.tier,undefined);
  rows.games.show_game_stats = true;
  assert.equal(privateClassicProjection(rows).identity.public_sections.league.tier,'GOLD');
});

test('game presentation preserves sources and platforms; saved playtime/stats controls are independent', () => {
  const discovered = [{recognized_game_key:'league_of_legends',recognized_name:'League of Legends',playtime_minutes:200,external_game_id:'PRIVATE_APP'}];
  const manual = [{game_key:'league_of_legends',display_name:'League of Legends',platforms:[{platform_key:'windows_pc',display_name:'PC'}]}];
  const league = {is_public:true,solo_rank_state:'RANKED',solo_tier:'GOLD',source_url:'PRIVATE_URL'};
  const hidden = ownerGamesProjection(discovered,manual,[],league,{show_game_stats:false},{show_game_playtime:false});
  assert.equal(hidden.length,1); assert.deepEqual(hidden[0].sources,['DISCOVERED_FROM_STEAM','MANUAL']);
  assert.equal(hidden[0].playtime_minutes,undefined); assert.equal(hidden[0].stats,undefined);
  assert.doesNotMatch(JSON.stringify(hidden),/PRIVATE_APP|PRIVATE_URL/);
  const shown = ownerGamesProjection(discovered,manual,[],league,{show_game_stats:true},{show_game_playtime:true});
  assert.equal(shown[0].playtime_minutes,200); assert.equal(shown[0].stats.league.solo_tier,'GOLD');
});

function fixture({ visibility='DRAFT', owner='session-owner' } = {}) {
  let uid = owner;
  const rows = data(), calls=[];
  const read = (name, result) => async (...args) => {calls.push({name,args});return result;};
  const publicIdentity = {gamid_handle:'owner',display_name:'Saved Public',public_sections:{my_games:{library_count:1,total_count:1,games:[{name:'Saved Game',sources:['MANUAL'],platforms:[]}]}},intro_derivative_path:'NEVER_PLAY'};
  const api = {
    restoreSession:read('restore',{}),userIdFromToken:() => uid,
    getIdentityProfile:read('profile',{...rows.profile,visibility}),
    getMySectionVisibility:read('visibility',[]),getMyAbout:read('about',rows.about),getMyConnections:read('connections',[]),getMyLeagueProfile:read('league',null),getMyDuo:read('duo',[]),getMyCrews:read('crews',[]),
    getMyPublicGamesSettings:read('settings',{show_my_games:false}),getMyGameDisplaySettings:read('display',{}),getMySocialLinks:read('socials',[]),getMyBanner:read('banner',{}),getMyDiscordProfileCard:read('card',null),
    getPublicIdentity:read('publicIdentity',publicIdentity),getPublicProfileExtras:read('publicExtras',{}),getPublicSocialLinks:read('publicSocials',[]),getPublicFavoriteGames:read('publicFavorites',[]),getPublicCrews:read('publicCrews',[]),getPublicDiscordCard:read('publicCard',null),getPublicMyGames:read('publicGames',publicIdentity.public_sections.my_games),publicBannerUrl:()=>null,
    loadAvatar:read('avatar',null),loadPublicAvatar:read('publicAvatar',null),
  };
  return {api,calls,changeOwner:next=>{uid=next;},publicIdentity};
}

test('published owner uses the real public projection, ignores another handle, and removes only Intro', async () => {
  const {api,calls,publicIdentity}=fixture({visibility:'PUBLIC'});
  const source=await createOwnerClassicSource(api);
  const identity=await source.getPublicIdentity('someone-else');
  assert.equal(identity.gamid_handle,'owner');assert.equal(identity.intro_derivative_path,null);
  assert.deepEqual(identity.public_sections,publicIdentity.public_sections);
  assert.ok(calls.filter(c=>c.name.startsWith('public')).every(c=>c.args[0]==='owner'));
  source.dispose();
});

test('private owner preview works with no save, publication, Wall or Intro APIs', async () => {
  const {api,calls}=fixture();const source=await createOwnerClassicSource(api);
  assert.equal((await source.getPublicIdentity()).display_name,'Saved Name');
  assert.equal((await source.getPublicIdentity()).intro_derivative_path,null);
  assert.equal(calls.some(c=>/^(save|publish|wall|intro)$/i.test(c.name)),false);
  source.dispose();
});

test('signed-out access is refused before any owner reads; account switching invalidates every snapshot accessor', async () => {
  const signedOut=fixture({owner:null});await assert.rejects(createOwnerClassicSource(signedOut.api),/AUTH_REQUIRED/);
  assert.equal(signedOut.calls.length,1);
  const next=fixture();const source=await createOwnerClassicSource(next.api);next.changeOwner('someone-else');
  await assert.rejects(source.getPublicIdentity(),/OWNER_CHANGED/);
  await assert.rejects(source.getPublicSocialLinks(),/OWNER_CHANGED/);
  await assert.rejects(source.getPublicMyGames('owner'),/OWNER_CHANGED/);
  const pending=fixture();pending.api.getMyAbout=async()=>{pending.changeOwner('someone-else');return {};};
  await assert.rejects(createOwnerClassicSource(pending.api),/OWNER_CHANGED/);
});

test('Account retains drafts in the same document; actual public renderer explicitly bypasses Wall and Intro only for owner preview', () => {
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const host=read('dist/account/classic-preview.js'),pub=read('dist/public/public.js'),html=read('dist/account/index.html');
  assert.match(host,/dialog\.showModal\(\)/); assert.match(host,/frame\?\.remove\(\)/);
  assert.doesNotMatch(host,/location\.(assign|replace)|set_my_|\.save\(|JSON\.stringify|localStorage\.setItem/);
  assert.match(pub,/ownerPreview \? Promise\.resolve\(null\) : getPublicWall/);
  assert.match(pub,/if \(ownerPreview\) \{\s+hasIntro = false;/);
  assert.match(pub,/createDesktopProfile\(/);assert.match(pub,/renderPublicSections\(/);assert.match(pub,/renderGamesPreview\(/);
  assert.doesNotMatch(html,/identity-preview|Live GamID identity preview/);
  assert.match(html,/Preview Your GamID Classic/);assert.match(html,/id="visibilityToggle"/);assert.match(html,/class="share-section"/);
});
