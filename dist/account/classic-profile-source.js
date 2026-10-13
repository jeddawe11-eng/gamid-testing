// Saved owner data adapted to the EXISTING Classic renderer. This module has no
// markup, write API, draft access, or authority over public visibility / RLS.
// A published owner uses the public projection verbatim. A private owner reads
// their own existing authenticated APIs and applies the saved section opt-ins.
import { buildLibraryRows, normalizeManualGames, rowGameKey } from './game-platforms.js';

const pick = (row, keys) => Object.fromEntries(keys.filter(key => row?.[key] != null).map(key => [key, row[key]]));
const identityFields = ['gamid_handle','display_name','avatar_media_reference','bio','role_keys','primary_role_key','role_catalog'];
const leagueFields = ['game_name','tag_line','platform_id','profile_icon_id','trust_status','identity_source','data_source'];
const statFields = ['solo_rank_state','solo_tier','solo_division','solo_lp','solo_wins','solo_losses','data_source','trust_status','fetched_at','is_public'];

export function privateClassicProjection({ profile, visibility, about, connections, league, duo, crews, games }) {
  const on = key => visibility.some(row => row.section_key === key && row.is_public === true);
  const identity = pick(profile, identityFields);
  if (on('education_work')) Object.assign(identity, pick(profile, ['education_work_status','institution','field_of_study','education_work_catalog']));
  const sections = {};
  for (const c of connections.filter(row => row.connected && row.is_public)) {
    if (c.provider_key === 'discord') sections.discord = { display_name:c.provider_display_name, username:c.provider_username, trust_status:c.trust_status };
    if (c.provider_key === 'steam') sections.steam = { persona_name:c.provider_display_name, trust_status:'CONNECTED' };
  }
  if (league?.is_public) {
    sections.league = { ...pick(league, leagueFields), updated_at:league.fetched_at };
    if (games.show_game_stats) for (const key of ['rank_state','tier','division','lp','wins','losses']) sections.league[key] = league[`solo_${key}`];
  }
  const partner = duo.find(row => row.relation === 'DUO' && row.show_public && row.is_published);
  if (partner) sections.duo = pick(partner, ['gamid_handle','display_name','avatar_media_reference']);
  if (crews.length) sections.crews = crews;
  identity.public_sections = sections;
  const labels = (keys, catalog, keyField) => (keys || []).map(key => catalog?.find(row => row[keyField] === key)).filter(Boolean);
  const extras = {
    member_since_year:about?.member_since_year, member_since_date:about?.member_since_date,
    about_location:about?.show_location ? about.about_location : null,
    about_languages:about?.show_languages ? labels(about.about_languages, about.catalogs?.languages, 'code') : [],
    about_genres:about?.show_genres ? labels(about.about_genres, about.catalogs?.genres, 'key') : [],
  };
  return { identity, extras };
}

// Same owner-library merge as Account. Only presentation fields survive; hidden
// playtime, game identities and verification details never enter the renderer.
export function ownerGamesProjection(discovered, manual, profiles, league, settings, display) {
  return buildLibraryRows(discovered, normalizeManualGames(manual)).map(row => {
    const key = rowGameKey(row), game = row.game;
    const platforms = (row.manual?.platforms || []).map(p => ({ key:p.key, label:p.label, source:'MANUAL' }));
    const result = { game_key:key, name:row.kind === 'manual' ? row.name : game.recognized_name || game.game_name,
      sources:row.kind === 'manual' ? ['MANUAL'] : ['DISCOVERED_FROM_STEAM', ...(row.manual ? ['MANUAL'] : [])], platforms };
    if (row.kind === 'discovered') {
      platforms.unshift({ key:'steam', label:'Steam', source:'DISCOVERED_FROM_STEAM' });
      if (display.show_game_playtime) result.playtime_minutes = game.playtime_minutes;
    }
    if (settings.show_game_stats) {
      if (key === 'league_of_legends' && league?.is_public) result.stats = { league:pick(league, statFields) };
      else {
        const profile = profiles.find(p => p.game_key === key && p.is_public);
        if (profile) result.stats = { profile:pick(profile, ['game_key','identity_source','data_source','data_source_class','trust_status','fields','fetched_at','is_public']) };
      }
    }
    return result;
  });
}

