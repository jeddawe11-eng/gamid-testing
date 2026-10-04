import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {experiencesForGame,regionsForGame,positionsForGame,queuesForExperience,maxSeatsForQueue,validateDraft} from "../dist/play-together/domain.js";
const catalog={experiences:[{key:"sr",game_key:"league_of_legends"},{key:"mr_standard",game_key:"marvel_rivals"}],regions:[{key:"sg2",game_key:"league_of_legends"},{key:"mr_singapore",game_key:"marvel_rivals"}],positions:[{key:"top",game_key:"league_of_legends",experience_key:"sr"}],queues:[{key:"sr_draft",experience_key:"sr"},{key:"mr_quick_match",experience_key:"mr_standard",enabled:true,max_party_size:6},{key:"mr_competitive",experience_key:"mr_standard",enabled:false}]};
test("each game gets only its own experiences, queues, regions and positions",()=>{
 assert.deepEqual(experiencesForGame(catalog,"marvel_rivals").map(x=>x.key),["mr_standard"]);
 assert.deepEqual(regionsForGame(catalog,"marvel_rivals").map(x=>x.key),["mr_singapore"]);
 assert.deepEqual(positionsForGame(catalog,"marvel_rivals","mr_standard"),[]);
 assert.equal(positionsForGame(catalog,"league_of_legends","sr").length,1);
 assert.deepEqual(queuesForExperience(catalog,"mr_standard").map(x=>x.key),["mr_quick_match","mr_competitive"]);
 assert.deepEqual(regionsForGame(catalog,"unknown"),[]);
});
test("Quick Match has six total slots; Competitive cannot create an intent",()=>{
 const q=catalog.queues[1];assert.equal(maxSeatsForQueue(q),5);assert.equal(maxSeatsForQueue(q,4),2);
 const draft={queue:q,regionKey:"mr_singapore",seatsWanted:5,languageKeys:["en"],micPreference:"PREFERRED"};
 assert.equal(validateDraft(draft),null);assert.match(validateDraft({...draft,seatsWanted:6}),/seats/);
 assert.match(validateDraft({...draft,queue:catalog.queues[2]}),/available queue/);
});
test("game switching resets dependent fields; saved setup and avoidance retain the selected game's identity",()=>{
 const js=readFileSync(new URL("../dist/play-together/play-together.js",import.meta.url),"utf8");
 assert.match(js,/gameSelect.*addEventListener\("change",renderGame\)/);
 assert.match(js,/\$\("gameSelect"\).value=last.game_key;renderGame\(\)/);
 assert.match(js,/candidate_game_key:gameKey/);
 assert.match(js,/setAvoid\(item.entity_id,false,item.game_key\)/);
 assert.doesNotMatch(js,/candidate_game_key:"league_of_legends"/);
});
