import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {validateIntroSource,INTRO_MAX_DURATION_MS} from "../dist/account/domain.js";
import {validIntroDuration,encodeD3,probe} from "../worker/intro-worker.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const file={type:"video/mp4",size:1000};
for(const seconds of [.5,29.999,30,30.001,30.999,31,31.000001,31.001,32,NaN,Infinity,-1,0,.499])
test("Intro client/worker agree at "+seconds+" seconds",()=>{
 const expected=Number.isFinite(seconds)&&seconds>=.5&&seconds<=31;
 assert.equal(validIntroDuration(seconds),expected);
 assert.equal(validateIntroSource(file,seconds*1000).valid,expected);
});
test("metadata quantization cannot round an over-limit source down",async()=>{
 const account=await read("dist/account/account.js");
 assert.ok(account.includes("Math.ceil(video.duration * 1000)"));
 for(const seconds of [31.000001,31.0004,31.0009])
  assert.equal(validateIntroSource(file,Math.ceil(seconds*1000)).valid,false);
});
test("queue and completion use the same tolerance and retain security/ownership",async()=>{
 const sql=await read("supabase/migrations/20261007160000_intro_duration_tolerance.sql");
 assert.equal((sql.match(/candidate_duration_ms > 31000/g)||[]).length,2);
 assert.match(sql,/source_duration_ms between 500 and 31000/);
 assert.match(sql,/private\.usage_object_owned/);
 assert.equal((sql.match(/SECURITY DEFINER/g)||[]).length,2);
 assert.equal((sql.match(/SET search_path TO ''/g)||[]).length,2);
 assert.doesNotMatch(sql,/\bgrant\b|\brevoke\b|update storage\.buckets|delete from/i);
 assert.match(sql,/INTRO_SOURCE_NOT_FOUND/);
 assert.match(sql,/INTRO_DERIVATIVE_NOT_FOUND/);
 assert.match(sql,/INTRO_JOB_NOT_PROCESSING/);
});
test("display maximum stays 30 seconds and F5 lease stays 120 seconds",async()=>{
 assert.equal(INTRO_MAX_DURATION_MS,31000);
 assert.match(await read("dist/account/index.html"),/max 30 seconds/);
 assert.match(await read("dist/account/domain.js"),/between 0\.5 and 30 seconds/);
 assert.match(await read("dist/account/intro-source.js"),/INTRO_LEASE_SECONDS = 120/);
});
test("native processing accepts a 31-second synthetic source and rejects 31.1 before encoding",{timeout:60000},async()=>{
 const run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),"intro-boundary-"));
 try {
  for(const seconds of [30,31,31.1]){
   const input=join(dir,seconds+".mp4"),output=join(dir,seconds+".webm");
   await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-f","lavfi","-i","color=size=16x16:rate=10:duration="+seconds,"-c:v","libx264","-threads","1",input]);
   assert.ok(Math.abs((await probe(input)).duration-seconds)<.0001);
   if(seconds>31)await assert.rejects(encodeD3(input,output),/INVALID_SOURCE_DURATION/);
   else{
    const result=await encodeD3(input,output);
    assert.equal(result.source.duration,seconds);assert.equal(result.result.duration,seconds);
    assert.equal(result.result.video.codec_name,"vp9");assert.equal(result.result.audio,undefined);
   }
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
