// Desktop Classic Profile (DEC-0005): at 1280px and wider - and only when no published, enabled Wall replaces the profile - the public page draws its own wide
// identity hero (Banner, Avatar, name, @handle, roles, education / work, bio, the real game count) and an About Me card, around the existing My Socials /
// My Duo / League / Steam panel and My Games. The Intro frame then plays the Intro only (hostReveal, exactly like the published-Wall path) and its transition
// reveals this profile; below 1280px nothing here is shown and the accepted mobile layout is untouched. Only real data is drawn: no invented statistics.
// Built with createElement / textContent only.
export const DESKTOP_QUERY = "(min-width: 80rem)";

const node = (doc, tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };

// -> { hero, about, show(), hide() }
export function createDesktopProfile({ doc = globalThis.document, profile, extras, gamesCount = 0, bannerUrl = null }) {
  const h = (tag, className, text) => node(doc, tag, className, text);
  // ---- hero
  const hero = h("section", "desk-hero"); hero.id = "desktopHero"; hero.setAttribute("aria-label", "Profile"); hero.hidden = true;
  const banner = h("div", "desk-banner");
  if (extras?.has_banner && bannerUrl) {
    const img = h("img", "desk-banner-img"); img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => { img.remove(); banner.classList.remove("has-image"); }, { once: true });   // a refused / failed Banner falls back to the gradient
    img.src = bannerUrl;
    banner.classList.add("has-image");
    banner.append(img);
  }
  const identity = h("div", "desk-identity");
  const avatar = h("div", "desk-avatar");
  if (profile.avatarUrl) { const img = h("img"); img.alt = `${profile.displayName} avatar`; img.src = profile.avatarUrl; avatar.append(img); }
  else avatar.append(h("span", "desk-avatar-initial", (profile.displayName || "G").trim().charAt(0).toUpperCase() || "G"));
  const copy = h("div", "desk-copy");
  copy.append(h("h1", "desk-name", profile.displayName), h("p", "desk-handle", profile.handle));
  const roles = [profile.primaryRole, ...(profile.secondaryRoles || [])].filter(Boolean);
  if (roles.length) {
    const list = h("ul", "desk-roles"); list.setAttribute("aria-label", "Gaming roles");
    roles.forEach((role, index) => list.append(h("li", index === 0 && profile.primaryRole ? "desk-role is-primary" : "desk-role", role)));
    copy.append(list);
  }
  if (profile.education) copy.append(h("p", "desk-education", profile.education));
  if (profile.bio) copy.append(h("p", "desk-bio", profile.bio));
  identity.append(avatar, copy);
  if (gamesCount > 0) {
    const stats = h("dl", "desk-stats");
    const item = h("div", "desk-stat");
    item.append(h("dd", "desk-stat-value", String(gamesCount)), h("dt", "desk-stat-label", gamesCount === 1 ? "Game" : "Games"));
    stats.append(item);
    identity.append(stats);
  }
  hero.append(banner, identity);

  // ---- About Me: Member Since always; Location / Languages / Favorite Genres only when the owner made them public (the server sends nothing otherwise)
  const about = h("section", "desk-about"); about.id = "desktopAbout"; about.setAttribute("aria-label", "About Me"); about.hidden = true;
  about.append(h("p", "public-section-label", "ABOUT ME"));
  const facts = h("dl", "desk-facts");
  const fact = (label, value) => { const row = h("div", "desk-fact"); row.append(h("dt", "", label)); if (typeof value === "string") row.append(h("dd", "", value)); else { const dd = h("dd"); dd.append(value); row.append(dd); } facts.append(row); };
  const chips = list => { const ul = h("ul", "desk-chips"); for (const item of list) ul.append(h("li", "desk-chip", item.label)); return ul; };
  if (typeof extras?.about_location === "string" && extras.about_location.trim()) fact("Location", extras.about_location.trim());
  if (Number.isInteger(extras?.member_since_year)) fact("Member Since", String(extras.member_since_year));
  const languages = Array.isArray(extras?.about_languages) ? extras.about_languages.filter(x => typeof x?.label === "string") : [];
  const genres = Array.isArray(extras?.about_genres) ? extras.about_genres.filter(x => typeof x?.label === "string") : [];
  if (languages.length) fact("Languages", chips(languages));
  if (genres.length) fact("Favorite Genres", chips(genres));
  about.append(facts);
  const hasAbout = facts.childElementCount > 0;

  return {
    hero, about,
    show() { hero.hidden = false; about.hidden = !hasAbout; },
    hide() { hero.hidden = true; about.hidden = true; },
  };
}
