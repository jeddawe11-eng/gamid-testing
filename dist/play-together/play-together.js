import { restoreSession, rpc, ApiError } from "../account/supabase-client.js";
import { DEFAULT_LANGUAGES, MAX_LANGUAGES, humanMic, maxSeatsForQueue, queuesForExperience, validateDraft } from "./domain.js";

const $ = id => document.getElementById(id);
let catalog = null;
let activeSession = null;

function show(name) {
  for (const id of ["loadingPanel","authPanel","activePanel","createPanel"]) $(id).hidden = id !== name;
}
function message(text, ok=false) { $("pageMessage").textContent=text; $("pageMessage").classList.toggle("success",ok); $("pageMessage").hidden=!text; }
function errorText(error) {
  const code = `${error?.code || ""} ${error?.message || ""}`;
  if (code.includes("ACTIVE_SESSION_EXISTS")) return "You already have an active Play Together session.";
  if (code.includes("INVALID_SEATS_WANTED")) return "Those seats exceed the selected queue's verified party limit.";
  if (code.includes("QUEUE_NOT_AVAILABLE")) return "That queue is not currently available for session creation.";
  if (code.includes("AUTH_REQUIRED") || error?.status === 401) return "Your session expired. Sign in again.";
  return error?.message || "Something went wrong.";
}
async function getCatalog() { const rows=await rpc("get_play_together_catalog"); return rows?.[0]?.catalog || null; }
async function getActive() { const rows=await rpc("get_my_active_play_together_session"); return rows?.[0] || null; }
function option(select, value, label, disabled=false) { const node=document.createElement("option"); node.value=value; node.textContent=label; node.disabled=disabled; select.append(node); }

function renderCatalog() {
  const exp=$("experienceSelect"), region=$("regionSelect"); exp.replaceChildren(); region.replaceChildren();
  option(exp,"","Choose an experience"); for (const item of catalog.experiences) option(exp,item.key,item.name);
  option(region,"","Choose a Riot region/server"); for (const item of catalog.regions) option(region,item.key,`${item.name} · ${item.platform_id}`);
  const choices=$("languageChoices"); choices.replaceChildren();
  for (const language of catalog.languages) {
    const label=document.createElement("label"), input=document.createElement("input"); input.type="checkbox"; input.name="language"; input.value=language.key; input.checked=DEFAULT_LANGUAGES.includes(language.key);
    input.addEventListener("change",()=>{ const checked=[...document.querySelectorAll('input[name="language"]:checked')]; if(checked.length>MAX_LANGUAGES){input.checked=false;message("Choose no more than two languages.");} else message(""); });
    label.append(input,document.createTextNode(language.name)); choices.append(label);
  }
  renderQueues();
}
function renderQueues() {
  const select=$("queueSelect"); select.replaceChildren(); option(select,"","Choose a mode / queue");
  for (const queue of queuesForExperience(catalog,$("experienceSelect").value)) option(select,queue.key,`${queue.name}${queue.enabled ? "" : ` · ${queue.availability}`}`,!queue.enabled);
  renderQueueRules();
}
function selectedQueue(){return catalog?.queues.find(queue=>queue.key===$("queueSelect").value)||null;}
function renderQueueRules(){
  const queue=selectedQueue(), seats=$("seatsSelect"); seats.replaceChildren();
  if(!queue){seats.disabled=true;option(seats,"","Choose a queue first");$("queueNote").textContent="";$("seatsHelp").textContent="Choose a queue first.";return;}
  $("queueNote").textContent=`${queue.availability} · Rule ${queue.rule_version}. ${queue.note}`;
  const max=maxSeatsForQueue(queue); seats.disabled=max<1; option(seats,"","Choose seats"); for(let i=1;i<=max;i++)option(seats,String(i),String(i));
  $("seatsHelp").textContent=max ? `You are 1 player. This queue allows up to ${max} additional player${max===1?"":"s"}; you do not need to fill every seat.` : "Creation is disabled until Riot party limits are officially verified.";
}
function renderActive(){
  const languageNames=new Map(catalog.languages.map(item=>[item.key,item.name]));
  const details=[["Game","League of Legends"],["Experience",activeSession.experience_name],["Mode / Queue",activeSession.queue_name],["Riot region",activeSession.region_name],["Seats wanted",activeSession.seats_wanted],["Languages",activeSession.language_keys.map(key=>languageNames.get(key)||key).join(", ")],["Mic",humanMic(activeSession.mic_preference)],["Rule version",activeSession.rule_version]];
  const dl=$("activeDetails"); dl.replaceChildren(); for(const [term,value] of details){const wrap=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=term;dd.textContent=value;wrap.append(dt,dd);dl.append(wrap);} show("activePanel");
}
async function refresh(){activeSession=await getActive(); if(activeSession)renderActive();else show("createPanel");}

$("experienceSelect").addEventListener("change",renderQueues); $("queueSelect").addEventListener("change",renderQueueRules);
$("createForm").addEventListener("submit",async event=>{
  event.preventDefault(); message(""); const queue=selectedQueue(); const languageKeys=[...document.querySelectorAll('input[name="language"]:checked')].map(input=>input.value);
  const draft={queue,regionKey:$("regionSelect").value,seatsWanted:Number($("seatsSelect").value),languageKeys,micPreference:document.querySelector('input[name="mic"]:checked')?.value};
  const invalid=validateDraft(draft); if(invalid){message(invalid);return;} $("createButton").disabled=true;
  try{await rpc("create_play_together_session",{candidate_queue_key:queue.key,candidate_region_key:draft.regionKey,candidate_seats_wanted:draft.seatsWanted,candidate_language_keys:languageKeys,candidate_mic_preference:draft.micPreference});await refresh();message("Session created.",true);}catch(error){message(errorText(error));}finally{$("createButton").disabled=false;}
});
$("cancelButton").addEventListener("click",async()=>{if(!activeSession)return; $("cancelButton").disabled=true;message("");try{await rpc("cancel_my_play_together_session",{candidate_session_id:activeSession.session_id});activeSession=null;show("createPanel");message("Session cancelled. You can create another one.",true);}catch(error){message(errorText(error));}finally{$("cancelButton").disabled=false;}});

(async()=>{try{const session=await restoreSession();if(!session){show("authPanel");return;}catalog=await getCatalog();if(!catalog)throw new ApiError("Play Together catalog is unavailable.",500,"CATALOG_UNAVAILABLE");renderCatalog();await refresh();}catch(error){show("authPanel");message(errorText(error));}})();
