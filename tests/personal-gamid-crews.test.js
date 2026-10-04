// MY CREW on the Personal GamID. The database rule (PUBLIC GamID + ACTIVE membership + existing Crew + PUBLISHED Crew Wall, automatic, no toggle) runs on TESTING in
// tests/integration/personal-gamid-crews-db.sql. These tests pin the recovered migration (20261003234309, recovered byte-for-byte from TESTING's migration history) and the
// public page's presentation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicCrews, crewsSection } from "../dist/public/public-crews.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ID = "11111111-2222-4333-8444-555555555555";
const ID2 = "99999999-2222-4333-8444-555555555555";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ""; this._text = ""; this.hidden = false; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) if (node) { node.parent = this; this.children.push(node); } }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
}
const doc = { createElement: tag => new El(tag) };
const all = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => all(child, predicate, out)); return out; };

// ---------- the recovered migration ----------
const fnOf = (sql, marker = "create or replace function private.get_public_identity_impl") => { const from = sql.indexOf(marker); return sql.slice(from, sql.indexOf("$$;", sql.indexOf("limit 1;", from)) + 3); };

test("recovered migration: the public identity function is the accepted one PLUS exactly one 'crews' branch - Discord, Steam, League (+ stats gate), My Games and My Duo are byte-for-byte unchanged", () => {
  const recovered = read("supabase/migrations/20261003234309_personal_gamid_crews.sql");
  const previous = fnOf(read("supabase/migrations/20261002150000_my_duo.sql"));
  const current = fnOf(recovered);
  const crewsBranch = current.slice(current.indexOf("        union all\n        -- Automatic My Crew V1"), current.indexOf("      ) x\n    )"));
  assert.ok(crewsBranch.length > 100, "the crews branch is present");
  assert.equal(current.replace(crewsBranch, ""), previous, "nothing else in the function changed");
  assert.match(recovered, /^-- My Crew on Personal GamID: extend the existing public identity boundary only\./);
});

test("recovered migration: the crews section requires an ACTIVE membership, an existing Crew and a PUBLISHED Crew Wall, inside the accepted PUBLIC GamID gate; only six public-safe fields", () => {
  const branch = fnOf(read("supabase/migrations/20261003234309_personal_gamid_crews.sql"));
  assert.match(branch, /join public\.crews c on c\.crew_id = cm\.crew_id and c\.game_key = cm\.game_key/);
  assert.match(branch, /join public\.crew_walls cw on cw\.crew_id = c\.crew_id and cw\.published/);
  assert.match(branch, /where cm\.entity_id = e\.entity_id and cm\.status = 'ACTIVE'/);
  assert.match(branch, /where members\.crew_id = c\.crew_id and members\.status = 'ACTIVE'/, "the member count counts ACTIVE members only (the same number the published Crew Wall shows)");
  assert.match(branch, /and e\.entity_type = 'SOLO'\n    and e\.visibility = 'PUBLIC'\n  limit 1;/, "the accepted outer gate");
  const crews = branch.slice(branch.indexOf("Automatic My Crew V1"));
  const object = crews.slice(crews.indexOf("select jsonb_agg(jsonb_build_object("), crews.indexOf(") order by g.display_name"));
  assert.deepEqual([...object.matchAll(/'([a-z_]+)', /g)].map(match => match[1]), ["crew_id", "crew_name", "game_key", "game_name", "role", "member_count"]);
  assert.doesNotMatch(branch.slice(branch.indexOf("Automatic My Crew V1")), /show_on|is_public|_visible|toggle =|invited_by|owner_entity_id/, "no toggle and no internal / invitation data");
  assert.doesNotMatch(read("supabase/migrations/20261003234309_personal_gamid_crews.sql"), /\bgrant\b|\brevoke\b|alter table|create table|drop /i, "grants, tables and RLS untouched");
});

