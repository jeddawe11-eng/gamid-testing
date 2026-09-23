import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANGUAGES, MAX_LANGUAGES, MIC_VALUES, humanMic, maxSeatsForQueue, normalizeLanguages, queuesForExperience, validateDraft } from "../dist/play-together/domain.js";

const enabledQueue = { key:"aram_standard", experience_key:"aram", enabled:true, max_party_size:5 };

test("English is the default and the language cap is two",()=>{assert.deepEqual(DEFAULT_LANGUAGES,["en"]);assert.equal(MAX_LANGUAGES,2);});
test("language normalization removes duplicates and caps at two",()=>assert.deepEqual(normalizeLanguages(["EN","en","ar","fr"]),["en","ar"]));
test("mic values are canonical",()=>assert.deepEqual(MIC_VALUES,["REQUIRED","PREFERRED","NO_PREFERENCE"]));
test("mic labels are human readable",()=>assert.equal(humanMic("NO_PREFERENCE"),"No preference"));
test("ME seats are separate from official party capacity",()=>assert.equal(maxSeatsForQueue(enabledQueue),4));
test("unverified or disabled queues allow no seats",()=>assert.equal(maxSeatsForQueue({enabled:false,max_party_size:5}),0));
test("queues are selected through their structured experience key",()=>assert.deepEqual(queuesForExperience({queues:[enabledQueue,{key:"x",experience_key:"arena"}]},"aram"),[enabledQueue]));
test("valid draft passes",()=>assert.equal(validateDraft({queue:enabledQueue,regionKey:"sg2",seatsWanted:2,languageKeys:["en"],micPreference:"PREFERRED"}),null));
test("draft rejects disabled queue",()=>assert.match(validateDraft({queue:{enabled:false},regionKey:"sg2",seatsWanted:1,languageKeys:["en"],micPreference:"PREFERRED"}),/available/));
test("draft rejects missing region",()=>assert.match(validateDraft({queue:enabledQueue,regionKey:"",seatsWanted:1,languageKeys:["en"],micPreference:"PREFERRED"}),/region/));
test("draft rejects capacity overflow",()=>assert.match(validateDraft({queue:enabledQueue,regionKey:"sg2",seatsWanted:5,languageKeys:["en"],micPreference:"PREFERRED"}),/1–4/));
test("draft rejects missing languages",()=>assert.match(validateDraft({queue:enabledQueue,regionKey:"sg2",seatsWanted:1,languageKeys:[],micPreference:"PREFERRED"}),/languages/));
test("draft rejects unknown mic value",()=>assert.match(validateDraft({queue:enabledQueue,regionKey:"sg2",seatsWanted:1,languageKeys:["en"],micPreference:"AUTO"}),/mic/));