export async function createOwnerClassicSource(api) {
  await api.restoreSession();
  const owner = api.userIdFromToken();
  if (!owner) throw Error('AUTH_REQUIRED');
  const check = () => { if (api.userIdFromToken() !== owner) throw Error('OWNER_CHANGED'); };
  const profile = await api.getIdentityProfile(); check();
  if (!profile?.entity_id || !profile.gamid_handle) throw Error('IDENTITY_NOT_FOUND');
  const handle = profile.gamid_handle;
  const urls = new Set();
  const ownMedia = async (path, loader) => {
    check(); let url = null;
    try { url = await loader(path); } catch { /* Classic's existing safe media fallback. */ }
    if (url) urls.add(url);
    check(); return url;
  };
  let identity, extras, socials, favorites, crews, bannerUrl = null, gamePage, discordCard;
  if (profile.visibility === 'PUBLIC') {
    [identity, extras, socials, favorites, crews, discordCard] = await Promise.all([
      api.getPublicIdentity(handle), api.getPublicProfileExtras(handle), api.getPublicSocialLinks(handle),
      api.getPublicFavoriteGames(handle), api.getPublicCrews(handle), api.getPublicDiscordCard(handle),
    ]);
    if (!identity) throw Error('IDENTITY_NOT_FOUND');
    bannerUrl = api.publicBannerUrl(handle);
    gamePage = options => api.getPublicMyGames(handle, options);
  } else {
    const [visibility, about, connections, league, duo, memberships, settings, display, links, banner, cardSettings] = await Promise.all([
      api.getMySectionVisibility(), api.getMyAbout(), api.getMyConnections(), api.getMyLeagueProfile(), api.getMyDuo(),
      api.getMyCrews(), api.getMyPublicGamesSettings(), api.getMyGameDisplaySettings(), api.getMySocialLinks(), api.getMyBanner(), api.getMyDiscordProfileCard(),
    ]);
    check();
    // Crew Walls and OTHER people retain their public gate even in owner preview.
    crews = (await Promise.all(memberships.filter(c => c.my_status === 'ACTIVE').map(async c => {
      const wall = await api.getPublicCrewWall(c.crew_id);
      if (!wall) return null;
      const members = await api.getCrewMembers(c.crew_id);
      return { crew_id:c.crew_id, crew_name:c.crew_name, game_key:c.game_key, game_name:c.game_name, role:c.my_role, member_count:c.member_count,
        members:members.filter(m => m.status === 'ACTIVE' && m.is_published).slice(0,6).map(m => ({ handle:m.gamid_handle, display_name:m.display_name, avatar_media_reference:m.avatar_media_reference })) };
    }))).filter(Boolean);
    ({ identity, extras } = privateClassicProjection({ profile, visibility, about, connections, league, duo, crews, games:settings }));
    socials = links; favorites = []; discordCard = null;
    if (cardSettings?.connected && cardSettings.show_profile_card && cardSettings.show_on_gamid && cardSettings.my_socials_matches) {
      const discord = connections.find(c => c.provider_key === 'discord' && c.connected && c.is_public);
      const link = links.find(l => l.platform_key === 'discord' && l.kind === 'profile');
      if (discord && link) discordCard = { discord_id:link.account_id, username:discord.provider_username, display_name:discord.provider_display_name, avatar:discord.provider_avatar_url };
    }
    let library = [];
    if (settings.show_my_games) {
      const readDiscovered = async () => {
        const rows = [];
        for (;;) {
          const page = await api.getMyDiscoveredGames('steam',1000,rows.length); check();
          rows.push(...page);
          if (page.length < 1000) return rows;
        }
      };
      const [discovered, manual, profiles, favoriteKeys] = await Promise.all([
        readDiscovered(), api.getMyManualGames(), api.getMyGameProfiles(), api.getMyFavoriteGames(),
      ]);
      library = ownerGamesProjection(discovered, manual, profiles, league, settings, display);
      favorites = favoriteKeys.map(key => library.find(game => game.game_key === key)).filter(Boolean).map(game => ({ game_key:game.game_key, name:game.name, year:game.year }));
    }
    gamePage = async ({ query = '', limit = 30, offset = 0 } = {}) => {
      const filtered = library.filter(game => game.name.toLowerCase().includes(query.toLowerCase()));
      return { library_count:library.length, total_count:filtered.length, games:filtered.slice(offset, offset + Math.min(limit,50)) };
    };
    if (library.length) identity.public_sections.my_games = await gamePage({ limit:6 });
    if (banner.banner_path) bannerUrl = await ownMedia(banner.banner_path, api.loadMyBanner);
    extras.has_banner = Boolean(bannerUrl);
  }
  check();
  // Intro is intentionally absent; the Classic frame receives videoUrl:"".
  identity = { ...identity, intro_derivative_path:null };
  const avatarPath = identity.avatar_media_reference;
  const avatarUrl = avatarPath ? await ownMedia(avatarPath, api.loadAvatar) : null;
  check();
  return {
    owner, handle,
    getPublicIdentity:async () => { check(); return identity; },
    getPublicProfileExtras:async () => { check(); return extras; },
    getPublicSocialLinks:async () => { check(); return socials; },
    getPublicFavoriteGames:async () => { check(); return favorites; },
    getPublicCrews:async () => { check(); return crews; },
    getPublicDiscordCard:async () => { check(); return discordCard; },
    getPublicMyGames:async (_handle, options) => { check(); const page = await gamePage(options); check(); return page; },
    loadPublicAvatar:async path => { check(); return path === avatarPath ? avatarUrl : api.loadPublicAvatar(path); },
    publicBannerUrl:() => bannerUrl,
    dispose:() => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); },
  };
}
