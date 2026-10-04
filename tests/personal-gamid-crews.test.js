// MY CREW on the Personal GamID. The database rule (PUBLIC GamID + ACTIVE membership + existing Crew + PUBLISHED Crew Wall, automatic, no toggle) runs on TESTING in
// tests/integration/personal-gamid-crews-db.sql. These tests pin the recovered migration (20261003234309, recovered byte-for-byte from TESTING's migration history).
// The Wall's My Crew GamID block that presents it is pinned in tests/wall-crews-block.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

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
