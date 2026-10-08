import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {introFrameTimingMatches,encodeD3} from '../worker/intro-worker.mjs';
const run=promisify(execFile);
test('D3 permits only equivalent frame timelines despite nominal/average FPS metadata',()=>{
 assert.equal(introFrameTimingMatches([0,.033333,.070],[0,.033,.067],30),true);
 assert.equal(introFrameTimingMatches([4,4.033333,4.070],[0,.033,.067],30),true);
});
test('D3 rejects dropped/added frames, changed timing and unreadable timelines',()=>{
 for(const [a,b,fps] of [
  [[0,.033,.067],[0,.067],30],[[0,.033],[0,.033,.067],30],
  [[0,.033,.067],[0,.1,.2],30],[[0,.033],[0,NaN],30],
  [[],[],30],[[0,0],[0,0],30],[[0,.033],[0,.033],0],
  [[0,.033],[0,.033],Infinity],[[0,.033],[0,.033],NaN]
 ])assert.equal(introFrameTimingMatches(a,b,fps),false);
});
test('D3 keeps strict duration, geometry, codec, aspect and security guards',async()=>{
 const code=await readFile(new URL('../worker/intro-worker.mjs',import.meta.url),'utf8');
 for(const value of ['Math.abs(result.duration - source.duration) > .25','result.video.width !== geometry.width',
  'Math.abs(resultAspect / sourceAspect - 1) > .005','validIntroDuration(result.duration)',
  'worker_complete_intro_job','candidate_duration_ms:Math.ceil(result.duration*1000)',
  'if (!equivalent) throw new Error("D3_TIMING_OR_GEOMETRY_MISMATCH")'])assert.ok(code.includes(value),value);
});
const nativeAvailable=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{windowsHide:true}).status===0);
test('native fractional MP4 timing reproduces the old false rejection and encodes without dropped frames',
 {skip:!nativeAvailable,timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gamid-d3-timing-'));
 try{
  const input=join(dir,'source.mp4'),output=join(dir,'intro.webm');
  await run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-n','-f','lavfi','-i','color=c=blue:size=64x64:rate=30:duration=2',
   '-vf','setpts=PTS+if(eq(N\\,59)\\,0.004/TB\\,0)','-fps_mode','passthrough','-enc_time_base','1/90000','-c:v','libx264','-preset','ultrafast','-an',input]);
  const {source,result}=await encodeD3(input,output);
  assert.ok(Math.abs(result.fps-source.fps)>.02,'the old metadata check would reject this valid conversion');
  assert.deepEqual([result.video.width,result.video.height],[64,64]);
  const times=async path=>{const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=pts_time','-of','json',path]);return JSON.parse(stdout).packets.map(p=>Number(p.pts_time)).sort((a,b)=>a-b);};
  assert.equal(introFrameTimingMatches(await times(input),await times(output),30),true);
  assert.ok(Math.abs(result.duration-source.duration)<=.25);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('remote timing fixture is TESTING-only and never claims or alters an existing job',async()=>{
 const {smokeIntroFrameTiming}=await import('../worker/intro-timing-smoke.mjs');
 await assert.rejects(smokeIntroFrameTiming({url:'https://example.invalid'}),/TESTING_ONLY/);
 const code=await readFile(new URL('../worker/intro-timing-smoke.mjs',import.meta.url),'utf8');
 assert.ok(!code.includes('worker_claim_intro_job'));
 assert.ok(code.includes('latest_job_id!==job'));
 assert.ok(code.includes('intro.active_job_id!==job'));
 assert.ok(code.includes('(!queued||ready)'));
 const docker=await readFile(new URL('../worker/Dockerfile',import.meta.url),'utf8');
 assert.ok(docker.includes('COPY worker/intro-timing-smoke.mjs ./intro-timing-smoke.mjs'));
 const allowlist=await readFile(new URL('../worker/cloud-run/usage-testing.gcloudignore',import.meta.url),'utf8');
 assert.ok(allowlist.includes('!worker/intro-timing-smoke.mjs'));
});