// ---------- presentation ----------
const section = [
  { crew_id: ID, crew_name: "Espada", game_key: "league_of_legends", game_name: "League of Legends", role: "OWNER", member_count: 5 },
  { crew_id: ID2, crew_name: "Zero", game_key: "valorant", game_name: "Valorant", role: "MEMBER", member_count: 1 },
];

test("MY CREW: every qualifying Crew becomes a card - MY CREW, game, Crew name, OWNER / MEMBER, member count - linking to its published Crew Wall", () => {
  const block = crewsSection(section, { pathname: "/@black", doc });
  assert.equal(block.hidden, true, "shown only after the Intro (the page reveals it with the profile / Wall)");
  assert.match(block.textContent, /^MY CREWS/, "plural for several games");
  const cards = all(block, node => node.className === "public-crew-card");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].href, `/crew/?c=${ID}`);
  assert.equal(cards[1].href, `/crew/?c=${ID2}`);
  assert.match(cards[0].textContent, /MY CREW.*LEAGUE OF LEGENDS.*Espada.*OWNER.*5 members/);
  assert.match(cards[1].textContent, /VALORANT.*Zero.*MEMBER.*1 member›$/);
  const single = crewsSection([section[0]], { pathname: "/gamid-testing/public/index.html", doc });
  assert.match(single.textContent, /^MY CREW/);
  assert.equal(all(single, node => node.className === "public-crew-card")[0].href, `/gamid-testing/crew/?c=${ID}`, "the temporary route's crew/ folder");
});

test("MY CREW: only what the server sent, as text; malformed or unsafe entries are dropped; no section -> nothing rendered", () => {
  assert.equal(crewsSection(undefined, { doc }), null);
  assert.equal(crewsSection([], { doc }), null);
  const cleaned = publicCrews([...section, { crew_id: "x", crew_name: "Bad", game_name: "G", role: "OWNER" }, { crew_id: ID, crew_name: "<script>", game_name: "G", role: "OWNER" }, { crew_id: ID, crew_name: "Ok", game_name: "G", role: "ADMIN" }]);
  assert.deepEqual(cleaned.map(crew => crew.name), ["Espada", "Zero"]);
  assert.equal(publicCrews([{ ...section[0], member_count: "5" }])[0].members, null, "a non-numeric count is simply not shown");
});

test("public page wiring: MY CREW is added for every visitor of the GamID, after the profile body / published Wall, shown with the profile state; My Duo is untouched", () => {
  const page = read("dist/public/public.js");
  assert.match(page, /crewsBlock = crewsSection\(identity\.public_sections\?\.crews, \{ pathname: location\.pathname \}\);\n  if \(crewsBlock\) replayButton\.before\(crewsBlock\);/);
  assert.match(page, /if \(crewsBlock\) crewsBlock\.hidden = event\.data\.state !== "profile";/);
  assert.ok(page.indexOf("wall = createPublicWallView(") < page.indexOf("crewsBlock = crewsSection("), "inserted after the Wall host, so it sits below the Wall");
  assert.match(page, /hasSections = renderPublicSections\(sectionsPanel, identity\.public_sections, \{ ownerHandle: identity\.gamid_handle, pathname: location\.pathname, loadAvatar: loadPublicAvatar \}\) > 0;/, "My Duo presentation unchanged");
  const css = read("dist/public/public.css");
  assert.match(css, /\.public-shell\[data-mode="flow"\] \.public-crews\{grid-area:4\/1\}\n\.public-shell\[data-mode="flow"\] \.replay-button\{grid-area:5\/1\}/);
  assert.match(css, /html\.is-public-wall \.public-shell \.public-crews\{grid-area:2\/1\}\nhtml\.is-public-wall \.public-shell \.replay-button\{grid-area:3\/1;justify-self:start\}/);
  assert.doesNotMatch(css.slice(css.indexOf("/* MY CREW (public-crews.js)")), /white-space:\s*nowrap|text-overflow:\s*ellipsis/);
});
