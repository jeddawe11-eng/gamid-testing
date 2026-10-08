// Explicit TESTING-only disposable processing acceptance fixture.
// Uses normal owner upload/queue and existing dispatcher; never claims a job.
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {uploadGatewayFile,deleteGatewayObject} from './usage-upload.mjs';
export async function smokeIntroFrameTiming(backend) {
 if(backend.url!=='https://upvtrczefcvigxdyuylw.supabase.co')throw Error('TESTING_ONLY');
 const dir=await mkdtemp(join(tmpdir(),'gamid-intro-timing-')),job=randomUUID();
 const service=backend.headers(),publicKey='sb_publishable_ovl-uegBzJlWPJcTF_dviw_6uf1aVYg';
 let owner,queued=false,ready=false,sourcePath,derivativePath;
 const call=async(path,headers,body,method='POST')=>{
  const response=await fetch(backend.url+path,{method,headers:{...headers,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Error('TIMING_FIXTURE_'+response.status+':'+(data.message||data.code||'ERROR'));return data;
 };
 try{
  const email='intro-timing-'+randomUUID()+'@example.invalid',password=randomBytes(32).toString('hex');
  owner=(await call('/auth/v1/admin/users',service,{email,password,email_confirm:true})).id;
  const session=await call('/auth/v1/token?grant_type=password',{apikey:publicKey},{email,password});
  const headers={apikey:publicKey,Authorization:'Bearer '+session.access_token};
  await call('/rest/v1/rpc/create_solo_identity',headers,{candidate_handle:'d3test'+job.replaceAll('-','').slice(0,12),candidate_display_name:'D3 TESTING fixture',candidate_date_of_birth:'1990-01-01',candidate_language:'en'});
  const input=join(dir,'source.mp4');
  await promisify(execFile)('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-n','-f','lavfi','-i','color=c=blue:size=64x64:rate=30:duration=2',
   '-vf','setpts=PTS+if(eq(N\\,59)\\,0.004/TB\\,0)','-fps_mode','passthrough','-enc_time_base','1/90000','-c:v','libx264','-preset','ultrafast','-an',input]);
  const {stdout}=await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','json',input]);
  const sourceDuration=Number(JSON.parse(stdout).format.duration),sourceBytes=(await stat(input)).size;
  sourcePath=owner+'/'+job+'/source.mp4';derivativePath=owner+'/'+job+'/intro-d3.webm';
  await uploadGatewayFile({backend:{url:backend.url,headers:()=>headers},bucket:'intro-sources',path:sourcePath,filePath:input,mime:'video/mp4'});
  queued=true; // Conservatively retain the fixture if a queue response is interrupted.
  await call('/rest/v1/rpc/queue_my_intro',headers,{candidate_job_id:job,candidate_source_path:sourcePath,candidate_transition:'fade',candidate_source_mime:'video/mp4',candidate_source_size:sourceBytes,candidate_duration_ms:Math.ceil(sourceDuration*1000)});
  let intro;
  for(let attempt=0;attempt<60;attempt++){
   [intro]=await call('/rest/v1/rpc/get_my_intro',headers,{});
   if(intro?.latest_job_id!==job)throw Error('TIMING_FIXTURE_JOB_ISOLATION');
   if(intro.latest_job_state==='failed')throw Error('TIMING_FIXTURE_FAILED:'+intro.latest_failure_code);
   if(intro.latest_job_state==='ready'){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  if(!ready||intro.active_job_id!==job||intro.active_state!=='ready'||intro.active_derivative_path!==derivativePath)throw Error('TIMING_FIXTURE_NOT_READY');
  return {ok:true,jobId:job,ownerId:owner,sourceBytes,sourceDuration,activeDurationMs:intro.active_duration_ms,latestState:intro.latest_job_state,activeState:intro.active_state};
 }finally{
  // Keep a timed-out processing fixture intact for diagnosis; never delete under a running worker.
  if(owner&&(!queued||ready)){
   for(const [bucket,path] of [['intro-sources',sourcePath],['intro-media',derivativePath]])if(path)await deleteGatewayObject(backend,bucket,path);
   await call('/auth/v1/admin/users/'+owner,service,undefined,'DELETE');
  }
  await rm(dir,{recursive:true,force:true});
 }
}
