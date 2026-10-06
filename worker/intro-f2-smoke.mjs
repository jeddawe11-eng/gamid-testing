import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const run=promisify(execFile);
// Deployment-only native fixture check. Never contacts Supabase or claims a real job.
export async function smokeIntroDerivative(encode) {
 const dir=await mkdtemp(join(tmpdir(),"gamid-f2-smoke-")),results=[];
 try {
  for(const [name,size,fps,audio,dimensions] of [
   ["landscape","2560x1440",30,true,[1920,1080]],
   ["portrait","1440x2560",24,false,[1080,1920]],
   ["small","320x240",60,false,[320,240]]
  ]){
   const input=join(dir,name+".mp4"),output=join(dir,name+".webm");
   await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-n","-f","lavfi","-i","testsrc2=size="+size+":rate="+fps+":duration=0.6",
    ...(audio?["-f","lavfi","-i","sine=duration=0.6"]:[]),"-c:v","libx264","-preset","ultrafast","-threads","2",...(audio?["-c:a","aac"]:[]),input]);
   const {source,result}=await encode(input,output);
   assert.deepEqual([result.video.width,result.video.height],dimensions);
   assert.equal(result.video.codec_name,"vp9");assert.equal(Boolean(result.audio),audio);
   if(audio)assert.equal(result.audio.codec_name,"opus");
   assert.ok(Math.abs(result.fps-fps)<.02&&Math.abs(result.duration-source.duration)<.25);
   results.push({name,width:result.video.width,height:result.video.height,fps:result.fps,duration:result.duration,bytes:result.size,audio:result.audio?.codec_name||null});
  }
  const {stdout}=await run("ffmpeg",["-version"]);
  return {ok:true,workerSha256:createHash("sha256").update(await readFile(new URL("./intro-worker.mjs",import.meta.url))).digest("hex"),
    smokeSha256:createHash("sha256").update(await readFile(new URL("./intro-f2-smoke.mjs",import.meta.url))).digest("hex"),ffmpeg:stdout.split("\n")[0],results};
 }finally{await rm(dir,{recursive:true,force:true});}
}
