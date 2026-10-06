import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, truncate, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeD3, introDerivativeGeometry } from "../worker/intro-worker.mjs";
const run = promisify(execFile);
const worker = await readFile(new URL("../worker/intro-worker.mjs",import.meta.url),"utf8");
for (const [name,input,expected] of [
 ["4K landscape",[3840,2160],[1920,1080]],["4K portrait",[2160,3840],[1080,1920]],
 ["square",[2048,2048],[1080,1080]],["ultrawide",[3840,1600],[1920,800]],
 ["small",[576,1024],[576,1024]],["cap",[1920,1080],[1920,1080]],["odd",[641,481],[640,480]],
]) test("F2 "+name+": bounded shape and no upscale",()=>{
 const g=introDerivativeGeometry({width:input[0],height:input[1]});
 assert.deepEqual([g.width,g.height],expected); assert.ok(g.width<=input[0]&&g.height<=input[1]);
});
test("F2 orientation follows FFmpeg autorotation",()=>{
 const g=introDerivativeGeometry({width:3840,height:2160,side_data_list:[{rotation:90}]});
 assert.deepEqual([g.width,g.height],[1080,1920]);
});
test("F2 invalid geometry fails",()=>{
 for(const width of [0,-1,NaN,Infinity,1])assert.throws(()=>introDerivativeGeometry({width,height:100}),/INVALID_SOURCE_GEOMETRY/);
});
test("F2 preserves encoding, storage, timing and private job lifecycle",()=>{
 for(const value of ['"libvpx-vp9","-crf","40","-b:v","0"','"libopus","-b:a","32k"','"-pix_fmt","yuv420p"',
 'Math.abs(result.fps - source.fps) > .02','Math.abs(result.duration - source.duration) > .25',
 'const MAX_SOURCE_BYTES = 150 * 1024 * 1024','const MAX_OUTPUT_BYTES = 15 * 1024 * 1024',
 'worker_claim_intro_job','worker_complete_intro_job','worker_fail_intro_job','worker_intro_cleanup_candidates',
 'worker_confirm_intro_cleanup',"bucket:'intro-media'",'result.video.width !== geometry.width'])assert.ok(worker.includes(value),value);
 for(const value of ['"-r"','crop=','pad='])assert.ok(!worker.includes(value));
});
test("F2 native FFmpeg geometry, audio, alpha-input boundary and failures",
 {skip:process.env.F2_FFMPEG_TESTS!=="1",timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gamid-f2-"));
 const ff=async args=>run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-y",...args],{maxBuffer:4194304});
 try{
  for(const [name,size,fps,audio,dimensions] of [
   ["landscape","2560x1440",30,true,[1920,1080]],["portrait","1440x2560",24,false,[1080,1920]],["small","320x240",60,false,[320,240]]
  ]){
   const input=join(dir,name+".mp4"),output=join(dir,name+".webm");
   await ff(["-f","lavfi","-i","testsrc2=size="+size+":rate="+fps+":duration=0.6",...(audio?["-f","lavfi","-i","sine=duration=0.6"]:[]),
    "-c:v","libx264","-preset","ultrafast","-threads","2",...(audio?["-c:a","aac"]:[]),input]);
   const {source,result}=await encodeD3(input,output);
   assert.deepEqual([result.video.width,result.video.height],dimensions);
   assert.equal(result.video.codec_name,"vp9");assert.equal(result.video.pix_fmt,"yuv420p");
   assert.equal(Boolean(result.audio),audio);if(audio)assert.equal(result.audio.codec_name,"opus");
   assert.ok(Math.abs(result.duration-source.duration)<=.25);assert.ok(Math.abs(result.fps-fps)<=.02);assert.ok(result.size<15728640);
  }
  const rotated=join(dir,"rotated.mp4");
  const {stdout:version}=await run("ffmpeg",["-version"]);
  const rotationOptions=Number(version.match(/ffmpeg version (\d+)/)?.[1])>=6?["-display_rotation","90"]:[];
  await ff([...rotationOptions,"-i",join(dir,"small.mp4"),"-c","copy",...(rotationOptions.length?[]:["-metadata:s:v:0","rotate=90"]),rotated]);
  const rotatedResult=await encodeD3(rotated,join(dir,"rotated.webm"));
  assert.deepEqual([rotatedResult.result.video.width,rotatedResult.result.video.height],[240,320]);
  const sar=join(dir,"sar.mp4");
  await ff(["-f","lavfi","-i","testsrc2=size=2560x1440:duration=0.6","-vf","setsar=4/3","-c:v","libx264","-preset","ultrafast","-threads","2",sar]);
  const sarResult=await encodeD3(sar,join(dir,"sar.webm"));assert.equal(sarResult.result.video.sample_aspect_ratio,"4:3");
  const alpha=join(dir,"alpha.webm");
  await ff(["-f","lavfi","-i","color=red@0.25:size=320x240:duration=0.6,format=yuva420p","-c:v","libvpx-vp9","-threads","2","-pix_fmt","yuva420p",alpha]);
  // Existing Intro D3 is opaque, unlike the independent accepted Wall alpha path.
  const alphaResult=await encodeD3(alpha,join(dir,"alpha-d3.webm"));assert.equal(alphaResult.source.video.tags.alpha_mode,"1");assert.equal(alphaResult.result.video.pix_fmt,"yuv420p");assert.notEqual(alphaResult.result.video.tags?.alpha_mode,"1");
  const bad=join(dir,"bad");await writeFile(bad,"not media");await assert.rejects(encodeD3(bad,join(dir,"bad.webm")));
  const oversize=join(dir,"oversize");await writeFile(oversize,"");await truncate(oversize,157286401);
  await assert.rejects(encodeD3(oversize,join(dir,"oversize.webm")),/SOURCE_TOO_LARGE/);
  const short=join(dir,"short.mp4");
  await ff(["-f","lavfi","-i","color=size=64x64:duration=0.1","-c:v","libx264","-threads","2",short]);
  await assert.rejects(encodeD3(short,join(dir,"short.webm")),/INVALID_SOURCE_DURATION/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
